// Reads an SDP offer from OFFER env var, captures the screen via libwebrtc's
// native DesktopCapturer, feeds frames into a NativeVideoSource/RtcVideoTrack,
// wires up the same 5 negotiated data channels for input, writes the SDP
// answer to answer.txt.

use std::{env, fs, io::Write, sync::Arc, time::Duration};

use anyhow::{Context, Result};
use enigo::{Axis, Button, Coordinate, Direction, Enigo, Keyboard, Mouse, Settings};
use tokio::sync::{mpsc, Mutex};

use libwebrtc::{
    data_channel::{DataBuffer, DataChannel, DataChannelInit},
    desktop_capturer::{
        CaptureError, DesktopCapturer, DesktopCapturerOptions, DesktopCaptureSourceType,
    },
    native::yuv_helper::argb_to_i420,
    peer_connection::{AnswerOptions, IceGatheringState, PeerConnection},
    peer_connection_factory::{
        native::PeerConnectionFactoryExt, PeerConnectionFactory, RtcConfiguration,
    },
    session_description::{SdpType, SessionDescription},
    video_frame::{I420Buffer, VideoFrame, VideoRotation},
    video_source::{native::NativeVideoSource, VideoResolution},
};

mod keymap;
use keymap::code_index_to_key;

const WIDTH: u32 = 1920;
const HEIGHT: u32 = 1080;

#[tokio::main]
async fn main() -> Result<()> {
    let offer_sdp = env::var("OFFER").context("OFFER env var not set")?;

    let factory = PeerConnectionFactory::default();
    let pc = factory
        .create_peer_connection(RtcConfiguration::default())
        .map_err(|e| anyhow::anyhow!("{e:?}"))
        .context("failed to create peer connection")?;

    let enigo = Arc::new(Mutex::new(Enigo::new(&Settings::default())?));
    register_input_channels(&pc, enigo)?;
    start_screen_track(&factory, &pc)?;

    // --- wait for ICE gathering to finish before writing the answer (non-trickle) ---
    let (gather_tx, mut gather_rx) = mpsc::unbounded_channel::<()>();
    pc.on_ice_gathering_state_change(Some(Box::new(move |state| {
        if state == IceGatheringState::Complete {
            let _ = gather_tx.send(());
        }
    })));

    let offer = SessionDescription::parse(&offer_sdp, SdpType::Offer)
        .map_err(|e| anyhow::anyhow!("{e}"))
        .context("failed to parse offer SDP")?;

    pc.set_remote_description(offer).await.map_err(|e| anyhow::anyhow!("{e:?}"))?;
    let answer = pc
        .create_answer(AnswerOptions::default())
        .await
        .map_err(|e| anyhow::anyhow!("{e:?}"))?;
    pc.set_local_description(answer).await.map_err(|e| anyhow::anyhow!("{e:?}"))?;

    let _ = gather_rx.recv().await;

    let local_desc = pc
        .current_local_description()
        .context("no local description after gathering")?;
    let sdp_text = local_desc.to_string();

    let mut f = fs::File::create("answer.txt")?;
    f.write_all(sdp_text.as_bytes())?;
    println!("Wrote answer SDP to answer.txt ({} bytes)", sdp_text.len());

    tokio::signal::ctrl_c().await?;
    pc.close();
    Ok(())
}

/// Starts the native screen capturer and pumps frames into a video track
/// added to the peer connection.
fn start_screen_track(factory: &PeerConnectionFactory, pc: &PeerConnection) -> Result<()> {
    let source = NativeVideoSource::new(
        VideoResolution { width: WIDTH, height: HEIGHT },
        true, // is_screencast
    );
    let track = factory.create_video_track("screen", source.clone());
    pc.add_track(track.into(), &["screen-stream"]).map_err(|e| anyhow::anyhow!("{e:?}"))?;

    let mut options = DesktopCapturerOptions::new(DesktopCaptureSourceType::Screen);
    options.set_include_cursor(true);

    let mut capturer =
        DesktopCapturer::new(options).context("failed to create DesktopCapturer")?;

    let source_for_cb = source.clone();
    capturer.start_capture(None, move |result| {
        let frame = match result {
            Ok(f) => f,
            Err(CaptureError::Temporary) => return,
            Err(CaptureError::Permanent) => {
                eprintln!("desktop capture failed permanently");
                return;
            }
        };

        let width = frame.width() as u32;
        let height = frame.height() as u32;
        let mut i420 = I420Buffer::new(width, height);

        {
            let (stride_y, stride_u, stride_v) = i420.strides();
            let (dst_y, dst_u, dst_v) = i420.data_mut();
            argb_to_i420(
                frame.data(),
                frame.stride(),
                dst_y,
                stride_y,
                dst_u,
                stride_u,
                dst_v,
                stride_v,
                width as i32,
                height as i32,
            );
        }

        source_for_cb.capture_frame(&VideoFrame::new(VideoRotation::VideoRotation0, i420));
    });

    // Drive the capture loop at ~30fps on a dedicated OS thread (DesktopCapturer
    // isn't proven Send/async-friendly here, so keep it off the tokio runtime).
    std::thread::spawn(move || loop {
        capturer.capture_frame();
        std::thread::sleep(Duration::from_millis(33));
    });

    Ok(())
}

/// Mirrors the client's `negotiated: true` channels exactly — same id,
/// same `ordered`/`max_retransmits`, so both sides agree without needing
/// `on_data_channel`.
fn register_input_channels(pc: &PeerConnection, enigo: Arc<Mutex<Enigo>>) -> Result<()> {
    let specs: [(&str, DataChannelInit); 5] = [
        ("pointer-movement", DataChannelInit { ordered: false, max_retransmits: Some(0), negotiated: true, id: 0, ..Default::default() }),
        ("pointer-click",    DataChannelInit { ordered: true, negotiated: true, id: 1, ..Default::default() }),
        ("keyboard-type",    DataChannelInit { ordered: true, negotiated: true, id: 2, ..Default::default() }),
        ("screen-resize",    DataChannelInit { negotiated: true, id: 3, ..Default::default() }),
        ("pointer-scroll",   DataChannelInit { ordered: false, max_retransmits: Some(0), negotiated: true, id: 4, ..Default::default() }),
    ];

    let handlers: [fn(Arc<Mutex<Enigo>>, Vec<u8>); 5] = [
        handle_pointer_movement,
        handle_pointer_click,
        handle_keyboard,
        handle_screen_resize,
        handle_pointer_scroll,
    ];

    for ((label, init), handler) in specs.into_iter().zip(handlers) {
        let dc = pc
            .create_data_channel(label, init)
            .map_err(|e| anyhow::anyhow!("{e:?}"))
            .with_context(|| format!("failed to create data channel {label}"))?;
        on_message(dc, enigo.clone(), handler);
    }

    Ok(())
}

fn on_message(dc: DataChannel, enigo: Arc<Mutex<Enigo>>, handler: fn(Arc<Mutex<Enigo>>, Vec<u8>)) {
    dc.on_message(Some(Box::new(move |buf: DataBuffer| {
        handler(enigo.clone(), buf.data.to_vec());
    })));
    // Keep the channel alive for the life of the process.
    std::mem::forget(dc);
}

// --- pointer-movement: 4 bytes relative (i16,i16) or 8 bytes absolute (u32,u32) ---
fn handle_pointer_movement(enigo: Arc<Mutex<Enigo>>, data: Vec<u8>) {
    tokio::spawn(async move {
        let mut enigo = enigo.lock().await;
        match data.len() {
            4 => {
                let dx = i16::from_le_bytes([data[0], data[1]]) as i32;
                let dy = i16::from_le_bytes([data[2], data[3]]) as i32;
                let _ = enigo.move_mouse(dx, dy, Coordinate::Rel);
            }
            8 => {
                let x = u32::from_le_bytes([data[0], data[1], data[2], data[3]]) as i32;
                let y = u32::from_le_bytes([data[4], data[5], data[6], data[7]]) as i32;
                let _ = enigo.move_mouse(x, y, Coordinate::Abs);
            }
            n => eprintln!("pointer-movement: unexpected packet size {n}"),
        }
    });
}

// --- pointer-click: byte0 isDown, byte1 PointerEvent.button ---
fn handle_pointer_click(enigo: Arc<Mutex<Enigo>>, data: Vec<u8>) {
    if data.len() < 2 {
        return;
    }
    let is_down = data[0] == 1;
    let button = match data[1] {
        0 => Button::Left,
        1 => Button::Middle,
        2 => Button::Right,
        3 => Button::Back,
        4 => Button::Forward,
        b => {
            eprintln!("pointer-click: unknown button {b}");
            return;
        }
    };
    tokio::spawn(async move {
        let mut enigo = enigo.lock().await;
        let dir = if is_down { Direction::Press } else { Direction::Release };
        let _ = enigo.button(button, dir);
    });
}

// --- keyboard-type: byte0 isDown, byte1 index into codeMap.json ---
fn handle_keyboard(enigo: Arc<Mutex<Enigo>>, data: Vec<u8>) {
    if data.len() < 2 {
        return;
    }
    let is_down = data[0] == 1;
    let code_index = data[1];
    let Some(key) = code_index_to_key(code_index) else {
        eprintln!("keyboard-type: no mapping for code index {code_index}");
        return;
    };
    tokio::spawn(async move {
        let mut enigo = enigo.lock().await;
        let dir = if is_down { Direction::Press } else { Direction::Release };
        let _ = enigo.key(key, dir);
    });
}

// --- screen-resize: u32 width, u32 height (little endian) ---
fn handle_screen_resize(_enigo: Arc<Mutex<Enigo>>, data: Vec<u8>) {
    if data.len() < 8 {
        return;
    }
    let width = u32::from_le_bytes([data[0], data[1], data[2], data[3]]);
    let height = u32::from_le_bytes([data[4], data[5], data[6], data[7]]);
    println!("screen-resize: {width}x{height} (not wired to a display resize yet)");
}

// --- pointer-scroll: f32 deltaX, f32 deltaY, f32 deltaZ (deltaZ unused) ---
fn handle_pointer_scroll(enigo: Arc<Mutex<Enigo>>, data: Vec<u8>) {
    if data.len() < 12 {
        return;
    }
    let delta_x = f32::from_le_bytes([data[0], data[1], data[2], data[3]]);
    let delta_y = f32::from_le_bytes([data[4], data[5], data[6], data[7]]);
    tokio::spawn(async move {
        let mut enigo = enigo.lock().await;
        if delta_x.abs() > 0.0 {
            let _ = enigo.scroll(delta_x.round() as i32, Axis::Horizontal);
        }
        if delta_y.abs() > 0.0 {
            let _ = enigo.scroll(delta_y.round() as i32, Axis::Vertical);
        }
        tokio::time::sleep(Duration::from_millis(1)).await;
    });
}
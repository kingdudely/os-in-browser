from os import environ
from json import load
from urllib.parse import urlparse
from aiortc import RTCPeerConnection, RTCSessionDescription, RTCCertificate
from aiortc.contrib.media import MediaPlayer
from cryptography import x509
from cryptography.hazmat.primitives.serialization import load_pem_private_key
from struct import unpack
from sys import platform
import asyncio

match platform:
    case "linux":
        media_format = "x11grab"
        DISPLAY = environ["DISPLAY"]

    case "darwin":
        media_format = "avfoundation"
        DISPLAY = "Capture screen 0"

    case "win32":
        media_format = "gdigrab"
        DISPLAY = "desktop"

    case _:
        raise RuntimeError(f"Unsupported platform: {platform}")


def get_screenshare(**options):
    return MediaPlayer(DISPLAY, format=media_format, options=options)


def import_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return load(f)


def load_certificate(cert_pem_path: str, key_pem_path: str) -> RTCCertificate:
    with open(cert_pem_path, "rb") as f:
        cert = x509.load_pem_x509_certificate(f.read())
    with open(key_pem_path, "rb") as f:
        key = load_pem_private_key(f.read(), password=None)
    return RTCCertificate(key, cert)


# ── Input handlers ────────────────────────────────────────────────────────────

def handle_pointer_movement(data: bytes):
    if len(data) == 4:
        x, y = unpack("<hh", data)
        print(f"[pointer-movement] relative  dx={x} dy={y}")
    elif len(data) == 8:
        x, y = unpack("<II", data)
        print(f"[pointer-movement] absolute  x={x} y={y}")

def handle_pointer_click(data: bytes):
    is_down, button = unpack("<BB", data)
    print(f"[pointer-click] button={button} {'down' if is_down else 'up'}")

def handle_keyboard(data: bytes):
    is_down, code_index = unpack("<BB", data)
    print(f"[keyboard] code_index={code_index} {'down' if is_down else 'up'}")

def handle_screen_resize(data: bytes):
    width, height = unpack("<II", data)
    print(f"[screen-resize] {width}x{height}")

def handle_pointer_scroll(data: bytes):
    dx, dy, dz = unpack("<fff", data)
    print(f"[pointer-scroll] dx={dx:.1f} dy={dy:.1f} dz={dz:.1f}")


# ── Core connection logic ─────────────────────────────────────────────────────

PAGE_OFFER = environ["PAGE_OFFER"]

async def run():
    constants = import_json("constants.json")
    password             = constants["password"]
    username_fragment    = constants["usernameFragment"]
    workflow_fingerprint = constants["workflowFingerprint"]

    certificate = load_certificate("cert.pem", "key.pem")
    pc = RTCPeerConnection(certificate=certificate)

    # ── Media ─────────────────────────────────────────────────────────────────
    player = get_screenshare(framerate="30", video_size="1920x1080")

    if player.audio:
        pc.addTrack(player.audio)
    if player.video:
        pc.addTrack(player.video)

    # ── Data channels ─────────────────────────────────────────────────────────
    pointer_movement_channel = pc.createDataChannel(
        "pointer-movement", negotiated=True, id=0, ordered=False, maxRetransmits=0
    )
    pointer_click_channel = pc.createDataChannel(
        "pointer-click", negotiated=True, id=1, ordered=True
    )
    keyboard_channel = pc.createDataChannel(
        "keyboard-type", negotiated=True, id=2, ordered=True
    )
    screen_resize_channel = pc.createDataChannel(
        "screen-resize", negotiated=True, id=3, ordered=False
    )
    pointer_scroll_channel = pc.createDataChannel(
        "pointer-scroll", negotiated=True, id=4, ordered=False, maxRetransmits=0
    )

    pointer_movement_channel.on("message", handle_pointer_movement)
    pointer_click_channel.on("message", handle_pointer_click)
    keyboard_channel.on("message", handle_keyboard)
    screen_resize_channel.on("message", handle_screen_resize)
    pointer_scroll_channel.on("message", handle_pointer_scroll)

    # ── ICE / srflx ───────────────────────────────────────────────────────────
    runner_srflx = asyncio.Future()

    @pc.on("icecandidate")
    def on_ice_candidate(candidate):
        if candidate and candidate.type == "srflx" and not runner_srflx.done():
            print(f"Runner address: {candidate.ip}:{candidate.port}")
            runner_srflx.set_result(f"{candidate.ip}:{candidate.port}")

    # ── SDP handshake ─────────────────────────────────────────────────────────
    parsed = urlparse(f"http://{PAGE_OFFER}")
    browser_address = parsed.hostname
    browser_port = parsed.port

    common_ice_lines = [
        f"c=IN IP4 {browser_address}",
        f"a=ice-ufrag:{username_fragment}",
        f"a=ice-pwd:{password}",
        f"a=fingerprint:sha-256 {workflow_fingerprint}",
        "a=setup:passive",
        f"a=candidate:0 1 UDP 1686052607 {browser_address} {browser_port} typ srflx",
    ]

    offer_sdp = "\r\n".join([
        "v=0",
        "o=- 0 0 IN IP4 0.0.0.0",
        "s=-",
        "t=0 0",
        "a=group:BUNDLE 0 1 2",

        "m=audio 9 UDP/TLS/RTP/SAVPF 111",
        *common_ice_lines,
        "a=recvonly",
        "a=mid:0",
        "a=rtcp-mux",
        "a=rtpmap:111 opus/48000/2",

        "m=video 9 UDP/TLS/RTP/SAVPF 102",
        *common_ice_lines,
        "a=recvonly",
        "a=mid:1",
        "a=rtcp-mux",
        "a=rtpmap:102 H264/90000",

        "m=application 9 UDP/DTLS/SCTP webrtc-datachannel",
        *common_ice_lines,
        "a=mid:2",
        "a=sctp-port:5000",
        "a=max-message-size:262144",
        "",
    ])

    await pc.setRemoteDescription(RTCSessionDescription(sdp=offer_sdp, type="offer"))
    answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)

    await runner_srflx  # wait until we've printed the address for the user

    try:
        await asyncio.get_event_loop().create_future()
    except (KeyboardInterrupt, asyncio.CancelledError):
        pass
    finally:
        await pc.close()


if __name__ == "__main__":
    asyncio.run(run())
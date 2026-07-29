import dev.onvoid.webrtc.*;
import dev.onvoid.webrtc.media.video.*;
import dev.onvoid.webrtc.media.video.desktop.DesktopSource;
import dev.onvoid.webrtc.media.video.desktop.ScreenCapturer;

import java.awt.AWTException;
import java.awt.Robot;
import java.awt.event.KeyEvent;
import java.io.FileWriter;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/**
 * Reads an SDP offer from the OFFER env var, captures the screen, feeds
 * frames into a video track, wires up 5 negotiated data channels for
 * input (mirroring the Rust agent's protocol), writes the SDP answer to
 * answer.txt.
 */
public class Main {

    private static final int WIDTH = 1920;
    private static final int HEIGHT = 1080;

    public static void main(String[] args) throws Exception {
        String offerSdp = System.getenv("OFFER");
        if (offerSdp == null || offerSdp.isEmpty()) {
            throw new IllegalStateException("OFFER env var not set");
        }

        Robot robot = new Robot();

        PeerConnectionFactory factory = new PeerConnectionFactory();

        RTCConfiguration config = new RTCConfiguration();
        // Add STUN/TURN servers here if needed:
        RTCIceServer ice = new RTCIceServer();
        ice.urls.add("stun:stun.l.google.com:19302");
        config.iceServers.add(ice);

        CountDownLatch gatherLatch = new CountDownLatch(1);

        PeerConnectionObserver pcObserver = new PeerConnectionObserver() {
            @Override
            public void onIceGatheringChange(RTCIceGatheringState state) {
                if (state == RTCIceGatheringState.COMPLETE) {
                    gatherLatch.countDown();
                }
            }

            @Override
            public void onIceCandidate(RTCIceCandidate candidate) {
                // Non-trickle: candidates are embedded in the SDP once
                // gathering completes, so nothing to do here.
            }

            @Override
            public void onDataChannel(RTCDataChannel dataChannel) {
                // Not expected: our channels are all negotiated=true,
                // so both sides create them locally instead of relying
                // on this callback.
            }

            @Override
            public void onTrack(RTCRtpTransceiver transceiver) {
            }

            @Override
            public void onConnectionChange(RTCPeerConnectionState state) {
                System.out.println("Connection state: " + state);
            }

            @Override
            public void onIceConnectionChange(RTCIceConnectionState state) {
            }

            @Override
            public void onSignalingChange(RTCSignalingState state) {
            }

            @Override
            public void onRenegotiationNeeded() {
            }
        };

        RTCPeerConnection pc = factory.createPeerConnection(config, pcObserver);

        registerInputChannels(pc, robot);
        startScreenTrack(factory, pc);

        // --- set remote offer, create+set local answer ---
        RTCSessionDescription offer =
                new RTCSessionDescription(RTCSdpType.OFFER, offerSdp);

        CountDownLatch remoteSetLatch = new CountDownLatch(1);
        pc.setRemoteDescription(offer, new SetSessionDescriptionObserver() {
            @Override
            public void onSuccess() {
                remoteSetLatch.countDown();
            }

            @Override
            public void onFailure(String error) {
                System.err.println("setRemoteDescription failed: " + error);
                remoteSetLatch.countDown();
            }
        });
        remoteSetLatch.await();

        RTCAnswerOptions answerOptions = new RTCAnswerOptions();
        CountDownLatch answerCreatedLatch = new CountDownLatch(1);

        pc.createAnswer(answerOptions, new CreateSessionDescriptionObserver() {
            @Override
            public void onSuccess(RTCSessionDescription answer) {
                pc.setLocalDescription(answer, new SetSessionDescriptionObserver() {
                    @Override
                    public void onSuccess() {
                        answerCreatedLatch.countDown();
                    }

                    @Override
                    public void onFailure(String error) {
                        System.err.println("setLocalDescription failed: " + error);
                        answerCreatedLatch.countDown();
                    }
                });
            }

            @Override
            public void onFailure(String error) {
                System.err.println("createAnswer failed: " + error);
                answerCreatedLatch.countDown();
            }
        });
        answerCreatedLatch.await();

        // Wait for ICE gathering to finish before writing the answer
        // (non-trickle), same as the Rust version. Bail out after 10s
        // so we don't hang forever if gathering stalls.
        gatherLatch.await(10, TimeUnit.SECONDS);

        RTCSessionDescription localDesc = pc.getLocalDescription();
        try (FileWriter fw = new FileWriter("answer.txt")) {
            fw.write(localDesc.sdp);
        }
        System.out.println("Wrote answer SDP to answer.txt (" + localDesc.sdp.length() + " bytes)");

        // Keep the process alive; Ctrl+C to exit.
        Runtime.getRuntime().addShutdownHook(new Thread(pc::close));
        Thread.currentThread().join();
    }

    /**
     * Starts native desktop capture and pumps frames into a video track
     * added to the peer connection.
     */
    private static void startScreenTrack(PeerConnectionFactory factory, RTCPeerConnection pc) {
        // Enumerate screens and pick the first one. ScreenCapturer is only
        // used here for source discovery -- capture itself is driven by
        // VideoDesktopSource once we hand it a sourceId.
        ScreenCapturer screenCapturer = new ScreenCapturer();
        List<DesktopSource> screens = screenCapturer.getDesktopSources();
        screenCapturer.dispose();

        if (screens.isEmpty()) {
            throw new IllegalStateException("no screen sources available for capture");
        }
        DesktopSource primaryScreen = screens.get(0);

        VideoDesktopSource videoSource = new VideoDesktopSource();
        videoSource.setFrameRate(30);
        videoSource.setMaxFrameSize(WIDTH, HEIGHT);
        videoSource.setSourceId(primaryScreen.id, false); // false = screen, not window
        videoSource.start();

        VideoTrack videoTrack = factory.createVideoTrack("screen", videoSource);
        pc.addTrack(videoTrack, List.of("screen-stream"));

        // NOTE: videoSource/videoTrack are kept alive for the life of the
        // process (never GC'd/disposed) since the peer connection holds
        // a reference via addTrack; call videoSource.stop()/dispose() on
        // shutdown if you add cleanup later.
    }

    /**
     * Mirrors the client's negotiated:true channels exactly -- same id,
     * same ordered/maxRetransmits, so both sides agree without needing
     * onDataChannel.
     */
    private static void registerInputChannels(RTCPeerConnection pc, Robot robot) {
        registerChannel(pc, "pointer-movement", false, 0, 0,
                data -> handlePointerMovement(robot, data));
        registerChannel(pc, "pointer-click", true, -1, 1,
                data -> handlePointerClick(robot, data));
        registerChannel(pc, "keyboard-type", true, -1, 2,
                data -> handleKeyboard(robot, data));
        registerChannel(pc, "screen-resize", true, -1, 3,
                Main::handleScreenResize);
        registerChannel(pc, "pointer-scroll", false, 0, 4,
                data -> handlePointerScroll(robot, data));
    }

    private interface ByteHandler {
        void handle(byte[] data);
    }

    private static void registerChannel(RTCPeerConnection pc, String label,
                                         boolean ordered, int maxRetransmits, int id,
                                         ByteHandler handler) {
        RTCDataChannelInit init = new RTCDataChannelInit();
        init.ordered = ordered;
        init.negotiated = true;
        init.id = id;
        if (maxRetransmits >= 0) {
            init.maxRetransmits = maxRetransmits;
        }

        RTCDataChannel channel = pc.createDataChannel(label, init);
        channel.registerObserver(new RTCDataChannelObserver() {
            @Override
            public void onBufferedAmountChange(long previousAmount) {
            }

            @Override
            public void onStateChange() {
            }

            @Override
            public void onMessage(RTCDataChannelBuffer buffer) {
                byte[] data = new byte[buffer.data.remaining()];
                buffer.data.get(data);
                handler.handle(data);
            }
        });
    }

    // --- pointer-movement: 4 bytes relative (i16,i16) or 8 bytes absolute (u32,u32) ---
    private static void handlePointerMovement(Robot robot, byte[] data) {
        ByteBuffer buf = ByteBuffer.wrap(data).order(ByteOrder.LITTLE_ENDIAN);
        if (data.length == 4) {
            short dx = buf.getShort();
            short dy = buf.getShort();
            java.awt.Point p = java.awt.MouseInfo.getPointerInfo().getLocation();
            robot.mouseMove(p.x + dx, p.y + dy);
        } else if (data.length == 8) {
            int x = buf.getInt();
            int y = buf.getInt();
            robot.mouseMove(x, y);
        } else {
            System.err.println("pointer-movement: unexpected packet size " + data.length);
        }
    }

    // --- pointer-click: byte0 isDown, byte1 button index ---
    private static void handlePointerClick(Robot robot, byte[] data) {
        if (data.length < 2) return;
        boolean isDown = data[0] == 1;
        int mask;
        switch (data[1]) {
            case 0: mask = java.awt.event.InputEvent.BUTTON1_DOWN_MASK; break;
            case 1: mask = java.awt.event.InputEvent.BUTTON2_DOWN_MASK; break;
            case 2: mask = java.awt.event.InputEvent.BUTTON3_DOWN_MASK; break;
            default:
                System.err.println("pointer-click: unknown button " + data[1]);
                return;
        }
        if (isDown) {
            robot.mousePress(mask);
        } else {
            robot.mouseRelease(mask);
        }
    }

    // --- keyboard-type: byte0 isDown, byte1 index into codeMap.json ---
    private static void handleKeyboard(Robot robot, byte[] data) {
        if (data.length < 2) return;
        boolean isDown = data[0] == 1;
        int codeIndex = data[1] & 0xFF;
        int vk = CODE_MAP[codeIndex];
        if (vk == KeyEvent.VK_UNDEFINED) {
            System.err.println("keyboard-type: no mapping for code index " + codeIndex);
            return;
        }
        if (isDown) {
            robot.keyPress(vk);
        } else {
            robot.keyRelease(vk);
        }
    }

    // --- screen-resize: u32 width, u32 height (little endian) ---
    private static void handleScreenResize(byte[] data) {
        if (data.length < 8) return;
        ByteBuffer buf = ByteBuffer.wrap(data).order(ByteOrder.LITTLE_ENDIAN);
        long width = buf.getInt() & 0xFFFFFFFFL;
        long height = buf.getInt() & 0xFFFFFFFFL;
        System.out.println("screen-resize: " + width + "x" + height + " (not wired to a display resize yet)");
    }

    // --- pointer-scroll: f32 deltaX, f32 deltaY, f32 deltaZ (deltaZ unused) ---
    private static void handlePointerScroll(Robot robot, byte[] data) {
        if (data.length < 12) return;
        ByteBuffer buf = ByteBuffer.wrap(data).order(ByteOrder.LITTLE_ENDIAN);
        float deltaX = buf.getFloat();
        float deltaY = buf.getFloat();
        // Robot only exposes vertical wheel scroll.
        if (Math.abs(deltaY) > 0.0f) {
            robot.mouseWheel(Math.round(deltaY));
        }
    }

    static final int[] CODE_MAP = {
        KeyEvent.VK_UNDEFINED, // 0
        KeyEvent.VK_UNDEFINED, // 1
        KeyEvent.VK_UNDEFINED, // 2
        KeyEvent.VK_UNDEFINED, // 3
        KeyEvent.VK_UNDEFINED, // 4
        KeyEvent.VK_UNDEFINED, // 5
        KeyEvent.VK_UNDEFINED, // 6
        KeyEvent.VK_UNDEFINED, // 7
        KeyEvent.VK_UNDEFINED, // 8
        KeyEvent.VK_UNDEFINED, // 9
        KeyEvent.VK_A, // 10
        KeyEvent.VK_B, // 11
        KeyEvent.VK_C, // 12
        KeyEvent.VK_D, // 13
        KeyEvent.VK_E, // 14
        KeyEvent.VK_F, // 15
        KeyEvent.VK_G, // 16
        KeyEvent.VK_H, // 17
        KeyEvent.VK_I, // 18
        KeyEvent.VK_J, // 19
        KeyEvent.VK_K, // 20
        KeyEvent.VK_L, // 21
        KeyEvent.VK_M, // 22
        KeyEvent.VK_N, // 23
        KeyEvent.VK_O, // 24
        KeyEvent.VK_P, // 25
        KeyEvent.VK_Q, // 26
        KeyEvent.VK_R, // 27
        KeyEvent.VK_S, // 28
        KeyEvent.VK_T, // 29
        KeyEvent.VK_U, // 30
        KeyEvent.VK_V, // 31
        KeyEvent.VK_W, // 32
        KeyEvent.VK_X, // 33
        KeyEvent.VK_Y, // 34
        KeyEvent.VK_Z, // 35
        KeyEvent.VK_1, // 36
        KeyEvent.VK_2, // 37
        KeyEvent.VK_3, // 38
        KeyEvent.VK_4, // 39
        KeyEvent.VK_5, // 40
        KeyEvent.VK_6, // 41
        KeyEvent.VK_7, // 42
        KeyEvent.VK_8, // 43
        KeyEvent.VK_9, // 44
        KeyEvent.VK_0, // 45
        KeyEvent.VK_ENTER, // 46
        KeyEvent.VK_ESCAPE, // 47
        KeyEvent.VK_BACK_SPACE, // 48
        KeyEvent.VK_TAB, // 49
        KeyEvent.VK_SPACE, // 50
        KeyEvent.VK_MINUS, // 51
        KeyEvent.VK_EQUALS, // 52
        KeyEvent.VK_OPEN_BRACKET, // 53
        KeyEvent.VK_CLOSE_BRACKET, // 54
        KeyEvent.VK_BACK_SLASH, // 55
        KeyEvent.VK_SEMICOLON, // 56
        KeyEvent.VK_QUOTE, // 57
        KeyEvent.VK_BACK_QUOTE, // 58
        KeyEvent.VK_COMMA, // 59
        KeyEvent.VK_PERIOD, // 60
        KeyEvent.VK_SLASH, // 61
        KeyEvent.VK_CAPS_LOCK, // 62
        KeyEvent.VK_F1, // 63
        KeyEvent.VK_F2, // 64
        KeyEvent.VK_F3, // 65
        KeyEvent.VK_F4, // 66
        KeyEvent.VK_F5, // 67
        KeyEvent.VK_F6, // 68
        KeyEvent.VK_F7, // 69
        KeyEvent.VK_F8, // 70
        KeyEvent.VK_F9, // 71
        KeyEvent.VK_F10, // 72
        KeyEvent.VK_F11, // 73
        KeyEvent.VK_F12, // 74
        KeyEvent.VK_PRINTSCREEN, // 75
        KeyEvent.VK_SCROLL_LOCK, // 76
        KeyEvent.VK_PAUSE, // 77
        KeyEvent.VK_INSERT, // 78
        KeyEvent.VK_HOME, // 79
        KeyEvent.VK_PAGE_UP, // 80
        KeyEvent.VK_DELETE, // 81
        KeyEvent.VK_END, // 82
        KeyEvent.VK_PAGE_DOWN, // 83
        KeyEvent.VK_RIGHT, // 84
        KeyEvent.VK_LEFT, // 85
        KeyEvent.VK_DOWN, // 86
        KeyEvent.VK_UP, // 87
        KeyEvent.VK_NUM_LOCK, // 88
        KeyEvent.VK_DIVIDE, // 89
        KeyEvent.VK_MULTIPLY, // 90
        KeyEvent.VK_SUBTRACT, // 91
        KeyEvent.VK_ADD, // 92
        KeyEvent.VK_ENTER, // 93
        KeyEvent.VK_NUMPAD1, // 94
        KeyEvent.VK_NUMPAD2, // 95
        KeyEvent.VK_NUMPAD3, // 96
        KeyEvent.VK_NUMPAD4, // 97
        KeyEvent.VK_NUMPAD5, // 98
        KeyEvent.VK_NUMPAD6, // 99
        KeyEvent.VK_NUMPAD7, // 100
        KeyEvent.VK_NUMPAD8, // 101
        KeyEvent.VK_NUMPAD9, // 102
        KeyEvent.VK_NUMPAD0, // 103
        KeyEvent.VK_DECIMAL, // 104
        KeyEvent.VK_BACK_SLASH, // 105
        KeyEvent.VK_UNDEFINED, // 106
        KeyEvent.VK_UNDEFINED, // 107
        KeyEvent.VK_UNDEFINED, // 108
        KeyEvent.VK_F13, // 109
        KeyEvent.VK_F14, // 110
        KeyEvent.VK_F15, // 111
        KeyEvent.VK_F16, // 112
        KeyEvent.VK_F17, // 113
        KeyEvent.VK_F18, // 114
        KeyEvent.VK_F19, // 115
        KeyEvent.VK_F20, // 116
        KeyEvent.VK_F21, // 117
        KeyEvent.VK_F22, // 118
        KeyEvent.VK_F23, // 119
        KeyEvent.VK_F24, // 120
        KeyEvent.VK_UNDEFINED, // 121
        KeyEvent.VK_HELP, // 122
        KeyEvent.VK_UNDEFINED, // 123
        KeyEvent.VK_UNDEFINED, // 124
        KeyEvent.VK_UNDEFINED, // 125
        KeyEvent.VK_UNDEFINED, // 126
        KeyEvent.VK_UNDEFINED, // 127
        KeyEvent.VK_UNDEFINED, // 128
        KeyEvent.VK_UNDEFINED, // 129
        KeyEvent.VK_VOLUME_MUTE, // 130
        KeyEvent.VK_VOLUME_UP, // 131
        KeyEvent.VK_VOLUME_DOWN, // 132
        KeyEvent.VK_UNDEFINED, // 133
        KeyEvent.VK_UNDEFINED, // 134
        KeyEvent.VK_UNDEFINED, // 135
        KeyEvent.VK_UNDEFINED, // 136
        KeyEvent.VK_UNDEFINED, // 137
        KeyEvent.VK_UNDEFINED, // 138
        KeyEvent.VK_UNDEFINED, // 139
        KeyEvent.VK_UNDEFINED, // 140
        KeyEvent.VK_UNDEFINED, // 141
        KeyEvent.VK_UNDEFINED, // 142
        KeyEvent.VK_UNDEFINED, // 143
        KeyEvent.VK_UNDEFINED, // 144
        KeyEvent.VK_UNDEFINED, // 145
        KeyEvent.VK_UNDEFINED, // 146
        KeyEvent.VK_UNDEFINED, // 147
        KeyEvent.VK_CONTROL, // 148
        KeyEvent.VK_SHIFT, // 149
        KeyEvent.VK_ALT, // 150
        KeyEvent.VK_META, // 151
        KeyEvent.VK_CONTROL, // 152
        KeyEvent.VK_SHIFT, // 153
        KeyEvent.VK_ALT, // 154
        KeyEvent.VK_META, // 155
        KeyEvent.VK_UNDEFINED, // 156
        KeyEvent.VK_UNDEFINED, // 157
        KeyEvent.VK_UNDEFINED, // 158
        KeyEvent.VK_UNDEFINED, // 159
        KeyEvent.VK_UNDEFINED, // 160
        KeyEvent.VK_UNDEFINED, // 161
        KeyEvent.VK_UNDEFINED, // 162
        KeyEvent.VK_UNDEFINED, // 163
        KeyEvent.VK_UNDEFINED, // 164
        KeyEvent.VK_UNDEFINED, // 165
        KeyEvent.VK_UNDEFINED, // 166
        KeyEvent.VK_UNDEFINED, // 167
        KeyEvent.VK_UNDEFINED, // 168
        KeyEvent.VK_UNDEFINED, // 169
        KeyEvent.VK_UNDEFINED, // 170
        KeyEvent.VK_UNDEFINED, // 171
        KeyEvent.VK_UNDEFINED, // 172
        KeyEvent.VK_UNDEFINED, // 173
    };
}
package main

import (
    "encoding/binary"
    "encoding/json"
    "fmt"
    "net"
    "os"
    "runtime"
    "strconv"
    "strings"

    "github.com/go-vgo/robotgo"
    "github.com/pion/interceptor"
    "github.com/pion/mediadevices"
    "github.com/pion/mediadevices/pkg/frame"
    "github.com/pion/mediadevices/pkg/io/video"
    _ "github.com/pion/mediadevices/pkg/driver/alsa"
    _ "github.com/pion/mediadevices/pkg/driver/coreaudio"
    _ "github.com/pion/mediadevices/pkg/driver/pulse"
    _ "github.com/pion/mediadevices/pkg/driver/screen"
    _ "github.com/pion/mediadevices/pkg/driver/wasapi"
    "github.com/pion/sdp/v3"
    "github.com/pion/webrtc/v4"
)

// --- FILE HELPERS ---

func readFileAsString(path string) string {
    data, err := os.ReadFile(path)
    if err != nil {
        panic(fmt.Sprintf("Failed to read %s: %v", path, err))
    }
    return strings.TrimSpace(string(data))
}

func readJSONStringArray(path string) []string {
    data, err := os.ReadFile(path)
    if err != nil {
        panic(fmt.Sprintf("Failed to read %s: %v", path, err))
    }
    var arr []string
    if err := json.Unmarshal(data, &arr); err != nil {
        panic(fmt.Sprintf("Failed to parse JSON %s: %v", path, err))
    }
    return arr
}

// --- HELPERS ---

func boolPtr(b bool) *bool       { return &b }
func uint16Ptr(u uint16) *uint16 { return &u }
func stringPtr(s string) *string { return &s }

func main() {
    // ==========================================
    // 1. LOAD CONFIGURATION
    // ==========================================
    sharedUfrag := readFileAsString("docs/usernameFragment.txt")
    sharedPwd := readFileAsString("docs/password.txt")
    sharedFingerprint := readFileAsString("docs/workflowFingerprint.txt")

    codeMap := readJSONStringArray("code-map.json")
    mouseMap := readJSONStringArray("mouse-map.json")

    // ==========================================
    // 2. PARSE OFFER ENV VARIABLE
    // ==========================================
    input := strings.TrimSpace(os.Getenv("OFFER"))
    if input == "" {
        panic("OFFER environment variable is not set")
    }

    host, portStr, err := net.SplitHostPort(input)
    if err != nil {
        panic(fmt.Errorf("invalid OFFER format. Expected IP:Port: %w", err))
    }
    port, err := strconv.Atoi(portStr)
    if err != nil {
        panic(fmt.Errorf("invalid port number in OFFER: %w", err))
    }
    fmt.Printf("Targeting %s:%d\n", host, port)

    // ==========================================
    // 3. PION V4 SETUP (Opus 111 / AV1 96)
    // ==========================================
    m := &webrtc.MediaEngine{}
    m.RegisterCodec(webrtc.RTPCodec{
        RTPCodecCapability: webrtc.RTPCodecCapability{MimeType: webrtc.MimeTypeOpus, ClockRate: 48000, Channels: 2},
        PayloadType:        111,
    }, webrtc.RTPCodecTypeAudio)

    m.RegisterCodec(webrtc.RTPCodec{
        RTPCodecCapability: webrtc.RTPCodecCapability{MimeType: "video/AV1", ClockRate: 90000},
        PayloadType:        96,
    }, webrtc.RTPCodecTypeVideo)

    i := &interceptor.Registry{}
    if err := webrtc.RegisterDefaultInterceptors(m, i); err != nil {
        panic(err)
    }

    s := webrtc.SettingEngine{}
    s.EnableSCTPZeroChecksum(true) // v4 feature

    api := webrtc.NewAPI(
        webrtc.WithMediaEngine(m),
        webrtc.WithInterceptorRegistry(i),
        webrtc.WithSettingEngine(s),
    )

    cert, err := webrtc.LoadCertificateFromFiles("workflow_cert.pem", "workflow_key.pem")
    if err != nil {
        panic(fmt.Errorf("failed to load DTLS certs: %w", err))
    }

    config := webrtc.Configuration{
        Certificates:                              []webrtc.Certificate{cert},
        DisableCertificateFingerprintVerification: true,
    }

    pc, err := api.NewPeerConnection(config)
    if err != nil {
        panic(err)
    }

    // ==========================================
    // 4. SCREEN CAPTURE (Real mediadevices API)
    // ==========================================
    var videoRtpSender *webrtc.RTPSender
    var stopScreenReader func() error

    startScreenCapture := func(targetWidth, targetHeight int) {
        // 1. Kill the old screen capture if it's running
        if stopScreenReader != nil {
            stopScreenReader()
        }

        // 2. Get raw I420 frames from the OS screen driver
        rawReader, stop, err := mediadevices.GetVideoReader(mediadevices.VideoTrackConstraints{
            FrameFormat: frame.FormatI420,
            DisplayId:   0,
        })
        if err != nil {
            panic(fmt.Errorf("failed to open screen reader: %w", err))
        }
        stopScreenReader = stop

        // 3. Force resolution using the real Resizer filter
        resizer := video.NewResizer(rawReader, targetWidth, targetHeight)

        // 4. Encode the resized frames to AV1
        videoTrack, err := mediadevices.NewVideoTrack(mediadevices.VideoTrackConstraints{
            CodecName: "AV1",
        }, resizer)
        if err != nil {
            panic(fmt.Errorf("failed to create video track: %w", err))
        }

        // 5. Wrap in a Pion track
        pionTrack, err := webrtc.NewTrackLocalStaticRTP(videoTrack.RTPCodec(), "video", "pion", nil)
        if err != nil {
            panic(err)
        }

        // 6. Hot-swap the track in the PeerConnection
        if videoRtpSender == nil {
            videoRtpSender, err = pc.AddTrack(pionTrack)
            if err != nil {
                panic(err)
            }
        } else {
            pc.ReplaceTrack(videoRtpSender.Track(), pionTrack)
        }

        // 7. Read loop
        localPionTrack := pionTrack
        go func() {
            for {
                pkt, release, err := videoTrack.Read()
                if err != nil {
                    return
                }

                if err := localPionTrack.WriteRTP(pkt); err != nil {
                    return
                }

                // CRITICAL: Free the buffer back to mediadevices
                release()
            }
        }()
    }

    // Start initial capture at 1920x1080
    startScreenCapture(1920, 1080)

    // ==========================================
    // 5. AUTO-DETECT & CAPTURE SYSTEM AUDIO
    // ==========================================
    audioDeviceID := ""
    switch strings.ToLower(runtime.GOOS) {
    case "linux":
        audioDeviceID = "Virtual_Audio.monitor"
    case "windows":
        audioDeviceID = "CABLE Input (VB-Audio Virtual Cable)"
    case "darwin":
        audioDeviceID = "BlackHole 16ch"
    }

    if audioDeviceID != "" {
        fmt.Printf("Attempting to capture system audio from: %s\n", audioDeviceID)

        audioTrack, err := mediadevices.GetAudioTrack(mediadevices.AudioTrackConstraints{
            DeviceID:  audioDeviceID,
            CodecName: "Opus",
        })
        if err != nil {
            fmt.Printf("WARNING: Failed to open audio device: %v\n", err)
        } else {
            pionAudioTrack, err := webrtc.NewTrackLocalStaticRTP(audioTrack.RTPCodec(), "audio", "pion", nil)
            if err != nil {
                panic(err)
            }

            audioRtpSender, err := pc.AddTrack(pionAudioTrack)
            if err != nil {
                panic(err)
            }

            go func() {
                for {
                    pkt, release, err := audioTrack.Read()
                    if err != nil {
                        return
                    }

                    if err := pionAudioTrack.WriteRTP(pkt); err != nil {
                        return
                    }

                    release()
                }
            }()
        }
    }

    // ==========================================
    // 6. DATA CHANNELS
    // ==========================================

    // --- Pointer Movement (Unreliable, Unordered - Pure UDP) ---
    chMovement, _ := pc.CreateDataChannel("pointer-movement", &webrtc.DataChannelInit{
        Negotiated:     boolPtr(true),
        ID:             uint16Ptr(0),
        Ordered:        boolPtr(false),
        MaxRetransmits: uint16Ptr(0),
    })
    chMovement.OnMessage(func(msg webrtc.DataChannelMessage) {
        if len(msg.Data) < 5 {
            return
        }
        x := int(int16(binary.LittleEndian.Uint16(msg.Data[1:3])))
        y := int(int16(binary.LittleEndian.Uint16(msg.Data[3:5])))
        if msg.Data[0] == 1 {
            robotgo.MoveRelative(x, y)
        } else {
            robotgo.Move(x, y)
        }
    })

    // --- Pointer Clicks (Reliable, Ordered - TCP style) ---
    chClick, _ := pc.CreateDataChannel("pointer-click", &webrtc.DataChannelInit{
        Negotiated: boolPtr(true),
        ID:         uint16Ptr(1),
        Ordered:    boolPtr(true),
    })
    chClick.OnMessage(func(msg webrtc.DataChannelMessage) {
        if len(msg.Data) < 2 {
            return
        }
        buttonIdx := int(msg.Data[1])
        if buttonIdx < len(mouseMap) && mouseMap[buttonIdx] != "" {
            robotgo.Toggle(mouseMap[buttonIdx], msg.Data[0] == 1)
        }
    })

    // --- Keyboard (Reliable, Ordered - TCP style) ---
    chKeyboard, _ := pc.CreateDataChannel("keyboard", &webrtc.DataChannelInit{
        Negotiated: boolPtr(true),
        ID:         uint16Ptr(2),
        Ordered:    boolPtr(true),
    })
    chKeyboard.OnMessage(func(msg webrtc.DataChannelMessage) {
        if len(msg.Data) < 2 {
            return
        }
        keyIdx := int(msg.Data[1])
        if keyIdx < len(codeMap) && codeMap[keyIdx] != "" {
            robotgo.KeyToggle(codeMap[keyIdx], msg.Data[0] == 1)
        }
    })

    // --- Viewport Resize (Reliable but Unordered) ---
    chViewport, _ := pc.CreateDataChannel("viewport-resize", &webrtc.DataChannelInit{
        Negotiated: boolPtr(true),
        ID:         uint16Ptr(3),
        Ordered:    boolPtr(false),
    })
    chViewport.OnMessage(func(msg webrtc.DataChannelMessage) {
        if len(msg.Data) < 4 {
            return
        }
        newW := int(binary.LittleEndian.Uint16(msg.Data[0:2]))
        newH := int(binary.LittleEndian.Uint16(msg.Data[2:4]))

        if newW < 320 || newH < 240 {
            return
        }

        startScreenCapture(newW, newH)
    })

    // ==========================================
    // 7. THE BEAUTIFUL SDP GENERATION TRICK (AST Manipulation)
    // ==========================================
    offer, err := pc.CreateOffer(nil)
    if err != nil {
        panic(err)
    }

    parsedSdp := &sdp.SessionDescription{}
    if err := parsedSdp.Unmarshal([]byte(offer.SDP)); err != nil {
        panic(fmt.Errorf("failed to parse generated SDP: %w", err))
    }

    // Helper function to safely update/add an attribute in a media description
    setAttribute := func(attrs *[]sdp.Attribute, key, value string) {
        for i, a := range *attrs {
            if a.Key == key {
                (*attrs)[i].Value = value
                return
            }
        }
        *attrs = append(*attrs, sdp.Attribute{Key: key, Value: value})
    }

    // Inject our hardcoded shared secrets into all media sections
    for _, media := range parsedSdp.MediaDescriptions {
        setAttribute(&media.Attributes, "ice-ufrag", sharedUfrag)
        setAttribute(&media.Attributes, "ice-pwd", sharedPwd)
        setAttribute(&media.Attributes, "fingerprint", "sha-256 "+sharedFingerprint)
        setAttribute(&media.Attributes, "setup", "passive")
    }

    modifiedSdpBytes, err := parsedSdp.Marshal()
    if err != nil {
        panic(fmt.Errorf("failed to marshal modified SDP: %w", err))
    }

    pc.SetRemoteDescription(webrtc.SessionDescription{SDP: string(modifiedSdpBytes), Type: webrtc.SDPTypeOffer})
    answer, _ := pc.CreateAnswer(nil)
    pc.SetLocalDescription(answer)

    // ==========================================
    // 8. INJECT IP:PORT & CONNECT
    // ==========================================
    candidateStr := fmt.Sprintf("candidate:1 1 udp 1686052607 %s %d typ srflx", host, port)
    pc.AddICECandidate(webrtc.ICECandidateInit{Candidate: candidateStr, SDPMid: stringPtr("0")})

    pc.OnICEConnectionStateChange(func(state webrtc.ICEConnectionState) {
        fmt.Printf("ICE State: %s\n", state.String())
        if state == webrtc.ICEConnectionStateConnected {
            fmt.Println("SUCCESS! Streaming to browser and receiving inputs.")
        }
        if state == webrtc.ICEConnectionStateFailed || state == webrtc.ICEConnectionStateClosed {
            os.Exit(1)
        }
    })

    select {} // Block forever
}
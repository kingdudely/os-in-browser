package main

import (
    "encoding/binary"
    "encoding/json"
    "fmt"
    "net"
    "os"
    "regexp"
    "runtime"
    "strconv"
    "strings"

    "github.com/go-vgo/robotgo"
    "github.com/pion/interceptor"
    "github.com/pion/mediadevices"
    "github.com/pion/mediadevices/pkg/frame"
    _ "github.com/pion/mediadevices/pkg/driver/alsa"
    _ "github.com/pion/mediadevices/pkg/driver/coreaudio"
    _ "github.com/pion/mediadevices/pkg/driver/pulse"
    _ "github.com/pion/mediadevices/pkg/driver/screen"
    _ "github.com/pion/mediadevices/pkg/driver/wasapi"
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
    // 1. LOAD CONFIGURATION FROM /docs/
    // ==========================================
    sharedUfrag := readFileAsString("docs/usernameFragment.txt")
    sharedPwd := readFileAsString("docs/password.txt")
    sharedFingerprint := readFileAsString("docs/workflowFingerprint.txt")
    
    codeMap := readJSONStringArray("docs/code-map.json")
    mouseMap := readJSONStringArray("docs/mouse-map.json")

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
    s.EnableSCTPZeroChecksum(true) // v4 performance boost

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
    // 4. CAPTURE SCREEN (Video)
    // ==========================================
    fmt.Println("Capturing screen...")
    screen, err := mediadevices.GetVideoTrack(mediadevices.VideoTrackConstraints{
        FrameFormat: frame.FormatI420,
        DisplayId:   0,
        CodecName:   "AV1",
    })
    if err != nil {
        panic(fmt.Errorf("failed to open screen capture: %w", err))
    }

    videoRtpSender, err := pc.AddTrack(screen.Track)
    if err != nil {
        panic(err)
    }
    go func() {
        for {
            pkt, _, readErr := screen.Read()
            if readErr != nil {
                fmt.Println("Screen read error:", readErr)
                return
            }
            if writeErr := videoRtpSender.Write(pkt); writeErr != nil {
                return
            }
        }
    }()

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
        mic, err := mediadevices.GetAudioTrack(mediadevices.AudioTrackConstraints{
            DeviceID:  audioDeviceID,
            CodecName: "Opus",
        })
        if err != nil {
            fmt.Printf("WARNING: Failed to open audio device: %v\n", err)
        } else {
            audioRtpSender, err := pc.AddTrack(mic.Track)
            if err != nil {
                panic(err)
            }
            go func() {
                for {
                    pkt, _, readErr := mic.Read()
                    if readErr != nil {
                        fmt.Println("Audio read error:", readErr)
                        return
                    }
                    if writeErr := audioRtpSender.Write(pkt); writeErr != nil {
                        return
                    }
                }
            }()
        }
    }

    // ==========================================
    // 6. DATA CHANNELS (Dynamic JSON Mappings)
    // ==========================================

    // --- Pointer Movement ---
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
        if msg.Data[0] == 1 { // isRelative
            robotgo.MoveRelative(x, y)
        } else {
            robotgo.Move(x, y)
        }
    })

    // --- Pointer Clicks (Dynamic from mouse-map.json) ---
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
        // Dynamically look up the robotgo string from the JSON array
        if buttonIdx < len(mouseMap) && mouseMap[buttonIdx] != "" {
            robotgo.Toggle(mouseMap[buttonIdx], msg.Data[0] == 1)
        }
    })

    // --- Keyboard (Dynamic from code-map.json) ---
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
        // Dynamically look up the robotgo string from the JSON array
        if keyIdx < len(codeMap) && codeMap[keyIdx] != "" {
            robotgo.KeyToggle(codeMap[keyIdx], msg.Data[0] == 1)
        }
    })

    // ==========================================
    // 7. THE BEAUTIFUL SDP GENERATION TRICK
    // ==========================================
    offer, err := pc.CreateOffer(nil)
    if err != nil {
        panic(err)
    }

    // Swap Pion's dynamic secrets with the ones we loaded from /docs/
    reUfrag := regexp.MustCompile(`a=ice-ufrag:\S+`)
    rePwd := regexp.MustCompile(`a=ice-pwd:\S+`)
    reFingerprint := regexp.MustCompile(`a=fingerprint:sha-256 \S+`)
    reSetup := regexp.MustCompile(`a=setup:\S+`)

    fakeOfferSdp := offer.SDP
    fakeOfferSdp = reUfrag.ReplaceAllString(fakeOfferSdp, fmt.Sprintf("a=ice-ufrag:%s", sharedUfrag))
    fakeOfferSdp = rePwd.ReplaceAllString(fakeOfferSdp, fmt.Sprintf("a=ice-pwd:%s", sharedPwd))
    fakeOfferSdp = reFingerprint.ReplaceAllString(fakeOfferSdp, fmt.Sprintf("a=fingerprint:sha-256 %s", sharedFingerprint))
    fakeOfferSdp = reSetup.ReplaceAllString(fakeOfferSdp, "a=setup:passive")

    pc.SetRemoteDescription(webrtc.SessionDescription{SDP: fakeOfferSdp, Type: webrtc.SDPTypeOffer})
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
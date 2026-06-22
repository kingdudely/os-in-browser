package main

import (
	"crypto/tls"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"os"
	"strings"

	"github.com/go-vgo/robotgo"
	"github.com/pion/mediadevices"
	"github.com/pion/mediadevices/pkg/codec/opus"
	"github.com/pion/mediadevices/pkg/codec/svtav1"
	"github.com/pion/mediadevices/pkg/prop"
	_ "github.com/pion/mediadevices/pkg/driver/microphone"
	_ "github.com/pion/mediadevices/pkg/driver/screen"
	"github.com/pion/sdp/v3"
	"github.com/pion/webrtc/v4"
)

type Constants struct {
	UsernameFragment    string `json:"usernameFragment"`
	Password            string `json:"password"`
    WorkflowFingerprint string `json:"workflowFingerprint"`
}

func mustReadJSON[T any](path string) T {
	data, err := os.ReadFile(path)
	if err != nil {
		log.Fatalf("read %s: %v", path, err)
	}
	var v T
	if err := json.Unmarshal(data, &v); err != nil {
		log.Fatalf("parse %s: %v", path, err)
	}
	return v
}

func main() {
	// Load files
	constants := mustReadJSON[Constants]("docs/constants.json")
	keyMap := mustReadJSON[[]interface{}]("code-map.json")
	buttonMap := mustReadJSON[[]string]("button-map.json")
    usernameFragment := constants.UsernameFragment
    password := constants.Password
    workflowFingerprint := constants.WorkflowFingerprint

	keyForIndex := func(index uint8) string {
		if int(index) >= len(keyMap) || keyMap[index] == nil {
			return ""
		}
		s, _ := keyMap[index].(string)
		return s
	}
	buttonForIndex := func(index uint8) string {
		if int(index) >= len(buttonMap) {
			return "left"
		}
		return buttonMap[index]
	}

	// Parse OFFER env var
	offer := strings.TrimSpace(os.Getenv("OFFER"))
	if offer == "" {
		log.Fatal("OFFER env var required (format: ip:port or [ipv6]:port)")
	}
	host, port, err := net.SplitHostPort(offer)
	if err != nil {
		log.Fatalf("invalid OFFER %q: %v", offer, err)
	}

	// Load TLS cert
	certPEM, err := os.ReadFile("workflow_cert.pem")
	if err != nil {
		log.Fatalf("read workflow_cert.pem: %v", err)
	}
	keyPEM, err := os.ReadFile("workflow_key.pem")
	if err != nil {
		log.Fatalf("read workflow_key.pem: %v", err)
	}
	tlsCert, err := tls.X509KeyPair(certPEM, keyPEM)
	if err != nil {
		log.Fatalf("X509KeyPair: %v", err)
	}

	// SettingEngine
	se := webrtc.SettingEngine{}
	se.SetICECredentials(usernameFragment, password)
	se.DisableCertificateFingerprintVerification(true)

	// Codec setup
	av1Params, err := svtav1.NewParams()
	if err != nil {
		log.Fatalf("svtav1 params: %v", err)
	}
	av1Params.BitRate = 2_000_000

	opusParams, err := opus.NewParams()
	if err != nil {
		log.Fatalf("opus params: %v", err)
	}

	codecSelector := mediadevices.NewCodecSelector(
		mediadevices.WithVideoEncoders(&av1Params),
		mediadevices.WithAudioEncoders(&opusParams),
	)
	codecSelector.Populate(&se)

	api := webrtc.NewAPI(webrtc.WithSettingEngine(se))

	cert, err := webrtc.CertificateFromTLSCertificate(tlsCert)
	if err != nil {
		log.Fatalf("certificate: %v", err)
	}

	peer, err := api.NewPeerConnection(webrtc.Configuration{
		Certificates: []webrtc.Certificate{cert},
	})
	if err != nil {
		log.Fatalf("NewPeerConnection: %v", err)
	}
	defer peer.Close()

	// Screen + mic capture
	stream, err := mediadevices.GetDisplayMedia(mediadevices.MediaStreamConstraints{
		Video: func(c *mediadevices.MediaTrackConstraints) {
			c.FrameRate = prop.Float(30)
		},
		Audio: func(c *mediadevices.MediaTrackConstraints) {},
		Codec: codecSelector,
	})
	if err != nil {
		log.Fatalf("GetDisplayMedia: %v", err)
	}
	defer stream.Release()

	for _, t := range stream.GetVideoTracks() {
		defer t.Close()
		if _, err := peer.AddTransceiverFromTrack(t, webrtc.RTPTransceiverInit{
			Direction: webrtc.RTPTransceiverDirectionSendonly,
		}); err != nil {
			log.Fatalf("add video track: %v", err)
		}
	}
	for _, t := range stream.GetAudioTracks() {
		defer t.Close()
		if _, err := peer.AddTransceiverFromTrack(t, webrtc.RTPTransceiverInit{
			Direction: webrtc.RTPTransceiverDirectionSendonly,
		}); err != nil {
			log.Fatalf("add audio track: %v", err)
		}
	}

	// Data channels
	boolTrue := true
	maxRetransmits := uint16(0)
	ch := func(label string, ordered bool, retransmits *uint16, id uint16) *webrtc.DataChannel {
		dc, dcErr := peer.CreateDataChannel(label, &webrtc.DataChannelInit{
			Ordered:        &ordered,
			MaxRetransmits: retransmits,
			Negotiated:     &boolTrue,
			ID:             &id,
		})
		if dcErr != nil {
			log.Fatalf("CreateDataChannel %s: %v", label, dcErr)
		}
		return dc
	}

	pointerMovement := ch("pointer-movement", false, &maxRetransmits, 0)
	pointerClick    := ch("pointer-click", true, nil, 1)
	keyboard        := ch("keyboard", true, nil, 2)
	screenResize    := ch("screen-resize", false, &maxRetransmits, 3)
	scroll          := ch("scroll", false, &maxRetransmits, 4)

	// Track client viewport for coordinate scaling
	// Start with actual screen size; updated when client sends screen-resize
	clientW, clientH := robotgo.GetScreenSize()

	pointerMovement.OnMessage(func(msg webrtc.DataChannelMessage) {
		if len(msg.Data) < 5 {
			return
		}
		isRelative := msg.Data[0] == 1
		x := int(int16(binary.LittleEndian.Uint16(msg.Data[1:3])))
		y := int(int16(binary.LittleEndian.Uint16(msg.Data[3:5])))

		if isRelative {
			cx, cy := robotgo.Location()
			robotgo.Move(cx+x, cy+y)
		} else {
			sw, sh := robotgo.GetScreenSize()
			robotgo.Move(x*sw/clientW, y*sh/clientH)
		}
	})

	pointerClick.OnMessage(func(msg webrtc.DataChannelMessage) {
		if len(msg.Data) < 2 {
			return
		}
		isDown := msg.Data[0] == 1
		button := buttonForIndex(msg.Data[1])
		if isDown {
			robotgo.Toggle(button, "down")
		} else {
			robotgo.Toggle(button, "up")
		}
	})

	keyboard.OnMessage(func(msg webrtc.DataChannelMessage) {
		if len(msg.Data) < 2 {
			return
		}
		isDown := msg.Data[0] == 1
		key := keyForIndex(msg.Data[1])
		if key == "" {
			log.Printf("unsupported key index %d", msg.Data[1])
			return
		}
		if isDown {
			robotgo.KeyToggle(key, "down")
		} else {
			robotgo.KeyToggle(key, "up")
		}
	})

	screenResize.OnMessage(func(msg webrtc.DataChannelMessage) {
		if len(msg.Data) < 4 {
			return
		}
		clientW = int(binary.LittleEndian.Uint16(msg.Data[0:2]))
		clientH = int(binary.LittleEndian.Uint16(msg.Data[2:4]))
		fmt.Printf("client viewport: %dx%d\n", clientW, clientH)
	})

	scroll.OnMessage(func(msg webrtc.DataChannelMessage) {
		if len(msg.Data) < 4 {
			return
		}
		dx := int(int16(binary.LittleEndian.Uint16(msg.Data[0:2])))
		dy := int(int16(binary.LittleEndian.Uint16(msg.Data[2:4])))

		if dy != 0 {
			amount := dy / 100
			if amount == 0 {
				amount = 1
			}
			if dy > 0 {
				robotgo.ScrollDir(amount, "down")
			} else {
				robotgo.ScrollDir(-amount, "up")
			}
		}
		if dx != 0 {
			amount := dx / 100
			if amount == 0 {
				amount = 1
			}
			if dx > 0 {
				robotgo.ScrollDir(amount, "right")
			} else {
				robotgo.ScrollDir(-amount, "left")
			}
		}
	})

	// Build offer SDP using pion/sdp v3 API
	isIPv6 := strings.Contains(host, ":")
	netType := "IP4"
	if isIPv6 {
		netType = "IP6"
	}

	candidateStr := fmt.Sprintf("0 1 UDP 1686052607 %s %s typ srflx", host, port)

	newMedia := func(typ, mid, rtpmap string, payloadType uint8) *sdp.MediaDescription {
		portNum, _ := fmt.Sscan(port)
		_ = portNum
		return (&sdp.MediaDescription{
			MediaName: sdp.MediaName{
				Media:   typ,
				Port:    sdp.RangedPort{Value: 9},
				Protos:  []string{"UDP", "TLS", "RTP", "SAVPF"},
				Formats: []string{fmt.Sprintf("%d", payloadType)},
			},
			ConnectionInformation: &sdp.ConnectionInformation{
				NetworkType: "IN",
				AddressType: netType,
				Address:     &sdp.Address{Address: host},
			},
		}).
			WithICECredentials(usernameFragment, password).
			WithFingerprint("sha-256", workflowFingerprint).
			WithPropertyAttribute("setup:active").
			WithCandidate(candidateStr).
			WithPropertyAttribute("recvonly").
			WithValueAttribute("mid", mid).
			WithPropertyAttribute("rtcp-mux").
			WithCodec(payloadType, rtpmap, func() uint32 {
				if typ == "audio" { return 48000 }
				return 90000
			}(), func() uint16 {
				if typ == "audio" { return 2 }
				return 0
			}(), "")
	}

	appMedia := &sdp.MediaDescription{
		MediaName: sdp.MediaName{
			Media:   "application",
			Port:    sdp.RangedPort{Value: 9},
			Protos:  []string{"UDP", "DTLS", "SCTP"},
			Formats: []string{"webrtc-datachannel"},
		},
		ConnectionInformation: &sdp.ConnectionInformation{
			NetworkType: "IN",
			AddressType: netType,
			Address:     &sdp.Address{Address: host},
		},
	}
	appMedia.
		WithICECredentials(usernameFragment, password).
		WithFingerprint("sha-256", workflowFingerprint).
		WithPropertyAttribute("setup:active").
		WithCandidate(candidateStr).
		WithValueAttribute("mid", "2").
		WithValueAttribute("sctp-port", "5000").
		WithValueAttribute("max-message-size", "262144")

	sess := &sdp.SessionDescription{
		Version: 0,
		Origin: sdp.Origin{
			Username:       "-",
			SessionID:      0,
			SessionVersion: 0,
			NetworkType:    "IN",
			AddressType:    "IP4",
			UnicastAddress: "0.0.0.0",
		},
		SessionName: "-",
		TimeDescriptions: []sdp.TimeDescription{
			{Timing: sdp.Timing{StartTime: 0, StopTime: 0}},
		},
	}
	sess.
		WithValueAttribute("group", "BUNDLE 0 1 2").
		WithMedia(newMedia("audio", "0", "opus", 111)).
		WithMedia(newMedia("video", "1", "AV1", 96)).
		WithMedia(appMedia)

	offerSDP, err := sess.Marshal()
	if err != nil {
		log.Fatalf("marshal SDP: %v", err)
	}

	if err := peer.SetRemoteDescription(webrtc.SessionDescription{
		Type: webrtc.SDPTypeOffer,
		SDP:  string(offerSDP),
	}); err != nil {
		log.Fatalf("SetRemoteDescription: %v", err)
	}

	answer, err := peer.CreateAnswer(nil)
	if err != nil {
		log.Fatalf("CreateAnswer: %v", err)
	}
	if err := peer.SetLocalDescription(answer); err != nil {
		log.Fatalf("SetLocalDescription: %v", err)
	}

	peer.OnConnectionStateChange(func(s webrtc.PeerConnectionState) {
		fmt.Printf("connection: %s\n", s)
	})
	peer.OnICEConnectionStateChange(func(s webrtc.ICEConnectionState) {
		fmt.Printf("ICE: %s\n", s)
	})

	fmt.Printf("Connecting to browser at %s:%s ...\n", host, port)
	select {}
}
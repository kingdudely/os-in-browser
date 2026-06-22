package main

import (
	"crypto/tls"
	_ "embed"
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
	"github.com/pion/webrtc/v4"
)

//go:embed robotgo-key-map.json
var keyMapJSON []byte

//go:embed button-map.json
var buttonMapJSON []byte

//go:embed docs/workflowFingerprint.txt
var workflowFingerprint string

//go:embed docs/usernameFragment.txt
var usernameFragment string

//go:embed docs/password.txt
var password string

var keyMap []interface{}
var buttonMap []string

func init() {
	workflowFingerprint = strings.TrimSpace(workflowFingerprint)
	usernameFragment = strings.TrimSpace(usernameFragment)
	password = strings.TrimSpace(password)

	if err := json.Unmarshal(keyMapJSON, &keyMap); err != nil {
		log.Fatalf("failed to parse robotgo-key-map.json: %v", err)
	}
	if err := json.Unmarshal(buttonMapJSON, &buttonMap); err != nil {
		log.Fatalf("failed to parse button-map.json: %v", err)
	}
}

func keyForIndex(index uint8) string {
	if int(index) >= len(keyMap) || keyMap[index] == nil {
		return ""
	}
	s, _ := keyMap[index].(string)
	return s
}

func buttonForIndex(index uint8) string {
	if int(index) >= len(buttonMap) {
		return "left"
	}
	return buttonMap[index]
}

func buildOfferSDP(address, port, ufrag, pwd, fingerprint string) string {
	isIPv6 := strings.Contains(address, ":")
	netType := "IP4"
	if isIPv6 {
		netType = "IP6"
	}

	candidate := fmt.Sprintf(
		"candidate:0 1 UDP 1686052607 %s %s typ srflx",
		address, port,
	)

	commonLines := []string{
		fmt.Sprintf("c=IN %s %s", netType, address),
		fmt.Sprintf("a=ice-ufrag:%s", ufrag),
		fmt.Sprintf("a=ice-pwd:%s", pwd),
		fmt.Sprintf("a=fingerprint:sha-256 %s", fingerprint),
		"a=setup:active",
		fmt.Sprintf("a=%s", candidate),
	}

	lines := []string{
		"v=0",
		"o=- 0 0 IN IP4 0.0.0.0",
		"s=-",
		"t=0 0",
		"a=group:BUNDLE 0 1 2",

		"m=audio 9 UDP/TLS/RTP/SAVPF 111",
	}
	lines = append(lines, commonLines...)
	lines = append(lines,
		"a=recvonly",
		"a=mid:0",
		"a=rtcp-mux",
		"a=rtpmap:111 opus/48000/2",

		"m=video 9 UDP/TLS/RTP/SAVPF 96",
	)
	lines = append(lines, commonLines...)
	lines = append(lines,
		"a=recvonly",
		"a=mid:1",
		"a=rtcp-mux",
		"a=rtpmap:96 AV1/90000",

		"m=application 9 UDP/DTLS/SCTP webrtc-datachannel",
	)
	lines = append(lines, commonLines...)
	lines = append(lines,
		"a=mid:2",
		"a=sctp-port:5000",
		"a=max-message-size:262144",
		"",
	)

	return strings.Join(lines, "\r\n")
}

func main() {
	// $OFFER is "ip:port" or "[ipv6]:port"
	offer := strings.TrimSpace(os.Getenv("OFFER"))
	if offer == "" {
		log.Fatal("OFFER env var is required (format: ip:port or [ipv6]:port)")
	}

	host, port, err := net.SplitHostPort(offer)
	if err != nil {
		log.Fatalf("invalid OFFER %q: %v", offer, err)
	}

	// Load cert
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
	se.DisableCertificateFingerprintVerification(true) // browser doesn't send its fingerprint

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
    scroll := ch("scroll", false, &maxRetransmits, 4)

	screenWidth, screenHeight := robotgo.GetScreenSize()

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
			robotgo.Move(x*sw/screenWidth, y*sh/screenHeight)
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
		screenWidth = int(binary.LittleEndian.Uint16(msg.Data[0:2]))
		screenHeight = int(binary.LittleEndian.Uint16(msg.Data[2:4]))
		fmt.Printf("client viewport: %dx%d\n", screenWidth, screenHeight)
	})

    scroll.OnMessage(func(msg webrtc.DataChannelMessage) {
        if len(msg.Data) < 4 {
            return
        }
        dx := int(int16(binary.LittleEndian.Uint16(msg.Data[0:2])))
        dy := int(int16(binary.LittleEndian.Uint16(msg.Data[2:4])))

        if dy != 0 {
            amount := dy / 100 // deltaY is in pixels, robotgo takes scroll ticks
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

	// Reconstruct offer SDP from the browser's srflx address
	offerSDP := buildOfferSDP(host, port, usernameFragment, password, workflowFingerprint)

	if err := peer.SetRemoteDescription(webrtc.SessionDescription{
		Type: webrtc.SDPTypeOffer,
		SDP:  offerSDP,
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
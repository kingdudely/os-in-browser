package main

import (
	"encoding/base64"
	"encoding/binary"
	"fmt"
	"log"
	"net"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/pion/mediadevices"
	"github.com/pion/mediadevices/pkg/codec/x264"
	_ "github.com/pion/mediadevices/pkg/driver/screen"
	"github.com/pion/mediadevices/pkg/frame"
	"github.com/pion/mediadevices/pkg/prop"
	"github.com/pion/sdp/v4"
	"github.com/pion/webrtc/v4"
)

const (
	usernameFragment = "myufraghere1234"
	password         = "mypasswordthatisverylong12345"

	certPath = "./certificate.pem"
	keyPath  = "./key.pem"
)

func fatal(step string, err error) {
	if err != nil {
		log.Fatalf("%s: %v", step, err)
	}
}

func main() {
	if len(os.Args) < 2 {
		log.Fatal("usage: ./dist/[os] <share-id>")
	}
	offer := os.Args[1]

	cert, err := loadCertificate()
	fatal("load certificate", err)

	pc, shareID, err := createAnswer(offer, cert)
	fatal("create answer", err)
	defer pc.Close()

	fatal("write answer.txt", os.WriteFile("answer.txt", []byte(shareID), 0644))

	// Block until the peer connection closes/fails/disconnects, then exit.
	closed := make(chan struct{})
	var once sync.Once
	pc.OnConnectionStateChange(func(s webrtc.PeerConnectionState) {
		switch s {
		case webrtc.PeerConnectionStateFailed,
			webrtc.PeerConnectionStateClosed,
			webrtc.PeerConnectionStateDisconnected:
			once.Do(func() { close(closed) })
		}
	})
	<-closed
}

// createAnswer sets up a PeerConnection + screen-capture track for the
// given offer share-id, waits for a srflx ICE candidate, and returns the
// live PeerConnection along with the encoded answer share-id. The caller
// is responsible for closing pc.
func createAnswer(offer string, cert webrtc.Certificate) (*webrtc.PeerConnection, string, error) {
	address, port, err := decodeAddressPort(offer)
	if err != nil {
		return nil, "", fmt.Errorf("decode share id: %w", err)
	}

	settingEngine := webrtc.SettingEngine{}
	settingEngine.SetICECredentials(usernameFragment, password)
	settingEngine.DisableCertificateFingerprintVerification(true)

	api := webrtc.NewAPI(webrtc.WithSettingEngine(settingEngine))

	pc, err := api.NewPeerConnection(webrtc.Configuration{
		ICEServers: []webrtc.ICEServer{
			{URLs: []string{"stun:stun.l.google.com:19302"}},
			{URLs: []string{"stun:stun.cloudflare.com:3478"}},
		},
		Certificates: []webrtc.Certificate{cert},
	})
	if err != nil {
		return nil, "", fmt.Errorf("new peer connection: %w", err)
	}

	if err := addDataChannels(pc); err != nil {
		pc.Close()
		return nil, "", fmt.Errorf("add data channels: %w", err)
	}

	track, err := setupScreenCapture()
	if err != nil {
		pc.Close()
		return nil, "", fmt.Errorf("setup screen capture: %w", err)
	}

	if _, err := pc.AddTransceiverFromTrack(track, webrtc.RTPTransceiverInit{
		Direction: webrtc.RTPTransceiverDirectionSendonly,
	}); err != nil {
		pc.Close()
		return nil, "", fmt.Errorf("add video track: %w", err)
	}

	offerSDP, err := buildOfferSDP(address, port)
	if err != nil {
		pc.Close()
		return nil, "", fmt.Errorf("build offer sdp: %w", err)
	}

	if err := pc.SetRemoteDescription(webrtc.SessionDescription{
		Type: webrtc.SDPTypeOffer,
		SDP:  offerSDP,
	}); err != nil {
		pc.Close()
		return nil, "", fmt.Errorf("set remote description: %w", err)
	}

	answer, err := pc.CreateAnswer(nil)
	if err != nil {
		pc.Close()
		return nil, "", fmt.Errorf("create answer: %w", err)
	}

	found := make(chan *webrtc.ICECandidate, 1)
	pc.OnICECandidate(func(c *webrtc.ICECandidate) {
		if c != nil && c.Typ == webrtc.ICECandidateTypeSrflx {
			select {
			case found <- c:
			default:
			}
		}
	})

	if err := pc.SetLocalDescription(answer); err != nil {
		pc.Close()
		return nil, "", fmt.Errorf("set local description: %w", err)
	}

	var candidate *webrtc.ICECandidate
	select {
	case candidate = <-found:
	case <-time.After(30 * time.Second):
		pc.Close()
		return nil, "", fmt.Errorf("timed out waiting for srflx candidate")
	}

	shareID, err := encodeAddressPort(candidate.Address, candidate.Port)
	if err != nil {
		pc.Close()
		return nil, "", fmt.Errorf("encode share id: %w", err)
	}

	return pc, shareID, nil
}

func decodeAddressPort(shareID string) (string, uint16, error) {
	raw, err := base64.StdEncoding.DecodeString(shareID)
	if err != nil {
		return "", 0, fmt.Errorf("invalid share id: %w", err)
	}
	if len(raw) < 3 {
		return "", 0, fmt.Errorf("share id too short")
	}
	addrBytes, port := raw[:len(raw)-2], binary.LittleEndian.Uint16(raw[len(raw)-2:])
	if len(addrBytes) != 4 && len(addrBytes) != 16 {
		return "", 0, fmt.Errorf("invalid address byte length: %d", len(addrBytes))
	}
	return net.IP(addrBytes).String(), port, nil
}

func buildOfferSDP(address string, port uint16) (string, error) {
	session, err := sdp.NewJSEPSessionDescription(false)
	if err != nil {
		return "", fmt.Errorf("new jsep session description: %w", err)
	}
	session.WithValueAttribute("group", "BUNDLE 0 1 2")

	candidateStr := fmt.Sprintf("0 1 udp 1686052607 %s %d typ srflx", address, port)
	fingerprint := "00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00"

	rtpMedia := func(codecType string, mid int, payloadType uint8, codecName string, clockRate uint32, channels uint16) *sdp.MediaDescription {
		return sdp.NewJSEPMediaDescription(codecType, nil).
			WithValueAttribute("mid", fmt.Sprintf("%d", mid)).
			WithICECredentials(usernameFragment, password).
			WithFingerprint("sha-256", fingerprint).
			WithPropertyAttribute("setup:actpass").
			WithPropertyAttribute("recvonly").
			WithPropertyAttribute("rtcp-mux").
			WithCandidate(candidateStr).
			WithCodec(payloadType, codecName, clockRate, channels, "")
	}

	session.WithMedia(rtpMedia("audio", 0, 111, "opus", 48000, 2))
	session.WithMedia(rtpMedia("video", 1, 102, "H264", 90000, 0))

	dataMedia := (&sdp.MediaDescription{
		MediaName: sdp.MediaName{
			Media:   "application",
			Port:    sdp.RangedPort{Value: 9},
			Protos:  []string{"UDP", "DTLS", "SCTP"},
			Formats: []string{"webrtc-datachannel"},
		},
	}).
		WithValueAttribute("mid", "2").
		WithICECredentials(usernameFragment, password).
		WithFingerprint("sha-256", fingerprint).
		WithPropertyAttribute("setup:actpass").
		WithCandidate(candidateStr).
		WithValueAttribute("sctp-port", "5000").
		WithValueAttribute("max-message-size", "262144")

	session.WithMedia(dataMedia)

	marshaled, err := session.Marshal()
	if err != nil {
		return "", fmt.Errorf("marshal offer sdp: %w", err)
	}
	return string(marshaled), nil
}

func loadCertificate() (webrtc.Certificate, error) {
	certFile, err := os.ReadFile(certPath)
	if err != nil {
		return webrtc.Certificate{}, fmt.Errorf("read %s: %w", certPath, err)
	}
	keyFile, err := os.ReadFile(keyPath)
	if err != nil {
		return webrtc.Certificate{}, fmt.Errorf("read %s: %w", keyPath, err)
	}
	cert, err := webrtc.CertificateFromPEM(string(certFile) + string(keyFile))
	if err != nil {
		return webrtc.Certificate{}, fmt.Errorf("parse certificate/key PEM: %w", err)
	}
	return *cert, nil
}

func encodeAddressPort(address string, port uint16) (string, error) {
	ip := net.ParseIP(address)
	if ip == nil {
		return "", fmt.Errorf("invalid candidate address: %s", address)
	}

	addrBytes := ip.To4()
	if addrBytes == nil || strings.Contains(address, ":") {
		addrBytes = ip.To16()
	}
	if addrBytes == nil {
		return "", fmt.Errorf("invalid candidate address: %s", address)
	}

	buf := make([]byte, len(addrBytes)+2)
	copy(buf, addrBytes)
	binary.LittleEndian.PutUint16(buf[len(addrBytes):], port)
	return base64.StdEncoding.EncodeToString(buf), nil
}

func addDataChannels(pc *webrtc.PeerConnection) error {
	negotiated, zero := true, uint16(0)

	channels := []struct {
		label          string
		id             uint16
		ordered        bool
		maxRetransmits *uint16
	}{
		{"pointer-movement", 0, false, &zero},
		{"pointer-click", 1, true, nil},
		{"keyboard", 2, true, nil},
		{"screen-resize", 3, false, nil},
		{"scroll", 4, false, &zero},
	}

	for _, ch := range channels {
		ordered, id := ch.ordered, ch.id
		if _, err := pc.CreateDataChannel(ch.label, &webrtc.DataChannelInit{
			Ordered:        &ordered,
			MaxRetransmits: ch.maxRetransmits,
			Negotiated:     &negotiated,
			ID:             &id,
		}); err != nil {
			return fmt.Errorf("%s channel: %w", ch.label, err)
		}
	}
	return nil
}

func setupScreenCapture() (mediadevices.Track, error) {
	params, err := x264.NewParams()
	if err != nil {
		return nil, fmt.Errorf("new x264 params: %w", err)
	}
	params.BitRate = 4_000_000
	params.Preset = x264.PresetUltrafast

	stream, err := mediadevices.GetDisplayMedia(mediadevices.MediaStreamConstraints{
		Video: func(c *mediadevices.MediaTrackConstraints) {
			c.FrameFormat = prop.FrameFormatOneOf{frame.FormatI420}
		},
		Codec: mediadevices.NewCodecSelector(mediadevices.WithVideoEncoders(&params)),
	})
	if err != nil {
		return nil, fmt.Errorf("get display media: %w", err)
	}
	tracks := stream.GetVideoTracks()
	if len(tracks) == 0 {
		return nil, fmt.Errorf("no video tracks returned by getDisplayMedia")
	}
	return tracks[0].(mediadevices.Track), nil
}
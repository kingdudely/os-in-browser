package main

import (
	"encoding/base64"
	"encoding/binary"
	"flag"
	"fmt"
	"net"
	"os"
	"strings"
	"time"

	"github.com/pion/mediadevices"
	"github.com/pion/mediadevices/pkg/codec/x264"
	_ "github.com/pion/mediadevices/pkg/driver/screen" // registers the screen capture driver
	"github.com/pion/mediadevices/pkg/frame"
	"github.com/pion/mediadevices/pkg/prop"
	"github.com/pion/sdp/v3"
	"github.com/pion/webrtc/v4"
)

const (
	usernameFragment = "myufraghere1234"
	password         = "mypasswordthatisverylong12345"

	certPath = "./certificate.pem"
	keyPath  = "./key.pem"
)

func main() {
	offerFlag := flag.String("offer", "", "base64-encoded share id (compressed srflx address:port)")
	flag.Parse()

	if *offerFlag == "" {
		fmt.Fprintln(os.Stderr, "missing -offer argument")
		os.Exit(1)
	}

	address, port, err := decodeAddressPort(*offerFlag)
	if err != nil {
		fmt.Fprintln(os.Stderr, "decode share id:", err)
		os.Exit(1)
	}

	cert, err := loadCertificate()
	if err != nil {
		fmt.Fprintln(os.Stderr, "load certificate:", err)
		os.Exit(1)
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
		fmt.Fprintln(os.Stderr, "new peer connection:", err)
		os.Exit(1)
	}
	defer pc.Close()

	if err := addDataChannels(pc); err != nil {
		fmt.Fprintln(os.Stderr, "add data channels:", err)
		os.Exit(1)
	}

	track, err := setupScreenCapture()
	if err != nil {
		fmt.Fprintln(os.Stderr, "setup screen capture:", err)
		os.Exit(1)
	}

	if _, err := pc.AddTransceiverFromTrack(track, webrtc.RTPTransceiverInit{
		Direction: webrtc.RTPTransceiverDirectionSendonly,
	}); err != nil {
		fmt.Fprintln(os.Stderr, "add video track:", err)
		os.Exit(1)
	}

	offerSDP, err := buildOfferSDP(address, port)
	if err != nil {
		fmt.Fprintln(os.Stderr, "build offer sdp:", err)
		os.Exit(1)
	}

	if err := pc.SetRemoteDescription(webrtc.SessionDescription{
		Type: webrtc.SDPTypeOffer,
		SDP:  offerSDP,
	}); err != nil {
		fmt.Fprintln(os.Stderr, "set remote description:", err)
		os.Exit(1)
	}

	answer, err := pc.CreateAnswer(nil)
	if err != nil {
		fmt.Fprintln(os.Stderr, "create answer:", err)
		os.Exit(1)
	}

	found := make(chan *webrtc.ICECandidate, 1)
	pc.OnICECandidate(func(candidate *webrtc.ICECandidate) {
		if candidate != nil && candidate.Typ == webrtc.ICECandidateTypeSrflx {
			select {
			case found <- candidate:
			default:
			}
		}
	})

	if err := pc.SetLocalDescription(answer); err != nil {
		fmt.Fprintln(os.Stderr, "set local description:", err)
		os.Exit(1)
	}

	var candidate *webrtc.ICECandidate
	select {
	case candidate = <-found:
	case <-time.After(30 * time.Second):
		fmt.Fprintln(os.Stderr, "timed out waiting for srflx candidate")
		os.Exit(1)
	}

	shareID, err := encodeAddressPort(candidate.Address, candidate.Port)
	if err != nil {
		fmt.Fprintln(os.Stderr, "encode share id:", err)
		os.Exit(1)
	}
	fmt.Println(shareID)

	// Keep the process alive for the lifetime of the connection.
	closed := make(chan struct{})
	var once sync.Once
	pc.OnConnectionStateChange(func(s webrtc.PeerConnectionState) {
		if s == webrtc.PeerConnectionStateFailed || s == webrtc.PeerConnectionStateClosed || s == webrtc.PeerConnectionStateDisconnected {
			once.Do(func() { close(closed) })
		}
	})

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, os.Interrupt, syscall.SIGTERM)

	select {
	case <-closed:
		fmt.Fprintln(os.Stderr, "peer connection closed")
	case s := <-sig:
		fmt.Fprintln(os.Stderr, "received signal:", s)
	}
}

// decodeAddressPort mirrors the browser Client's share-id codec: the
// decoded bytes are the raw address (4 bytes IPv4 or 16 bytes IPv6)
// followed by a little-endian uint16 port.
func decodeAddressPort(shareID string) (string, uint16, error) {
	raw, err := base64.StdEncoding.DecodeString(shareID)
	if err != nil {
		return "", 0, fmt.Errorf("invalid share id, does not meet bound requirements: %w", err)
	}
	if len(raw) < 3 {
		return "", 0, fmt.Errorf("share id too short")
	}

	addrBytes := raw[:len(raw)-2]
	port := binary.LittleEndian.Uint16(raw[len(raw)-2:])

	switch len(addrBytes) {
	case 4, 16:
		return net.IP(addrBytes).String(), port, nil
	default:
		return "", 0, fmt.Errorf("invalid address byte length: %d", len(addrBytes))
	}
}

// buildOfferSDP reconstructs a plausible offer SDP from just the peer's
// address/port, the same trick Client.js's connectToShareId uses in
// reverse: since we only get a compressed token (not a real browser
// offer), we fill in the fixed, always-the-same protocol shape (one
// audio, one video, one datachannel m= section, BUNDLEd) and let pion
// fill in the rest via CreateAnswer. Built with pion/sdp's JSEP helpers
// instead of hand-formatted "a=..." strings.
func buildOfferSDP(address string, port uint16) (string, error) {
	session, err := sdp.NewJSEPSessionDescription(false)
	if err != nil {
		return "", fmt.Errorf("new jsep session description: %w", err)
	}
	session.WithValueAttribute("group", "BUNDLE 0 1 2")

	candidate := sdp.ICECandidate{
		Foundation: "0",
		Component:  1,
		Priority:   1686052607,
		Address:    address,
		Protocol:   "udp",
		Port:       port,
		Typ:        "srflx",
	}

	rtpMedia := func(codecType string, mid int, payloadType uint8, codecName string, clockRate uint32, channels uint16) *sdp.MediaDescription {
		return sdp.NewJSEPMediaDescription(codecType, nil).
			WithValueAttribute("mid", fmt.Sprintf("%d", mid)).
			WithICECredentials(usernameFragment, password).
			// Placeholder -- DisableCertificateFingerprintVerification means
			// this value is never actually checked.
			WithFingerprint("sha-256", "00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00").
			WithPropertyAttribute("setup:actpass").
			WithPropertyAttribute("recvonly").
			WithPropertyAttribute("rtcp-mux").
			WithICECandidate(candidate).
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
		WithFingerprint("sha-256", "00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00").
		WithPropertyAttribute("setup:actpass").
		WithICECandidate(candidate).
		WithValueAttribute("sctp-port", "5000").
		WithValueAttribute("max-message-size", "262144")

	session.WithMedia(dataMedia)

	marshaled, err := session.Marshal()
	if err != nil {
		return "", fmt.Errorf("marshal offer sdp: %w", err)
	}
	return string(marshaled), nil
}

// loadCertificate loads the long-lived DTLS certificate/key pair from
// ./certificate.pem and ./key.pem so the fingerprint pion negotiates stays
// stable across runs (matching whatever is published in
// ./public/fingerprint.txt for the browser side to trust ahead of time).
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

// encodeAddressPort packs a candidate address + port the same way the JS
// getShareId() does: raw address bytes (4 for IPv4, 16 for IPv6) followed
// by a little-endian uint16 port, base64-encoded.
func encodeAddressPort(address string, port uint16) (string, error) {
	ip := net.ParseIP(address)
	if ip == nil {
		return "", fmt.Errorf("invalid candidate address: %s", address)
	}

	var addrBytes []byte
	if v4 := ip.To4(); v4 != nil && !strings.Contains(address, ":") {
		addrBytes = v4
	} else {
		addrBytes = ip.To16()
		if addrBytes == nil {
			return "", fmt.Errorf("invalid candidate address: %s", address)
		}
	}

	buf := make([]byte, len(addrBytes)+2)
	copy(buf, addrBytes)
	binary.LittleEndian.PutUint16(buf[len(addrBytes):], port)

	return base64.StdEncoding.EncodeToString(buf), nil
}

// addDataChannels creates the same five negotiated data channels the
// browser Client expects, with matching ids/labels/reliability settings.
func addDataChannels(pc *webrtc.PeerConnection) error {
	negotiated := true
	zero := uint16(0)

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
		ordered := ch.ordered
		id := ch.id
		if _, err := pc.CreateDataChannel(ch.label, &webrtc.DataChannelInit{
			Ordered:        &ordered,
			MaxRetransmits: ch.maxRetransmits,
			Negotiated:     &negotiated,
			ID:             &id,
		}); err != nil {
			return err
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
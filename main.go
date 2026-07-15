package main

import (
	"fmt"
	"log"
	"net"
	"os"
	"strings"
	"time"

	"github.com/pion/mediadevices"
	"github.com/pion/mediadevices/pkg/codec/x264"
	_ "github.com/pion/mediadevices/pkg/driver/screen" // registers the screen capture driver
	"github.com/pion/mediadevices/pkg/frame"
	"github.com/pion/mediadevices/pkg/prop"
	"github.com/pion/webrtc/v4"
)

const (
	usernameFragment = "myufraghere1234"
	password         = "mypasswordthatisverylong12345"
	iceCandidatePrio = 1686052607
)

func main() {
	remoteAddress := os.Getenv("REMOTE_ADDRESS")
	fingerprint := os.Getenv("DTLS_FINGERPRINT")

	pc, err := setupPeerConnection()
	if err != nil {
		log.Fatalf("setup peer connection: %v", err)
	}
	defer pc.Close()

	track, err := setupScreenCapture()
	if err != nil {
		log.Fatalf("setup screen capture: %v", err)
	}

	if _, err := pc.AddTransceiverFromTrack(track, webrtc.RTPTransceiverInit{
		Direction: webrtc.RTPTransceiverDirectionSendonly,
	}); err != nil {
		log.Fatalf("add video track: %v", err)
	}

	localAddress, err := gatherLocalSrflxAddress(pc)
	if err != nil {
		log.Fatalf("gather local srflx address: %v", err)
	}

	if err := writeGithubOutput("srflx_address", localAddress); err != nil {
		log.Fatalf("write github output: %v", err)
	}
	log.Println("local srflx address:", localAddress)

	if remoteAddress != "" {
		if err := connectToRemoteAddress(pc, remoteAddress, fingerprint); err != nil {
			log.Fatalf("connect to remote address: %v", err)
		}
		log.Println("connected to remote:", remoteAddress)
	}

	select {} // keep the process (and its tracks) alive
}

// setupPeerConnection builds the RTCPeerConnection with the same STUN
// servers used on the browser side.
func setupPeerConnection() (*webrtc.PeerConnection, error) {
	return webrtc.NewPeerConnection(webrtc.Configuration{
		ICEServers: []webrtc.ICEServer{
			{URLs: []string{"stun:stun.l.google.com:19302"}},
			{URLs: []string{"stun:stun.cloudflare.com:3478"}},
		},
	})
}

// setupScreenCapture is the Go equivalent of getDisplayMedia(), using
// pion/mediadevices' screen driver with x264 (ultrafast preset, the
// fastest H.264 option for CPU-only GitHub Actions runners).
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

// gatherLocalSrflxAddress creates an offer, patches in the fixed
// ice-ufrag/ice-pwd, sets it as the local description, then returns as soon
// as the first srflx ICE candidate is found (no need to wait for the rest
// of gathering to finish).
func gatherLocalSrflxAddress(pc *webrtc.PeerConnection) (string, error) {
	offer, err := pc.CreateOffer(nil)
	if err != nil {
		return "", fmt.Errorf("create offer: %w", err)
	}

	sdp := replaceAllAttr(offer.SDP, "a=ice-ufrag:", usernameFragment)
	sdp = replaceAllAttr(sdp, "a=ice-pwd:", password)

	found := make(chan string, 1)
	pc.OnICECandidate(func(candidate *webrtc.ICECandidate) {
		if candidate != nil && candidate.Typ == webrtc.ICECandidateTypeSrflx {
			select {
			case found <- fmt.Sprintf("%s:%d", candidate.Address, candidate.Port):
			default: // already found one, ignore the rest
			}
		}
	})

	if err := pc.SetLocalDescription(webrtc.SessionDescription{Type: offer.Type, SDP: sdp}); err != nil {
		return "", fmt.Errorf("set local description: %w", err)
	}

	select {
	case addr := <-found:
		return addr, nil
	case <-time.After(30 * time.Second):
		return "", fmt.Errorf("timed out waiting for srflx candidate")
	}
}

// connectToRemoteAddress hand-crafts an SDP answer around a single srflx
// candidate at remoteAddress.
func connectToRemoteAddress(pc *webrtc.PeerConnection, remoteAddress, fingerprint string) error {
	host, port, err := net.SplitHostPort(remoteAddress)
	if err != nil {
		return fmt.Errorf("parse remote address: %w", err)
	}

	iceLines := []string{
		fmt.Sprintf("c=IN IP4 %s", host),
		fmt.Sprintf("a=ice-ufrag:%s", usernameFragment),
		fmt.Sprintf("a=ice-pwd:%s", password),
		fmt.Sprintf("a=fingerprint:sha-256 %s", fingerprint),
		"a=setup:active",
		fmt.Sprintf("a=candidate:0 1 UDP %d %s %s typ srflx", iceCandidatePrio, host, port),
	}

	section := func(mLine string, mid int, extra ...string) []string {
		lines := append([]string{mLine}, iceLines...)
		lines = append(lines, extra...)
		lines = append(lines, fmt.Sprintf("a=mid:%d", mid), "a=rtcp-mux")
		return lines
	}

	sdp := []string{"v=0", "o=- 0 0 IN IP4 0.0.0.0", "s=-", "t=0 0", "a=group:BUNDLE 0 1 2"}
	sdp = append(sdp, section("m=audio 9 UDP/TLS/RTP/SAVPF 111", 0, "a=recvonly", "a=rtpmap:111 opus/48000/2")...)
	sdp = append(sdp, section("m=video 9 UDP/TLS/RTP/SAVPF 102", 1, "a=sendonly", "a=rtpmap:102 H264/90000")...)
	sdp = append(sdp, section("m=application 9 UDP/DTLS/SCTP webrtc-datachannel", 2,
		"a=sctp-port:5000", "a=max-message-size:262144")...)
	sdp = append(sdp, "")

	return pc.SetRemoteDescription(webrtc.SessionDescription{
		Type: webrtc.SDPTypeAnswer,
		SDP:  strings.Join(sdp, "\r\n"),
	})
}

func replaceAllAttr(sdp, prefix, value string) string {
	lines := strings.Split(sdp, "\r\n")
	for i, line := range lines {
		if strings.HasPrefix(line, prefix) {
			lines[i] = prefix + value
		}
	}
	return strings.Join(lines, "\r\n")
}

// writeGithubOutput appends `key=value` to $GITHUB_OUTPUT for a later
// workflow step to pick up (e.g. write to a file and upload as an artifact).
func writeGithubOutput(key, value string) error {
	path := os.Getenv("GITHUB_OUTPUT")
	if path == "" {
		fmt.Printf("GITHUB_OUTPUT not set, would have written: %s=%s\n", key, value)
		return nil
	}

	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return fmt.Errorf("open GITHUB_OUTPUT: %w", err)
	}
	defer f.Close()

	_, err = fmt.Fprintf(f, "%s=%s\n", key, value)
	return err
}
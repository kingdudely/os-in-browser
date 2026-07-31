package main

import (
	"fmt"
	"log"
	"os"
	"sync"
	"time"

	"github.com/pion/mediadevices"
	"github.com/pion/mediadevices/pkg/codec/x264"
	_ "github.com/pion/mediadevices/pkg/driver/screen"
	"github.com/pion/webrtc/v4"
)

func fatal(step string, err error) {
	if err != nil {
		log.Fatalf("%s: %v", step, err)
	}
}

func main() {
	offer := os.Getenv("OFFER")
	if offer == "" {
		log.Fatal("OFFER environment variable is not set")
	}

	pc, answerSDP, err := createAnswer(offer)
	fatal("create answer", err)
	defer pc.Close()

	fatal("write answer.txt", os.WriteFile("answer.txt", []byte(answerSDP), 0644))

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

// createAnswer sets up a PeerConnection + screen-capture track for the given
// offer SDP, waits for ICE gathering to complete, and returns the live
// PeerConnection along with the full answer SDP (with ICE candidates
// embedded). The caller is responsible for closing pc.
func createAnswer(offer string) (*webrtc.PeerConnection, string, error) {
	pc, err := webrtc.NewPeerConnection(webrtc.Configuration{
		ICEServers: []webrtc.ICEServer{
			{URLs: []string{"stun:stun.l.google.com:19302"}},
			{URLs: []string{"stun:stun.cloudflare.com:3478"}},
		},
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

	if err := pc.SetRemoteDescription(webrtc.SessionDescription{
		Type: webrtc.SDPTypeOffer,
		SDP:  offer,
	}); err != nil {
		pc.Close()
		return nil, "", fmt.Errorf("set remote description: %w", err)
	}

	answer, err := pc.CreateAnswer(nil)
	if err != nil {
		pc.Close()
		return nil, "", fmt.Errorf("create answer: %w", err)
	}

	// Use GatheringCompletePromise instead of pulling out a single srflx
	// candidate — this bakes every gathered candidate directly into the
	// answer SDP, so there's no need for a custom share-id encoding on
	// the way back.
	gatherComplete := webrtc.GatheringCompletePromise(pc)

	if err := pc.SetLocalDescription(answer); err != nil {
		pc.Close()
		return nil, "", fmt.Errorf("set local description: %w", err)
	}

	select {
	case <-gatherComplete:
	case <-time.After(30 * time.Second):
		pc.Close()
		return nil, "", fmt.Errorf("timed out waiting for ICE gathering to complete")
	}

	final := pc.LocalDescription()
	if final == nil {
		pc.Close()
		return nil, "", fmt.Errorf("local description missing after gathering complete")
	}

	return pc, final.SDP, nil
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
		Video:  func(c *mediadevices.MediaTrackConstraints) {},
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
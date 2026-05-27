const video = document.getElementById("video");

const peer = new Peer({
  host: location.hostname,
  port: location.port,
  path: "/peerjs"
});

peer.on("open", id => {
  console.log("VIEWER_READY", id);
});

document
  .getElementById("connect")
  .onclick = () => {

  const hostId =
    document.getElementById("peerId").value;

  console.log("CALLING", hostId);

  const call =
    peer.call(hostId, null);

  call.on("stream", stream => {
    console.log("STREAM_RECEIVED");

    video.srcObject = stream;

    video.play().catch(console.error);
  });

  call.on("error", console.error);
};

peer.on("error", console.error);

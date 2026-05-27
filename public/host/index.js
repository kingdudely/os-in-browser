const status = document.getElementById("status");
console.log(location.hostname);

const peer = new Peer("host", {
  host: location.hostname,
  port: location.port,
  path: "/peerjs"
});

peer.on("open", id => {
  console.log("HOST_READY", id);

  status.innerText =
    "Ready. ID: " + id;
});

peer.on("call", async call => {
  console.log("INCOMING_CALL");

  try {
    const stream =
      await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
      });

    console.log("STREAM_READY");

    call.answer(stream);

  } catch (err) {
    console.error(err);
  }
});

peer.on("error", console.error);

window.addEventListener("error", (event) => {
	const errorMessage = event.message || "Unknown error occurred";
    window.alert(`Error:\n${errorMessage}`);
});

window.addEventListener("unhandledrejection", (event) => {
    const asyncErrorMessage = event.reason?.message || event.reason || "Unknown async error occurred";
    window.alert(`Async error:\n${asyncErrorMessage}`);
});

const code = new URLSearchParams(location.search).get("code");
if (code) {
	history.replaceState(history.state, document.title, location.pathname);
	const oauth = document.getElementById("oauth");
	oauth.code.value = code;
	oauth.requestSubmit(document.getElementById("download-access-token"));
	// return
}

import ConnectToServerPeer from "./ConnectToServerPeer.js";
import codeMap from "./code-map.json" with { type: "json" };

function triggerImmersiveMode() {
	if (document.fullscreenEnabled && !document.fullscreenElement) {
		document.body.requestFullscreen({ // target, await
			"navigationUI": "hide"
		}).catch(() => {});
	};

	if (!document.pointerLockElement) {
		document.body.requestPointerLock({ // target, await
			"unadjustedMovement": true
		}).catch(() => {});
	}
}

function waitForIceGathering (peer) {
	return new Promise((resolve) => {
		if (peer.iceGatheringState === "complete") {
			resolve();
		} else {
			peer.addEventListener("icegatheringstatechange", function onStateChange() {
				if (peer.iceGatheringState === "complete") {
					peer.removeEventListener("icegatheringstatechange", onStateChange);
					resolve();
				}
			});
		}
	});
}

const oauthDialog = document.getElementById("oauth-dialog");
oauthDialog.showModal();
oauthDialog.addEventListener('cancel', (event) => event.preventDefault());

document.getElementById("credential-file").addEventListener("change", async (event) => {
	const credentialFile = event.target.files[0];
	if (!credentialFile) return;

	const accessToken = new URLSearchParams(await credentialFile.text()).get("access_token");
	if (!accessToken) {
		alert("Invalid credential file");
		return;
	}

	onlogin(accessToken);
});

const screenshare = document.getElementById("screenshare");
const sharedBytes = new Uint8Array(12);
const sharedView = new DataView(sharedBytes.buffer);

async function onlogin(accessToken) {
	oauthDialog.close();

	const peer = new RTCPeerConnection({
		iceServers: [
			{ urls: "stun:stun.l.google.com:19302" }
		]
	});

	peer.addEventListener("track", (event) => {
		screenshare.srcObject = event.streams[0];
		screenshare.play().catch(console.warn); // () => {}
	});

	peer.addTransceiver("video", { direction: "recvonly" });

	const pointerMovementChannel = peer.createDataChannel("pointer-movement", {
		ordered: false,
		maxRetransmits: 0,
		negotiated: true,
		id: 0
	});

	const pointerClickChannel = peer.createDataChannel("pointer-click", {
		ordered: true,
		negotiated: true,
		id: 1
	});

	const keyboardTypeChannel = peer.createDataChannel("keyboard-type", {
		ordered: true,
		negotiated: true,
		id: 2
	});

	// resizeScreen

	const pointerScrollChannel = peer.createDataChannel("pointer-scroll", {
		ordered: false,
		maxRetransmits: 0,
		negotiated: true,
		id: 4
	});

	window.addEventListener("pointermove", (event) => {
		event.preventDefault();
		if (pointerMovementChannel.readyState !== "open") return;

		let packetSize;
		if (document.pointerLockElement) {
			sharedView.setInt16(0, event.movementX, true);
			sharedView.setInt16(2, event.movementY, true);
			packetSize = 4;
		} else {
			sharedView.setUint32(0, event.clientX, true);
			sharedView.setUint32(4, event.clientY, true);
			packetSize = 8;
		}
		
		pointerMovementChannel.send(sharedBytes.subarray(0, packetSize));
	});

	window.addEventListener("pointerdown", (event) => {
		event.preventDefault();
		if (pointerClickChannel.readyState !== "open") return;
		triggerImmersiveMode();

		sharedView.setUint8(0, 1); // isDown
		sharedView.setUint8(1, event.button);
		pointerClickChannel.send(sharedBytes.subarray(0, 2));
	});

	window.addEventListener("pointerup", (event) => {
		event.preventDefault();
		if (pointerClickChannel.readyState !== "open") return;

		sharedView.setUint8(0, 0); // isDown
		sharedView.setUint8(1, event.button);
		pointerClickChannel.send(sharedBytes.subarray(0, 2));
	});

	window.addEventListener("keydown", (event) => {
		event.preventDefault();
		if (keyboardTypeChannel.readyState !== "open" || event.repeat) return;
		triggerImmersiveMode();

		if (!(event.code in codeMap)) {
			console.warn("Code is not supported");
			return;
		}

		sharedView.setUint8(0, 1); // isDown
		sharedView.setUint8(1, codeMap[event.code]);

		keyboardTypeChannel.send(sharedBytes.subarray(0, 2));
	});

	window.addEventListener("keyup", (event) => {
		event.preventDefault();
		if (keyboardTypeChannel.readyState !== "open") return;

		if (!(event.code in codeMap)) {
			console.warn("Code is not supported");
			return;
		}

		sharedView.setUint8(0, 0); // isDown
		sharedView.setUint8(1, codeMap[event.code]);

		keyboardTypeChannel.send(sharedBytes.subarray(0, 2));
	});

	const screenResizeChannel = peer.createDataChannel("screen-resize", {
		ordered: false,
		negotiated: true,
		id: 3
	});

	function onResize() {
		if (screenResizeChannel.readyState !== "open") return;
		console.log("Sending screen resize packet...");

		sharedView.setUint32(0, window.innerWidth, true);
		sharedView.setUint32(4, window.innerHeight, true);
		screenResizeChannel.send(sharedBytes.subarray(0, 8));
	}

	screenResizeChannel.addEventListener("open", onResize);
	window.addEventListener("resize", onResize); // resize observer

	window.addEventListener("wheel", (event) => {
		event.preventDefault();
		if (pointerScrollChannel.readyState !== "open") return;

		const multiplier = (function() {
			switch (event.deltaMode) {
				default: console.warn("Unsupported deltaMode, will use DOM_DELTA_PIXEL");
				case event.DOM_DELTA_PIXEL: return 1;
				case event.DOM_DELTA_LINE: return 20; // accurate enough
				case event.DOM_DELTA_PAGE: return window.innerHeight;
			}
		})();

		sharedView.setFloat32(0, event.deltaX * multiplier, true);
		sharedView.setFloat32(4, event.deltaY * multiplier, true);
		sharedView.setFloat32(8, event.deltaZ * multiplier, true);
		pointerScrollChannel.send(sharedBytes.subarray(0, 12));
	});

	await peer.setLocalDescription();
	await waitForIceGathering(peer); 

	const offer = peer.localDescription.sdp;

	const repoEndpoint = "https://api.github.com/repos/kingdudely/os-in-browser";
	const headers = {
		"Authorization": `token ${accessToken}`,
		"Content-Type": "application/json"
	};

	const { default_branch } = await (await fetch(repoEndpoint, { headers })).json();
	const { workflow_run_id } = await (await fetch(`${repoEndpoint}/actions/workflows/main.yml/dispatches`, {
		headers,
		"body": JSON.stringify({
			"ref": default_branch,
			"return_run_details": true,
			"inputs": { "os": "windows-latest", offer }
		}),
		"method": "POST",
	})).json();

	// clearTimeout
	const timeout = setTimeout(() => window.alert("Taking a little too long to connect, maybe try refreshing?"), 67_6767);
	let answerDownloadUrl;
	while (true) {
		const { artifacts } = await (await fetch(`${repoEndpoint}/actions/runs/${workflow_run_id}/artifacts`, { headers })).json();
		answerDownloadUrl = artifacts?.find((artifact) => artifact.name === "answer.txt")?.archive_download_url;
		if (answerDownloadUrl) {
			clearTimeout(timeout);
			break;
		}

		await sleep(1000);
	}

	const answer = await (await fetch(answerDownloadUrl, { headers })).text();
	await peer.setRemoteDescription({ "type": "answer", "sdp": answer });
}
// view/index.js (Unified Pointer Events + Drag + Hybrid Input Edition)
const remoteVideo = document.getElementById('remote-video');
const keyboardButton = document.getElementById('keyboard-button');
const isHttps = location.protocol === "https:";

const peer = new Peer({
	host: location.hostname,
	port: location.port || (isHttps ? 443 : 80),
	path: '/peerjs',
	secure: isHttps
});

let dataConnection;

peer.on("open", (id) => {
	dataConnection = peer.connect('host');
});

peer.on('call', (call) => {
	call.answer();
	call.on('stream', (remoteStream) => {
		remoteVideo.srcObject = remoteStream;
		remoteVideo.play().catch(console.error);
	});
});

function sendEventData(type, args) {
	if (dataConnection && dataConnection.open) {
		dataConnection.send({ type, args });
	}
}

// --- Hybrid Input Button & Drag Logic (Pointer Unified) ---

let isDragging = false;
let startX, startY;
let initialLeft, initialTop;
let dragThresholdPassed = false;

keyboardButton.addEventListener('pointerdown', (e) => {
	isDragging = true;
	dragThresholdPassed = false;
	
	startX = e.clientX;
	startY = e.clientY;
	
	const rect = keyboardButton.getBoundingClientRect();
	initialLeft = rect.left;
	initialTop = rect.top;
	
	// Locks the pointer to this element so dragging doesn't break if the finger slips off
	keyboardButton.setPointerCapture(e.pointerId);
});

keyboardButton.addEventListener('pointermove', (e) => {
	if (!isDragging) return;
	
	const deltaX = e.clientX - startX;
	const deltaY = e.clientY - startY;
	
	// Treat as a drag if moved more than 5 pixels
	if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
		dragThresholdPassed = true;
	}
	
	if (dragThresholdPassed) {
		let newLeft = initialLeft + deltaX;
		let newTop = initialTop + deltaY;
		
		// Boundary lock checks directly relative to the main body view space
		newLeft = Math.max(10, Math.min(document.body.clientWidth - keyboardButton.offsetWidth - 10, newLeft));
		newTop = Math.max(10, Math.min(document.body.clientHeight - keyboardButton.offsetHeight - 10, newTop));
		
		keyboardButton.style.right = 'auto';
		keyboardButton.style.bottom = 'auto';
		keyboardButton.style.left = `${newLeft}px`;
		keyboardButton.style.top = `${newTop}px`;
	}
});

keyboardButton.addEventListener('pointerup', (e) => {
	if (!isDragging) return;
	isDragging = false;
	keyboardButton.releasePointerCapture(e.pointerId);
	
	// If they were dragging, cancel the virtual keyboard focus sequence
	if (dragThresholdPassed) {
		e.preventDefault();
		e.stopPropagation();
		if (document.activeElement === keyboardButton) {
			keyboardButton.blur();
		}
	}
});

// Focus state transitions manage text labels via HTML dataset variables
keyboardButton.addEventListener('focus', () => {
	keyboardButton.value = keyboardButton.dataset.opened;
	keyboardButton.removeAttribute('readonly');
});

keyboardButton.addEventListener('blur', () => {
	keyboardButton.value = keyboardButton.dataset.closed;
	keyboardButton.setAttribute('readonly', 'true');
});

// Mobile/IME layout character text buffer pipe
keyboardButton.addEventListener('input', (event) => {
	if (event.data) {
		sendEventData('input', [event.data]);
	}
	// Instantly reset input frame text representation back to active closed state label
	keyboardButton.value = keyboardButton.dataset.opened; 
});

// --- Unified Pointer Coordinate & Click System ---

window.addEventListener('pointermove', (event) => {
	// Freeze canvas cursor tracking if the user is dragging the menu button
	if (isDragging) return;
	
	const rect = remoteVideo.getBoundingClientRect();
	const boundedX = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
	const boundedY = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
	
	// Sends 'mousemove' token to keep host-side VM logic completely intact
	sendEventData('mousemove', [boundedX, boundedY]);
});

window.addEventListener('pointerdown', (event) => {
	if (event.target === keyboardButton) return;
	
	// CRITICAL SAFETY: Only stream layout click clicks if it's a real mouse interaction.
	// This implicitly isolates mobile swipe/pan/zoom actions from triggering clicks.
	if (event.pointerType === 'mouse') {
		sendEventData('mousedown', [event.button]);
	}
});

window.addEventListener('pointerup', (event) => {
	if (event.target === keyboardButton) return;
	
	if (event.pointerType === 'mouse') {
		sendEventData('mouseup', [event.button]);
	}
});

window.addEventListener('mouseleave', (event) => {
	// Automatically release host mouse buttons if user drags cursor completely out of browser window bounds
	if (event.buttons & 1) sendEventData('mouseup', [0]);
	if (event.buttons & 2) sendEventData('mouseup', [2]);
	if (event.buttons & 4) sendEventData('mouseup', [1]);
});

// --- Hardware Keyboard Processing Pipes ---
window.addEventListener('keydown', (event) => {
	if (event.key === 'Process') return;
	event.preventDefault();
	sendEventData(event.type, [{ code: event.code || "", key: event.key || "" }]);
});

window.addEventListener('keyup', (event) => {
	if (event.key === 'Process') return;
	event.preventDefault();
	sendEventData(event.type, [{ code: event.code || "", key: event.key || "" }]);
});

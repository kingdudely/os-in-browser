from os import environ
from pynput.mouse import Button, Controller as MouseController
from pynput.keyboard import Key, Controller as KeyboardController
from aiortc import RTCPeerConnection, RTCSessionDescription
from aiortc.contrib.media import MediaPlayer
from struct import unpack
from pyee import EventEmitter
from sys import platform

match platform:
	case "linux":
		def get_screenshare(**options):
			# options.setdefault("draw_mouse", "1")
			return MediaPlayer(environ["DISPLAY"], format="x11grab", options=options) # :0.0
	case "darwin":
		def get_screenshare(**options):
			# options.setdefault("capture_mouse", "1")
			return MediaPlayer("Capture screen 0", format="avfoundation", options=options)
	case "win32":
		def get_screenshare(**options):
			# options.setdefault("draw_mouse", "1")
			return MediaPlayer("desktop", format="gdigrab", options=options)
	case _:
		raise RuntimeError(f"Unsupported platform: {platform}")

mouse = MouseController()
keyboard = KeyboardController()

BUTTON_MAP = {
    0: Button.left,
    1: Button.middle,
    2: Button.right
}

CODE_MAP = {
    "KeyA": "a", "KeyB": "b", "KeyC": "c", "KeyD": "d", "KeyE": "e", "KeyF": "f",
    "KeyG": "g", "KeyH": "h", "KeyI": "i", "KeyJ": "j", "KeyK": "k", "KeyL": "l",
    "KeyM": "m", "KeyN": "n", "KeyO": "o", "KeyP": "p", "KeyQ": "q", "KeyR": "r",
    "KeyS": "s", "KeyT": "t", "KeyU": "u", "KeyV": "v", "KeyW": "w", "KeyX": "x",
    "KeyY": "y", "KeyZ": "z",

    "Digit1": "1", "Digit2": "2", "Digit3": "3", "Digit4": "4", "Digit5": "5",
    "Digit6": "6", "Digit7": "7", "Digit8": "8", "Digit9": "9", "Digit0": "0",

    "ShiftLeft": Key.shift, "ShiftRight": Key.shift_r,
    "ControlLeft": Key.ctrl, "ControlRight": Key.ctrl_r,
    "AltLeft": Key.alt, "AltRight": Key.alt_r,
    "MetaLeft": Key.cmd, "MetaRight": Key.cmd,

    "Enter": Key.enter,
    "Backspace": Key.backspace,
    "Tab": Key.tab,
    "Space": Key.space,
    "Escape": Key.esc,
    "Delete": Key.delete,
    "ArrowUp": Key.up,
    "ArrowDown": Key.down,
    "ArrowLeft": Key.left,
    "ArrowRight": Key.right,

    "Semicolon": ";", "Equal": "=", "Comma": ",", "Minus": "-", "Period": ".",
    "Slash": "/", "Backquote": "`", "BracketLeft": "[", "BracketRight": "]",
    "Backslash": "\\", "Quote": "'",
}

async def create_peer(offer):
	screenshare = get_screenshare(framerate="30")
	sdp = await request.text()
	peer = RTCPeerConnection()
	peer.addTrack(screenshare.video)

	pointer_movement_channel = peer.createDataChannel("pointer-movement", ordered=False, maxRetransmits=0, negotiated=True, id=0)
	@pointer_movement_channel.on("message")
	def on_pointer_movement(data):
		movementX, movementY = unpack("<hh", data)
		mouse.move(movementX, movementY)

	pointer_click_channel = peer.createDataChannel("pointer-click", ordered=True, negotiated=True, id=1)
	@pointer_click_channel.on("message")
	def on_pointer_click(data):
		is_down = data[0] == 1
		button_code = data[1]
		button = BUTTON_MAP.get(button_code)
		
		if button:
			if is_down:
				mouse.press(button)
			else:
				mouse.release(button)

	keyboard_channel = peer.createDataChannel("keyboard", ordered=True, negotiated=True, id=2)
	@keyboard_channel.on("message")
	def on_keyboard(data):
		is_down = data[0] == "\x01"
		code = data[1:]

		target_key = CODE_MAP.get(code)
		
		if target_key:
			if is_down:
				keyboard.press(target_key)
			else:
				keyboard.release(target_key)

	await peer.setRemoteDescription(RTCSessionDescription(sdp=offer, type="offer"))
	answer = await peer.createAnswer()
	await peer.setLocalDescription(answer)
	return peer
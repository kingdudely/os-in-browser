# TODO: use protobuf maybe, support audio, maybe support touchscreen and stylus and microphone and camera...
from sys import platform
from aiortc.contrib.media import MediaPlayer
from os import getenv
from pynput.mouse import Button, Controller as MouseController
from pynput.keyboard import Key, Controller as KeyboardController
from aiohttp import web
from aiortc import RTCPeerConnection, RTCSessionDescription
from aiohttp_index import IndexMiddleware
from aiohttp_basicauth import BasicAuthMiddleware
from with_cloudflared import cloudflared
from struct import unpack

username = getenv("USERNAME", "")
password = getenv("PASSWORD", "")

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

match platform:
	case "linux":
		def get_screenshare(**options):
			options.setdefault("draw_mouse", "1")
			return MediaPlayer(getenv("DISPLAY", ":0"), format="x11grab", options=options) # :0.0
	case "darwin":
		def get_screenshare(**options):
			options.setdefault("capture_mouse", "1")
			return MediaPlayer("Capture screen 0", format="avfoundation", options=options)
	case "win32":
		def get_screenshare(**options):
			options.setdefault("draw_mouse", "1")
			return MediaPlayer("desktop", format="gdigrab", options=options)
	case _:
		raise RuntimeError(f"Unsupported platform: {platform}")

mouse = MouseController()
keyboard = KeyboardController()
app = web.Application(middlewares=[IndexMiddleware(), BasicAuthMiddleware(username=username, password=password)])
routes = web.RouteTableDef()

routes.static('/', './client')

@routes.post("/whip")
async def whip(request):
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
		print(type(data))
		is_down = data[0] == 1
		code = data[1:]

		target_key = CODE_MAP.get(code)
		
		if target_key:
			if is_down:
				keyboard.press(target_key)
			else:
				keyboard.release(target_key)

	await peer.setRemoteDescription(RTCSessionDescription(sdp=sdp, type="offer"))
	answer = await peer.createAnswer()
	await peer.setLocalDescription(answer)
	return web.Response(text=peer.localDescription.sdp, content_type="application/sdp", status=201)

app.add_routes(routes)

if __name__ == "__main__":
	port = 8080

	with cloudflared(port=port) as cloudflared_address:
		print(f"Click on this to access your desktop: {cloudflared_address}")
		web.run_app(app, port=port)

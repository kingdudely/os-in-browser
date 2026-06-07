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

	pointermove = peer.createDataChannel("pointermove", ordered=False, maxRetransmits=0, negotiated=True, id=0)
	@pointermove.on("message")
	def on_pointermove(data):
		movementX, movementY = unpack("<hh", data)
		mouse.move(movementX, movementY)

	pointerdown = peer.createDataChannel("pointerdown", ordered=True, negotiated=True, id=1)
	@pointerdown.on("message")
	def on_pointerdown(data):
		button_code = data[0]
		button = BUTTON_MAP.get(button_code)
		
		if button:
			mouse.press(button)

	pointerup = peer.createDataChannel("pointerup", ordered=True, negotiated=True, id=2)
	@pointerup.on("message")
	def on_pointerup(data):
		button_code = data[0]
		button = BUTTON_MAP.get(button_code)

		if button:
			mouse.release(button)

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

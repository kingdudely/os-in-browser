from sys import platform
from aiortc.contrib.media import MediaPlayer
from os import getenv
from pynput.mouse import Button, Controller as MouseController
from pynput.keyboard import Key, Controller as KeyboardController
from aiohttp import web
from aiortc import RTCPeerConnection, RTCSessionDescription
from with_cloudflared import cloudflared
from construct import Struct, ZigZag

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

Vector2 = Struct(
	"x" / ZigZag,
	"y" / ZigZag,
)

mouse = MouseController()
keyboard = KeyboardController()
app = web.Application()
routes = web.RouteTableDef()

routes.static('/', './public', show_index=True)

@routes.post("/whip")
async def whip(request):
	screenshare = get_screenshare(framerate="30")
	sdp = await request.text()
	peer = RTCPeerConnection()
	peer.addTrack(screenshare.video)

	pointermove = peer.createDataChannel("pointermove", ordered=False, maxRetransmits=0, negotiated=True, id=0)
	@pointermove.on("message")
	def on_pointermove(data):
		mouseMovement = Vector2.parse(data)
		mouse.move(mouseMovement.x, mouseMovement.y)

	await peer.setRemoteDescription(RTCSessionDescription(sdp=sdp, type="offer"))
	answer = await peer.createAnswer()
	await peer.setLocalDescription(answer)
	return web.Response(text=peer.localDescription.sdp, content_type="application/sdp", status=201)

app.add_routes(routes)

if __name__ == "__main__":
	port = 8080
	with cloudflared(port=port) as cloudflared_address:
		print(cloudflared_address)
		web.run_app(app, port=port)

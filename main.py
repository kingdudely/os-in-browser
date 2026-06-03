from sys import platform
from aiortc.contrib.media import MediaPlayer
from os import getenv
from pynput.mouse import Button, Controller as MouseController
from pynput.keyboard import Key, Controller as KeyboardController
from aiohttp import web
from pyee import EventEmitter
from aiortc import RTCPeerConnection, RTCSessionDescription
from with_cloudflared import cloudflared
from construct import Struct, VarInt, Check

match platform:
	case "linux":
		def get_screenshare(**options):
			return MediaPlayer(getenv("DISPLAY", ":0"), format="x11grab", options=options) # :0.0
	case "darwin":
		def get_screenshare(**options):
			return MediaPlayer("Capture screen 0", format="avfoundation", options=options)
	case "win32":
		def get_screenshare(**options):
			return MediaPlayer("desktop", format="gdigrab", options=options)
	case _:
		raise RuntimeError(f"Unsupported platform: {platform}")

Point = Struct(
    "x" / VarInt,
    "y" / VarInt,

    Check(lambda ctx: ctx.x >= 0 and ctx.y >= 0)
)

screenshare = get_screenshare(framerate="30")
mouse = MouseController()
keyboard = KeyboardController()
app = web.Application()
routes = web.RouteTableDef()
datachannels = EventEmitter()

@datachannels.on("mousemove")
def on_mousemove(data):
    point = Point.parse(data)
    mouse.position = (point.x, point.y)

routes.static('/', './public', show_index=True)

@routes.post("/whip")
async def whip(request):
	sdp = await request.text()
	peer = RTCPeerConnection()
	peer.addTrack(screenshare.video)

	@peer.on("datachannel")
	def on_datachannel(channel):
	    @channel.on("message")
	    def on_message(data):
	        datachannels.emit(channel.label, data)

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

from os import getenv
from sys import platform
from aiohttp import web
from aiortc.contrib.media import MediaPlayer

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

screenshare = get_screenshare(framerate="30")
app = web.Application()
routes = web.RouteTableDef()

routes.static('/', './public', show_index=True)

@routes.post("/whip")
async def whip(request):
	from aiortc import RTCPeerConnection, RTCSessionDescription
	sdp = await request.text()
	peer = RTCPeerConnection()
	peer.addTrack(screenshare.video)
	await peer.setRemoteDescription(RTCSessionDescription(sdp=sdp, type="offer"))
	answer = await peer.createAnswer()
	await peer.setLocalDescription(answer)
	return web.Response(text=peer.localDescription.sdp, content_type="application/sdp", status=201)

app.add_routes(routes)

if __name__ == "__main__":
	from with_cloudflared import cloudflared
	port = 8080

	with cloudflared(port=port) as cloudflared_address:
		print(cloudflared_address)
		web.run_app(app, port=port)

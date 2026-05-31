from sys import platform
from os import environ
from aiohttp import web
from aiortc.contrib.media import MediaPlayer

port = environ["PORT"]
screenshare_options = {"framerate": "30"}

match platform:
	case "linux":
		screenshare = MediaPlayer(environ["DISPLAY"], format="x11grab", options=screenshare_options) # ":0.0"
	case "darwin":
		screenshare = MediaPlayer("Capture screen 0", format="avfoundation", options=screenshare_options)
	case "win32":
		screenshare = MediaPlayer("desktop", format="gdigrab", options=screenshare_options)
	case _:
		raise RuntimeError(f"Unsupported platform: {platform}")

app = web.Application()
routes = web.RouteTableDef()

@routes.get("/")
async def index(request):
	return web.FileResponse("index.html")

@routes.post("/whip")
async def whip(request):
	from aiortc import RTCPeerConnection, RTCSessionDescription
	sdp = await request.text()
	peer = RTCPeerConnection()
	peer.addTrack(screenshare.video)
	await peer.setRemoteDescription(RTCSessionDescription(sdp=sdp, type="offer"))
	answer = await peer.createAnswer()
	await peer.setLocalDescription(answer)
	return web.Response(text=pc.localDescription.sdp, content_type="application/sdp", status=201)

app.add_routes(routes)

if __name__ == "__main__":
	web.run_app(app, port=port)

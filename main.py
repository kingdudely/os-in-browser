import sys
import os
from aiohttp import web
from aiortc import RTCPeerConnection, RTCSessionDescription
from aiortc.contrib.media import MediaPlayer

screenshare_options = {
	"framerate": "30"
}

match sys.platform:
	case "linux":
		def get_screen_player():
	        display = os.environ.get("DISPLAY", ":0.0")
	        return MediaPlayer(display, format="x11grab", options=screenshare_options)

	case "darwin":
		def get_screen_player():
	        return MediaPlayer("Capture screen 0", format="avfoundation", options=screenshare_options)

	case "win32":
		def get_screen_player():
	        return MediaPlayer("desktop", format="gdigrab", options=screenshare_options)

	case _:
	    raise RuntimeError(f"Unsupported platform: {sys.platform}")
 
 
async def index(request):
    return web.FileResponse("index.html")
 
 
async def whip(request):
    sdp = await request.text()
    pc = RTCPeerConnection()
    player = get_screen_player()
    pc.addTrack(player.video)
    await pc.setRemoteDescription(RTCSessionDescription(sdp=sdp, type="offer"))
    answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    return web.Response(text=pc.localDescription.sdp, content_type="application/sdp", status=201)
 
 
app = web.Application()
app.router.add_get("/", index)
app.router.add_post("/whip", whip)
 
if __name__ == "__main__":
    print("Serving at http://localhost:8080")
    web.run_app(app, port=8080)

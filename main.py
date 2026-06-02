from sys import platform
from aiortc.contrib.media import MediaPlayer
from os import getenv
from pynput.mouse import Button, Controller as MouseController
from pynput.keyboard import Key, Controller as KeyboardController
from aiohttp import web
from pyee import EventEmitter
from struct import unpack
from aiortc import RTCPeerConnection, RTCSessionDescription
from with_cloudflared import cloudflared

def read_unsigned_var_int(buffer, offset):
    value = 0
    shift = 0
    
    while True:
        if offset >= len(buffer):
            raise ValueError("Buffer underflow while decoding VarInt")
            
        byte = buffer[offset]
        offset += 1

        value |= (byte & 0x7F) << shift

        if (byte & 0x80) == 0:
            break
            
        shift += 7
        
    return value, offset

def bytes_to_point(buffer):
    x, y_offset = read_unsigned_var_int(buffer, 0)
    y, final_offset = read_unsigned_var_int(buffer, y_offset)
	if x < 0 or y < 0:
		raise Exception("Invalid point coordinates")
    
    return x, y

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
mouse = MouseController()
keyboard = KeyboardController()
app = web.Application()
routes = web.RouteTableDef()
datachannels = EventEmitter()

@datachannels.on("mousemove")
def mousemove(data):
    x, y = unpack(">HH", data)
    mouse.position = (x, y)

@datachannels.on("click")
def click(data):
    mouse.click(Button.left)

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

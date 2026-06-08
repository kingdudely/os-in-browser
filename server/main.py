from os import getenv
from aiohttp import web
from aiohttp_index import IndexMiddleware
from aiohttp_basicauth import BasicAuthMiddleware
from with_cloudflared import cloudflared
from peer import create_peer

username = getenv("USERNAME", "")
password = getenv("PASSWORD", "")

app = web.Application(middlewares=[IndexMiddleware(), BasicAuthMiddleware(username=username, password=password)])
routes = web.RouteTableDef()

routes.static('/', './client')

@routes.post("/whip")
async def whip(request):
	offer = await request.text()
	peer = await create_peer(offer)
	return web.Response(text=peer.localDescription.sdp, content_type="application/sdp", status=201)

app.add_routes(routes)

if __name__ == "__main__":
	port = 8080

	with cloudflared(port=port) as cloudflared_address:
		print(f"Click on this to access your desktop: {cloudflared_address}")
		web.run_app(app, port=port)

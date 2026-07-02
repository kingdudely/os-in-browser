from os import getenv
from aiohttp import web
from aiohttp_index import IndexMiddleware
from aiohttp_basicauth import BasicAuthMiddleware
from with_cloudflared import cloudflared
from peer import create_answer
from argparse import ArgumentParser

def main():
	argument_parser = ArgumentParser(description="Remote desktop session")
	argument_parser.add_argument('--username', type=str, required=True, help='Session username')
	argument_parser.add_argument('--password', type=str, required=True, help='Session password')
	arguments = argument_parser.parse_args()

	app = web.Application(middlewares=[IndexMiddleware(), BasicAuthMiddleware(username=arguments.username, password=arguments.password)])
	routes = web.RouteTableDef()

	routes.static('/', './public')

	@routes.post("/whip")
	async def whip(request):
		offer = await request.text()
		answer = await create_answer(offer)
		return web.Response(text=answer, content_type="application/sdp", status=201)

	app.add_routes(routes)

	port = 8080
	with cloudflared(port=port) as cloudflared_address:
		print(f"Click on this to access your desktop: {cloudflared_address}")
		web.run_app(app, port=port)

if __name__ == "__main__":
	main()
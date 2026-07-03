# Add audio support. . ... .. . . . one day.
import asyncio
from tempfile import mkdtemp
from argparse import ArgumentParser

from aiohttp import web
from aiohttp_index import IndexMiddleware
from aiohttp_basicauth import BasicAuthMiddleware
from with_cloudflared import cloudflared
from playwright.async_api import async_playwright

from pynput.keyboard import Key, KeyCode, Controller as KeyboardController
from pynput.mouse import Button, Controller as MouseController

keyboard = KeyboardController()
mouse = MouseController()

BUTTON_MAP = {
    0: Button.left,
    1: Button.middle,
    2: Button.right
}

CODE_MAP = {
    "AltLeft": Key.alt_l, "AltRight": Key.alt_r,
    "ControlLeft": Key.ctrl_l, "ControlRight": Key.ctrl_r,
    "ShiftLeft": Key.shift_l, "ShiftRight": Key.shift_r,
    "MetaLeft": Key.cmd_l, "MetaRight": Key.cmd_r,
    "Backspace": Key.backspace, "Tab": Key.tab, "Enter": Key.enter,
    "NumpadEnter": Key.enter, "Escape": Key.esc, "Space": Key.space,
    "Delete": Key.delete, "Home": Key.home,
    "End": Key.end, "PageUp": Key.page_up, "PageDown": Key.page_down,
    "ArrowUp": Key.up, "ArrowDown": Key.down, "ArrowLeft": Key.left, "ArrowRight": Key.right,
    "CapsLock": Key.caps_lock,
    "MediaTrackNext": Key.media_next, "MediaTrackPrevious": Key.media_previous,
    "MediaPlayPause": Key.media_play_pause, "VolumeMute": Key.media_volume_mute,
    "VolumeDown": Key.media_volume_down, "VolumeUp": Key.media_volume_up,
    "F1": Key.f1, "F2": Key.f2, "F3": Key.f3, "F4": Key.f4, "F5": Key.f5,
    "F6": Key.f6, "F7": Key.f7, "F8": Key.f8, "F9": Key.f9, "F10": Key.f10,
    "F11": Key.f11, "F12": Key.f12, "F13": Key.f13, "F14": Key.f14, "F15": Key.f15,
    "F16": Key.f16, "F17": Key.f17, "F18": Key.f18, "F19": Key.f19, "F20": Key.f20,
}

def fire_keyboard_key_or_code(key_or_code: str, is_down: bool):
    key = CODE_MAP.get(key_or_code) or KeyCode.from_char(key_or_code)
    keyboard.press(key) if is_down else keyboard.release(key)

def fire_mouse_button(button: int, is_down: bool):
    btn = BUTTON_MAP[button]
    mouse.press(btn) if is_down else mouse.release(btn)

def set_mouse_position(x: int, y: int):
    mouse.position = (x, y)

async def start_browser(app):
    peer_url = f"http://localhost:{app['port']}/peer.html"
    user_data_dir = mkdtemp()

    playwright = await async_playwright().start()
    context = await playwright.chromium.launch_persistent_context(
        user_data_dir,
        channel="chrome",
        headless=True, # shell
        args=[
            "--no-sandbox",
            "--disable-gpu",
            "--allow-http-screen-capture",
            "--use-fake-ui-for-media-stream",
            "--auto-select-desktop-capture-source=Entire screen",
            "--start-maximized",
            f"--unsafely-treat-insecure-origin-as-secure={peer_url}",
            "--enable-usermedia-screen-capturing",
            "--allow-running-insecure-content",
        ],
    )

    page = await context.new_page()

    page.on("console", lambda msg: print(f"[console:{msg.type}] {msg.text}"))
    page.on("pageerror", lambda exc: print(f"[pageerror] {exc}"))
    page.on("requestfailed", lambda req: print(f"[requestfailed] {req.url} - {req.failure}"))
    page.on("response", lambda res: print(f"[response] {res.status} {res.url}") if res.status >= 400 else None)

    await page.expose_function("pressKeyboardKeyOrCode", lambda key_or_code: fire_keyboard_key_or_code(key_or_code, True))
    await page.expose_function("releaseKeyboardKeyOrCode", lambda key_or_code: fire_keyboard_key_or_code(key_or_code, False))
    await page.expose_function("pressMouseButton", lambda button: fire_mouse_button(button, True))
    await page.expose_function("releaseMouseButton", lambda button: fire_mouse_button(button, False))
    await page.expose_function("setMousePosition", set_mouse_position)
    await page.expose_function("moveMouse", mouse.move)
    await page.expose_function("scrollMouse", mouse.scroll)

    await page.goto(peer_url)
    await page.wait_for_function("() => typeof(window.createAnswer) === 'function'")

    app["playwright"] = playwright
    app["browser_context"] = context
    app["peer_page"] = page

async def stop_browser(app):
    await app["browser_context"].close()
    await app["playwright"].stop()

def main():
    argument_parser = ArgumentParser(description="Remote desktop session")
    argument_parser.add_argument('--username', type=str, default="", required=False, help='Session username')
    argument_parser.add_argument('--password', type=str, default="", required=False, help='Session password')
    arguments = argument_parser.parse_args()

    username = arguments.username
    password = arguments.password

    middlewares = [IndexMiddleware()]

    if username and password:
        basic_auth_middleware = BasicAuthMiddleware(username=username, password=password)
        middlewares.append(basic_auth_middleware)
    else:
        print("Credentials were not provided. This is insecure, please consider adding some next time.")

    app = web.Application(middlewares=middlewares)
    routes = web.RouteTableDef()

    routes.static('/', '.')

    @routes.post("/whip")
    async def whip(request):
        offer = await request.text()
        answer = await app["peer_page"].evaluate("(offer) => window.createAnswer(offer)", offer)
        return web.Response(text=answer, content_type="application/sdp", status=201)

    app.add_routes(routes)

    port = 8080
    app["port"] = port

    app.on_cleanup.append(stop_browser)

    async def run():
        runner = web.AppRunner(app)
        await runner.setup()
        site = web.TCPSite(runner, port=port)
        await site.start()  # server is now actually listening

        await start_browser(app)  # safe to page.goto now

        with cloudflared(port=port) as cloudflared_address:
            print(f"Click on this to access your desktop: {cloudflared_address}")
            await asyncio.Event().wait()

    asyncio.run(run())

if __name__ == "__main__":
    main()
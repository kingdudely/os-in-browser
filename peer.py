# /// script
# requires-python = ">=3.12"
# dependencies = ["aiohttp", "aiohttp-index", "aiohttp-basicauth", "pynput"]
# ///

import asyncio, json, sys, struct
from aiohttp import web
from pynput.keyboard import Key, KeyCode, Controller as KeyboardController
from pynput.mouse import Button, Controller as MouseController

keyboard = KeyboardController()
mouse = MouseController()

BUTTON_MAP = { 0: Button.left, 1: Button.middle, 2: Button.right, 3: Button.x1, 4: Button.x2 }

CODE_MAP = {
    "AltLeft": Key.alt_l, "AltRight": Key.alt_r,
    "ControlLeft": Key.ctrl_l, "ControlRight": Key.ctrl_r,
    "ShiftLeft": Key.shift_l, "ShiftRight": Key.shift_r,
    "MetaLeft": Key.cmd_l, "MetaRight": Key.cmd_r,
    "Backspace": Key.backspace, "Tab": Key.tab, "Enter": Key.enter,
    "NumpadEnter": Key.enter, "Escape": Key.esc, "Space": Key.space,
    "Delete": Key.delete, "Insert": Key.insert, "Home": Key.home,
    "End": Key.end, "PageUp": Key.page_up, "PageDown": Key.page_down,
    "ArrowUp": Key.up, "ArrowDown": Key.down, "ArrowLeft": Key.left, "ArrowRight": Key.right,
    "CapsLock": Key.caps_lock, "ScrollLock": Key.scroll_lock, "NumLock": Key.num_lock,
    "PrintScreen": Key.print_screen, "Pause": Key.pause, "ContextMenu": Key.menu,
    "MediaTrackNext": Key.media_next, "MediaTrackPrevious": Key.media_previous,
    "MediaPlayPause": Key.media_play_pause, "VolumeMute": Key.media_volume_mute,
    "VolumeDown": Key.media_volume_down, "VolumeUp": Key.media_volume_up,
    "F1": Key.f1, "F2": Key.f2, "F3": Key.f3, "F4": Key.f4, "F5": Key.f5,
    "F6": Key.f6, "F7": Key.f7, "F8": Key.f8, "F9": Key.f9, "F10": Key.f10,
    "F11": Key.f11, "F12": Key.f12, "F13": Key.f13, "F14": Key.f14, "F15": Key.f15,
    "F16": Key.f16, "F17": Key.f17, "F18": Key.f18, "F19": Key.f19, "F20": Key.f20,
}

pending: asyncio.Future | None = None

def nm_read():
    length = struct.unpack('<I', sys.stdin.buffer.read(4))[0]
    return json.loads(sys.stdin.buffer.read(length).decode())

def nm_write(msg):
    data = json.dumps(msg).encode()
    sys.stdout.buffer.write(struct.pack('<I', len(data)) + data)
    sys.stdout.buffer.flush()

async def send_offer(sdp: str) -> str:
    global pending
    pending = asyncio.get_event_loop().create_future()
    nm_write({"type": "offer", "sdp": sdp})
    return await asyncio.wait_for(pending, timeout=15)

async def nm_reader():
    loop = asyncio.get_event_loop()
    while True:
        msg = await loop.run_in_executor(None, nm_read)
        match msg["type"]:
            case "answer":
                pending.set_result(msg["sdp"])
            case "type_keyboard_key":
                key = CODE_MAP.get(msg["key_or_code"]) or KeyCode.from_char(msg["key_or_code"])
                if msg["is_down"]:
                    keyboard.press(key)
                else:
                    keyboard.release(key)
            case "click_mouse_button":
                button = BUTTON_MAP[msg["button"]]
                if msg["is_down"]:
                    mouse.press(button)
                else:
                    mouse.release(button)
            case "set_mouse_position":
                mouse.position = (msg["x"], msg["y"])
            case "move_mouse":
                mouse.move(msg["dx"], msg["dy"])
            case "scroll_mouse":
                mouse.scroll(msg.get("dx", 0), msg.get("dy", 0))

async def whip(request):
    sdp = await send_offer(await request.text())
    return web.Response(text=sdp, content_type="application/sdp", status=201)

async def main():
    asyncio.create_task(nm_reader())
    app = web.Application()
    app.router.add_post("/whip", whip)
    app.router.add_static("/", "./public")
    runner = web.AppRunner(app)
    await runner.setup()
    await web.TCPSite(runner, port=8080).start()
    await asyncio.Event().wait()

asyncio.run(main())
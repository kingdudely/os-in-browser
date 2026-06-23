from os import environ
from json import load
from pynput.mouse import Button, Controller as MouseController
from pynput.keyboard import KeyCode, Controller as KeyboardController
from aiortc import RTCPeerConnection, RTCSessionDescription
from aiortc.contrib.media import MediaPlayer
from struct import unpack
from sys import platform
from screeninfo import get_monitors

match platform:
	case "linux":
		media_format = "x11grab"
		DISPLAY = environ["DISPLAY"]

	case "darwin":
		media_format = "avfoundation"
		DISPLAY = "Capture screen 0"

	case "win32":
		media_format = "gdigrab" # ddagrab
		DISPLAY = "desktop"

	case _:
		raise RuntimeError(f"Unsupported platform: {platform}")

def get_screenshare(**options):
	return MediaPlayer(DISPLAY, format=media_format, options=options)

def get_screen_size():
	monitor = get_monitors()[0]
	return monitor.width, monitor.height

def import_json(path):
	with open(path, "r", encoding="utf-8") as f:
		return load(f)

VK_VALUES = import_json(f"./vk_values/{platform}.json")
BUTTON_MAP = {
	0: Button.left,
	1: Button.middle,
	2: Button.right,
}
mouse = MouseController()
keyboard = KeyboardController()

async def get_answer(offer):
	screenshare = get_screenshare(framerate="30")
	print("MediaPlayer created:", screenshare)
	print("Video track:", screenshare.video)

	peer = RTCPeerConnection()
	peer.addTrack(screenshare.video)

	screen_w, screen_h = get_screen_size()
	stream_w, stream_h = screen_w, screen_h

	# id=0 — pointer movement (relative or absolute)
	pointer_movement_channel = peer.createDataChannel("pointer-movement", ordered=False, maxRetransmits=0, negotiated=True, id=0)
	@pointer_movement_channel.on("message")
	def on_pointer_movement(data):
		if len(data) == 4:  # relative: int16 x2
			dx, dy = unpack("<hh", data)
			mouse.move(dx, dy)
		else:  # absolute: uint32 x2
			cx, cy = unpack("<II", data)
			x = cx * (screen_w / stream_w)
			y = cy * (screen_h / stream_h)
			mouse.position = (x, y)

	# id=1 — pointer click
	pointer_click_channel = peer.createDataChannel("pointer-click", ordered=True, negotiated=True, id=1)
	@pointer_click_channel.on("message")
	def on_pointer_click(data):
		is_down = data[0] == 1
		button = BUTTON_MAP.get(data[1])
		if button is None:
			print(f"Button {data[1]} is not implemented")
			return
		if is_down:
			mouse.press(button)
		else:
			mouse.release(button)

	# id=2 — keyboard
	keyboard_channel = peer.createDataChannel("keyboard-type", ordered=True, negotiated=True, id=2)
	@keyboard_channel.on("message")
	def on_keyboard(data):
		is_down = data[0] == 1
		vk_value = VK_VALUES.get(str(data[1]))
		if vk_value is None:
			print(f"Virtual key index {data[1]} is not implemented")
			return
		key = KeyCode.from_vk(vk_value)
		if is_down:
			keyboard.press(key)
		else:
			keyboard.release(key)

	# id=3 — screen resize
	screen_resize_channel = peer.createDataChannel("screen-resize", ordered=False, negotiated=True, id=3)
	@screen_resize_channel.on("message")
	def on_screen_resize(data):
		nonlocal screenshare, stream_w, stream_h
		stream_w, stream_h = unpack("<II", data)
		new_screenshare = get_screenshare(framerate="30", video_size=f"{stream_w}x{stream_h}")
		senders = peer.getSenders()
		if senders:
			senders[0].replaceTrack(new_screenshare.video)
		screenshare = new_screenshare

	# id=4 — scroll (pixel deltas, already normalized client-side)
	pointer_scroll_channel = peer.createDataChannel("pointer-scroll", ordered=False, maxRetransmits=0, negotiated=True, id=4)
	@pointer_scroll_channel.on("message")
	def on_scroll(data):
		dx, dy = unpack("<ff", data)
		mouse.scroll(dx, dy)

	await peer.setRemoteDescription(RTCSessionDescription(sdp=offer, type="offer"))
	answer = await peer.createAnswer()
	await peer.setLocalDescription(answer)
	return peer.localDescription.sdp
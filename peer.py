from os import environ
from json import load
from pynput.mouse import Button, Controller as MouseController
from pynput.keyboard import KeyCode, Controller as KeyboardController
from aiortc import RTCPeerConnection, RTCSessionDescription
from aiortc.contrib.media import MediaPlayer
from struct import unpack
from sys import platform

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

async def create_answer(offer):
	screenshare = get_screenshare(framerate="30")

	peer = RTCPeerConnection()
	peer.addTrack(screenshare.video)

	pointer_movement_channel = peer.createDataChannel("pointer-movement", ordered=False, maxRetransmits=0, negotiated=True, id=0)
	@pointer_movement_channel.on("message")
	def on_pointer_movement(data):
		is_relative = len(data) == 4

		if is_relative:
			movement_x, movement_y = unpack("<hh", data)
			mouse.move(movement_x, movement_y)
		else:
			client_x, client_y = unpack("<II", data)
			mouse.position = (client_x, client_y)

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

	keyboard_channel = peer.createDataChannel("keyboard-type", ordered=True, negotiated=True, id=2)
	@keyboard_channel.on("message")
	def on_keyboard(data):
		is_down = data[0] == 1
		vk_index = data[1]
		vk_value = VK_VALUES[vk_index] if 0 <= vk_index < len(VK_VALUES) else None

		if vk_value is None:
			print(f"Virtual key index {vk_index} is not implemented")
			return

		key = KeyCode.from_vk(vk_value)

		if is_down:
			keyboard.press(key)
		else:
			keyboard.release(key)


	screen_resize_channel = peer.createDataChannel("screen-resize", ordered=False, negotiated=True, id=3)

	pointer_scroll_channel = peer.createDataChannel("pointer-scroll", ordered=False, maxRetransmits=0, negotiated=True, id=4)
	@pointer_scroll_channel.on("message")
	def on_scroll(data):
		delta_x, delta_y = unpack("<ff", data)
		mouse.scroll(delta_x, delta_y)

	await peer.setRemoteDescription(RTCSessionDescription(sdp=offer, type="offer"))
	await peer.setLocalDescription()
	return peer.localDescription.sdp
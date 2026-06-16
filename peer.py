from os import environ
from json import load
from pynput.mouse import Button, Controller as MouseController
from pynput.keyboard import KeyCode, Controller as KeyboardController
from aiortc import RTCPeerConnection, RTCSessionDescription
from aiortc.contrib.media import MediaPlayer
from struct import unpack
from pyee import EventEmitter
from sys import platform

match platform:
	case "linux":
		def get_screenshare(**options):
			options.setdefault("draw_mouse", "1")
			return MediaPlayer(environ["DISPLAY"], format="x11grab", options=options) # :0.0
	case "darwin":
		def get_screenshare(**options):
			options.setdefault("capture_mouse", "1")
			return MediaPlayer("Capture screen 0", format="avfoundation", options=options)
	case "win32":
		def get_screenshare(**options):
			options.setdefault("draw_mouse", "1")
			return MediaPlayer("desktop", format="gdigrab", options=options)
	case _:
		raise RuntimeError(f"Unsupported platform: {platform}")

def importJson(path):
	with open(path, "r", encoding="utf-8") as json_file:
		return load(json_file)

VK_VALUES = importJson(f"./vk_values/{platform}.json")
CODE_KEYS = importJson(f"./public/code_keys.json")
BUTTON_MAP = {
	0: Button.left,
	1: Button.middle,
	2: Button.right
}
mouse = MouseController()
keyboard = KeyboardController()

# mouse.position = (0, 0)

async def get_answer(offer):
	screenshare = get_screenshare(framerate="30")
	peer = RTCPeerConnection()
	peer.addTrack(screenshare.video)

	pointer_movement_channel = peer.createDataChannel("pointer-movement", ordered=False, maxRetransmits=0, negotiated=True, id=0)
	@pointer_movement_channel.on("message")
	def on_pointer_movement(data):
		movementX, movementY = unpack("<hh", data)
		mouse.move(movementX, movementY)

	pointer_click_channel = peer.createDataChannel("pointer-click", ordered=True, negotiated=True, id=1)
	@pointer_click_channel.on("message")
	def on_pointer_click(data):
		is_down = data[0] == 1
		button_code = data[1]
		button = BUTTON_MAP.get(button_code)
		
		if button is None:
			print(f"Button {button} is not implemented")
			return

		if is_down:
			mouse.press(button)
		else:
			mouse.release(button)

	keyboard_channel = peer.createDataChannel("keyboard", ordered=True, negotiated=True, id=2)
	@keyboard_channel.on("message")
	def on_keyboard(data):
		is_down = data[0] == 1
		vk_index = data[1]
		vk_value = VK_VALUES.get(vk_index)

		if vk_value is None:
			print("Virtual key index {vk_index} is not implemented")
			return

		key = KeyCode.from_vk(vk_value)

		if is_down:
			keyboard.press(key)
		else:
			keyboard.release(key)

	await peer.setRemoteDescription(RTCSessionDescription(sdp=offer, type="offer"))
	answer = await peer.createAnswer()
	await peer.setLocalDescription(answer)
	return peer.localDescription.sdp # answer.sdp
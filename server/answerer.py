from os import environ
from json import load
from pynput.mouse import Button, Controller as MouseController
from pynput.keyboard import KeyCode, Controller as KeyboardController
from aiortc import RTCPeerConnection, RTCSessionDescription
from aiortc.contrib.media import MediaPlayer
from struct import unpack
from pyee import EventEmitter
from sys import platform

with open(f"./code_maps/{platform}.json", "r", encoding="utf-8") as code_map_file:
	CODE_MAP = load(code_map_file)

match platform:
	case "linux":
		def get_screenshare(**options):
			# options.setdefault("draw_mouse", "1")
			return MediaPlayer(environ["DISPLAY"], format="x11grab", options=options) # :0.0
	case "darwin":
		def get_screenshare(**options):
			# options.setdefault("capture_mouse", "1")
			return MediaPlayer("Capture screen 0", format="avfoundation", options=options)
	case "win32":
		def get_screenshare(**options):
			# options.setdefault("draw_mouse", "1")
			return MediaPlayer("desktop", format="gdigrab", options=options)
	case _:
		raise RuntimeError(f"Unsupported platform: {platform}")

mouse = MouseController()
keyboard = KeyboardController()

BUTTON_MAP = {
	0: Button.left,
	1: Button.middle,
	2: Button.right
}

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
		
		if button:
			if is_down:
				mouse.press(button)
			else:
				mouse.release(button)

	keyboard_channel = peer.createDataChannel("keyboard", ordered=True, negotiated=True, id=2)
	@keyboard_channel.on("message")
	def on_keyboard(data):
		is_down = data[0] == "\x01"
		code = data[1:]

		target_vk = CODE_MAP.get(code)

		if target_vk is None:
			print("Code is not implemented")
			return

		target_key = KeyCode.from_vk(target_vk)
		
		if is_down:
			keyboard.press(target_key)
		else:
			keyboard.release(target_key)
			
	await peer.setRemoteDescription(RTCSessionDescription(sdp=offer, type="offer"))
	answer = await peer.createAnswer()
	await peer.setLocalDescription(answer)
	return peer.localDescription.sdp # answer.sdp
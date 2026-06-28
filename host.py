# /// script
# requires-python = ">=3.12"
# dependencies = [
#     "pynput>=1.8.2",
# ]
# ///
from os import environ
import json, sys, struct, subprocess
from pynput.keyboard import Key, KeyCode, Controller as KeyboardController
from pynput.mouse import Button, Controller as MouseController

keyboard = KeyboardController()
mouse = MouseController()

BUTTON_MAP = {
	0: Button.left,
	1: Button.middle,
	2: Button.right,
	3: Button.x1,
	4: Button.x2,
}

CODE_MAP = {
	"AltLeft": Key.alt_l,
	"AltRight": Key.alt_r,
	"ControlLeft": Key.ctrl_l,
	"ControlRight": Key.ctrl_r,
	"ShiftLeft": Key.shift_l,
	"ShiftRight": Key.shift_r,
	"MetaLeft": Key.cmd_l,     # Windows / Command key (Left)
	"MetaRight": Key.cmd_r,    # Windows / Command key (Right)
	
	# Navigation & Editing
	"Backspace": Key.backspace,
	"Tab": Key.tab,
	"Enter": Key.enter,
	"NumpadEnter": Key.enter,   # Standardizes numpad enter to Key.enter
	"Escape": Key.esc,
	"Space": Key.space,
	"Delete": Key.delete,
	"Insert": Key.insert,
	"Home": Key.home,
	"End": Key.end,
	"PageUp": Key.page_up,
	"PageDown": Key.page_down,
	
	# Navigation Arrows
	"ArrowUp": Key.up,
	"ArrowDown": Key.down,
	"ArrowLeft": Key.left,
	"ArrowRight": Key.right,
	
	# Locks & System
	"CapsLock": Key.caps_lock,
	"ScrollLock": Key.scroll_lock,
	"NumLock": Key.num_lock,
	"PrintScreen": Key.print_screen,
	"Pause": Key.pause,
	"ContextMenu": Key.menu,
	
	# Media Keys
	"MediaTrackNext": Key.media_next,
	"MediaTrackPrevious": Key.media_previous,
	"MediaPlayPause": Key.media_play_pause,
	"VolumeMute": Key.media_volume_mute,
	"VolumeDown": Key.media_volume_down,
	"VolumeUp": Key.media_volume_up,
	
	# Function Keys
	"F1": Key.f1,
	"F2": Key.f2,
	"F3": Key.f3,
	"F4": Key.f4,
	"F5": Key.f5,
	"F6": Key.f6,
	"F7": Key.f7,
	"F8": Key.f8,
	"F9": Key.f9,
	"F10": Key.f10,
	"F11": Key.f11,
	"F12": Key.f12,
	"F13": Key.f13,
	"F14": Key.f14,
	"F15": Key.f15,
	"F16": Key.f16,
	"F17": Key.f17,
	"F18": Key.f18,
	"F19": Key.f19,
	"F20": Key.f20,
}

def read_message():
	length = struct.unpack('<I', sys.stdin.buffer.read(4))[0]
	return json.loads(sys.stdin.buffer.read(length))

def send_message(msg):
	data = json.dumps(msg).encode()
	sys.stdout.buffer.write(struct.pack('<I', len(data)))
	sys.stdout.buffer.write(data)
	sys.stdout.buffer.flush()

while True:
	msg = read_message()

	match msg["type"]:
		case "get_viewer_share_id":
			send_message(environ["VIEWER_SHARE_ID"])

		case "type_keyboard_key":
			is_down = msg["is_down"]
			key_or_code = msg["key_or_code"]
			key = CODE_MAP.get(key_or_code) or KeyCode.from_char(key_or_code)

			if is_down:
				keyboard.press(key)
			else:
				keyboard.release(key)

		case "click_mouse_button":
			is_down = msg["is_down"]
			button = msg["button"]
			key = BUTTON_MAP[button]

			if is_down:
				mouse.press(button)
			else:
				mouse.release(button)

		case "set_mouse_position":
			mouse.position = (msg["x"], msg["y"])
		case "move_mouse":
			mouse.move(msg["dx"], msg["dy"])
		case "scroll_mouse":
			mouse.scroll(msg.get("dx", 0), msg.get("dy", 0))
		# resize_screen

		case _:
			print("Invalid type")
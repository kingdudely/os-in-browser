import Carbon

let codeToVK_macOS: [Int: UInt32] = [
    0: 0,                           // Hyper -> No direct mapping
    1: 0,                           // Super -> No direct mapping
    2: 0,                           // FnLock -> No direct mapping
    3: 0,                           // Suspend -> No direct mapping
    4: 0,                           // Resume -> No direct mapping
    5: 0,                           // Turbo -> No direct mapping
    6: 0,                           // Sleep -> No direct mapping
    7: 0,                           // WakeUp -> No direct mapping
    8: kVK_Function,                // Fn
    9: 0,                           // DisplayToggleIntExt -> No direct mapping
    10: kVK_ANSI_A,                 // KeyA
    11: kVK_ANSI_B,                 // KeyB
    12: kVK_ANSI_C,                 // KeyC
    13: kVK_ANSI_D,                 // KeyD
    14: kVK_ANSI_E,                 // KeyE
    15: kVK_ANSI_F,                 // KeyF
    16: kVK_ANSI_G,                 // KeyG
    17: kVK_ANSI_H,                 // KeyH
    18: kVK_ANSI_I,                 // KeyI
    19: kVK_ANSI_J,                 // KeyJ
    20: kVK_ANSI_K,                 // KeyK
    21: kVK_ANSI_L,                 // KeyL
    22: kVK_ANSI_M,                 // KeyM
    23: kVK_ANSI_N,                 // KeyN
    24: kVK_ANSI_O,                 // KeyO
    25: kVK_ANSI_P,                 // KeyP
    26: kVK_ANSI_Q,                 // KeyQ
    27: kVK_ANSI_R,                 // KeyR
    28: kVK_ANSI_S,                 // KeyS
    29: kVK_ANSI_T,                 // KeyT
    30: kVK_ANSI_U,                 // KeyU
    31: kVK_ANSI_V,                 // KeyV
    32: kVK_ANSI_W,                 // KeyW
    33: kVK_ANSI_X,                 // KeyX
    34: kVK_ANSI_Y,                 // KeyY
    35: kVK_ANSI_Z,                 // KeyZ
    36: kVK_ANSI_1,                 // Digit1
    37: kVK_ANSI_2,                 // Digit2
    38: kVK_ANSI_3,                 // Digit3
    39: kVK_ANSI_4,                 // Digit4
    40: kVK_ANSI_5,                 // Digit5
    41: kVK_ANSI_6,                 // Digit6
    42: kVK_ANSI_7,                 // Digit7
    43: kVK_ANSI_8,                 // Digit8
    44: kVK_ANSI_9,                 // Digit9
    45: kVK_ANSI_0,                 // Digit0
    46: kVK_Return,                 // Enter
    47: kVK_Escape,                 // Escape
    48: kVK_Delete,                 // Backspace
    49: kVK_Tab,                    // Tab
    50: kVK_Space,                  // Space
    51: kVK_ANSI_Minus,             // Minus
    52: kVK_ANSI_Equal,             // Equal
    53: kVK_ANSI_LeftBracket,       // BracketLeft
    54: kVK_ANSI_RightBracket,      // BracketRight
    55: kVK_ANSI_Backslash,         // Backslash
    56: kVK_ANSI_Semicolon,         // Semicolon
    57: kVK_ANSI_Quote,             // Quote
    58: kVK_ANSI_Grave,             // Backquote
    59: kVK_ANSI_Comma,             // Comma
    60: kVK_ANSI_Period,            // Period
    61: kVK_ANSI_Slash,             // Slash
    62: kVK_CapsLock,               // CapsLock
    63: kVK_F1,                     // F1
    64: kVK_F2,                     // F2
    65: kVK_F3,                     // F3
    66: kVK_F4,                     // F4
    67: kVK_F5,                     // F5
    68: kVK_F6,                     // F6
    69: kVK_F7,                     // F7
    70: kVK_F8,                     // F8
    71: kVK_F9,                     // F9
    72: kVK_F10,                    // F10
    73: kVK_F11,                    // F11
    74: kVK_F12,                    // F12
    75: 0,                          // PrintScreen -> No direct mapping
    76: 0,                          // ScrollLock -> No direct mapping
    77: kVK_Pause,                  // Pause
    78: kVK_Help,                   // Insert
    79: kVK_Home,                   // Home
    80: kVK_PageUp,                 // PageUp
    81: kVK_ForwardDelete,          // Delete
    82: kVK_End,                    // End
    83: kVK_PageDown,               // PageDown
    84: kVK_RightArrow,             // ArrowRight
    85: kVK_LeftArrow,              // ArrowLeft
    86: kVK_DownArrow,              // ArrowDown
    87: kVK_UpArrow,                // ArrowUp
    88: kVK_ANSI_KeypadClear,       // NumLock
    89: kVK_ANSI_KeypadDivide,      // NumpadDivide
    90: kVK_ANSI_KeypadMultiply,    // NumpadMultiply
    91: kVK_ANSI_KeypadMinus,       // NumpadSubtract
    92: kVK_ANSI_KeypadPlus,        // NumpadAdd
    93: kVK_ANSI_KeypadEnter,       // NumpadEnter
    94: kVK_ANSI_Keypad1,           // Numpad1
    95: kVK_ANSI_Keypad2,           // Numpad2
    96: kVK_ANSI_Keypad3,           // Numpad3
    97: kVK_ANSI_Keypad4,           // Numpad4
    98: kVK_ANSI_Keypad5,           // Numpad5
    99: kVK_ANSI_Keypad6,           // Numpad6
    100: kVK_ANSI_Keypad7,          // Numpad7
    101: kVK_ANSI_Keypad8,          // Numpad8
    102: kVK_ANSI_Keypad9,          // Numpad9
    103: kVK_ANSI_Keypad0,          // Numpad0
    104: kVK_ANSI_KeypadDecimal,    // NumpadDecimal
    105: 0,                         // IntlBackslash -> No direct mapping
    106: kVK_RightCommand,          // ContextMenu
    107: 0,                         // Power -> No direct mapping
    108: kVK_ANSI_KeypadEquals,     // NumpadEqual
    109: 0,                         // F13 -> No direct mapping
    110: 0,                         // F14 -> No direct mapping
    111: 0,                         // F15 -> No direct mapping
    112: 0,                         // F16 -> No direct mapping
    113: 0,                         // F17 -> No direct mapping
    114: 0,                         // F18 -> No direct mapping
    115: 0,                         // F19 -> No direct mapping
    116: 0,                         // F20 -> No direct mapping
    117: 0,                         // F21 -> No direct mapping
    118: 0,                         // F22 -> No direct mapping
    119: 0,                         // F23 -> No direct mapping
    120: 0,                         // F24 -> No direct mapping
    121: 0,                         // Open -> No direct mapping
    122: kVK_Help,                  // Help
    123: 0,                         // Select -> No direct mapping
    124: 0,                         // Again -> No direct mapping
    125: 0,                         // Undo -> No direct mapping
    126: 0,                         // Cut -> No direct mapping
    127: 0,                         // Copy -> No direct mapping
    128: 0,                         // Paste -> No direct mapping
    129: 0,                         // Find -> No direct mapping
    130: 0,                         // AudioVolumeMute -> No direct mapping
    131: 0,                         // AudioVolumeUp -> No direct mapping
    132: 0,                         // AudioVolumeDown -> No direct mapping
    133: 0,                         // NumpadComma -> No direct mapping
    134: 0,                         // IntlRo -> No direct mapping
    135: 0,                         // KanaMode -> No direct mapping
    136: 0,                         // IntlYen -> No direct mapping
    137: 0,                         // Convert -> No direct mapping
    138: 0,                         // NonConvert -> No direct mapping
    139: 0,                         // Lang1 -> No direct mapping
    140: 0,                         // Lang2 -> No direct mapping
    141: 0,                         // Lang3 -> No direct mapping
    142: 0,                         // Lang4 -> No direct mapping
    143: 0,                         // Lang5 -> No direct mapping
    144: 0,                         // Abort -> No direct mapping
    145: 0,                         // Props -> No direct mapping
    146: 0,                         // NumpadParenLeft -> No direct mapping
    147: 0,                         // NumpadParenRight -> No direct mapping
    148: kVK_Control,               // ControlLeft
    149: kVK_Shift,                 // ShiftLeft
    150: kVK_Option,                // AltLeft
    151: kVK_Command,               // MetaLeft
    152: kVK_RightControl,          // ControlRight
    153: kVK_RightShift,            // ShiftRight
    154: kVK_RightOption,           // AltRight
    155: kVK_RightCommand,          // MetaRight
    156: 0,                         // MediaTrackNext -> No direct mapping
    157: 0,                         // MediaTrackPrevious -> No direct mapping
    158: 0,                         // MediaStop -> No direct mapping
    159: 0,                         // MediaPlayPause -> No direct mapping
    160: 0,                         // MediaSelect -> No direct mapping
    161: 0,                         // MediaFastForward -> No direct mapping
    162: 0,                         // MediaRewind -> No direct mapping
    163: 0,                         // BrowserBack -> No direct mapping
    164: 0,                         // BrowserForward -> No direct mapping
    165: 0,                         // BrowserRefresh -> No direct mapping
    166: 0,                         // BrowserStop -> No direct mapping
    167: 0,                         // BrowserSearch -> No direct mapping
    168: 0,                         // BrowserFavorites -> No direct mapping
    169: 0,                         // BrowserHome -> No direct mapping
    170: 0,                         // ZoomToggle -> No direct mapping
    171: 0,                         // Mail -> No direct mapping
    172: 0,                         // LaunchApp2 -> No direct mapping
    173: 0,                         // LaunchApp1 -> No direct mapping
]
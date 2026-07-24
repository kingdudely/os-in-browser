#include <map>
#include <winuser.h>

std::map<int, int> codeToVK_Windows = {
    {0, 0},                 // Hyper -> No direct mapping
    {1, 0},                 // Super -> No direct mapping
    {2, 0},                 // FnLock -> No direct mapping
    {3, VK_PAUSE},          // Suspend
    {4, 0},                 // Resume -> No direct mapping
    {5, 0},                 // Turbo -> No direct mapping
    {6, VK_SLEEP},          // Sleep
    {7, 0},                 // WakeUp -> No direct mapping
    {8, 0},                 // Fn -> No direct mapping
    {9, 0},                 // DisplayToggleIntExt -> No direct mapping
    {10, VK_A},             // KeyA
    {11, VK_B},             // KeyB
    {12, VK_C},             // KeyC
    {13, VK_D},             // KeyD
    {14, VK_E},             // KeyE
    {15, VK_F},             // KeyF
    {16, VK_G},             // KeyG
    {17, VK_H},             // KeyH
    {18, VK_I},             // KeyI
    {19, VK_J},             // KeyJ
    {20, VK_K},             // KeyK
    {21, VK_L},             // KeyL
    {22, VK_M},             // KeyM
    {23, VK_N},             // KeyN
    {24, VK_O},             // KeyO
    {25, VK_P},             // KeyP
    {26, VK_Q},             // KeyQ
    {27, VK_R},             // KeyR
    {28, VK_S},             // KeyS
    {29, VK_T},             // KeyT
    {30, VK_U},             // KeyU
    {31, VK_V},             // KeyV
    {32, VK_W},             // KeyW
    {33, VK_X},             // KeyX
    {34, VK_Y},             // KeyY
    {35, VK_Z},             // KeyZ
    {36, VK_1},             // Digit1
    {37, VK_2},             // Digit2
    {38, VK_3},             // Digit3
    {39, VK_4},             // Digit4
    {40, VK_5},             // Digit5
    {41, VK_6},             // Digit6
    {42, VK_7},             // Digit7
    {43, VK_8},             // Digit8
    {44, VK_9},             // Digit9
    {45, VK_0},             // Digit0
    {46, VK_RETURN},        // Enter
    {47, VK_ESCAPE},        // Escape
    {48, VK_BACK},          // Backspace
    {49, VK_TAB},           // Tab
    {50, VK_SPACE},         // Space
    {51, VK_OEM_MINUS},     // Minus
    {52, VK_OEM_PLUS},      // Equal
    {53, VK_OEM_4},         // BracketLeft
    {54, VK_OEM_6},         // BracketRight
    {55, VK_OEM_5},         // Backslash
    {56, VK_OEM_1},         // Semicolon
    {57, VK_OEM_7},         // Quote
    {58, VK_OEM_3},         // Backquote
    {59, VK_OEM_COMMA},     // Comma
    {60, VK_OEM_PERIOD},    // Period
    {61, VK_OEM_2},         // Slash
    {62, VK_CAPITAL},       // CapsLock
    {63, VK_F1},            // F1
    {64, VK_F2},            // F2
    {65, VK_F3},            // F3
    {66, VK_F4},            // F4
    {67, VK_F5},            // F5
    {68, VK_F6},            // F6
    {69, VK_F7},            // F7
    {70, VK_F8},            // F8
    {71, VK_F9},            // F9
    {72, VK_F10},           // F10
    {73, VK_F11},           // F11
    {74, VK_F12},           // F12
    {75, VK_SNAPSHOT},      // PrintScreen
    {76, VK_SCROLL},        // ScrollLock
    {77, VK_PAUSE},         // Pause
    {78, VK_INSERT},        // Insert
    {79, VK_HOME},          // Home
    {80, VK_PRIOR},         // PageUp
    {81, VK_DELETE},        // Delete
    {82, VK_END},           // End
    {83, VK_NEXT},          // PageDown
    {84, VK_RIGHT},         // ArrowRight
    {85, VK_LEFT},          // ArrowLeft
    {86, VK_DOWN},          // ArrowDown
    {87, VK_UP},            // ArrowUp
    {88, VK_NUMLOCK},       // NumLock
    {89, VK_DIVIDE},        // NumpadDivide
    {90, VK_MULTIPLY},      // NumpadMultiply
    {91, VK_SUBTRACT},      // NumpadSubtract
    {92, VK_ADD},           // NumpadAdd
    {93, VK_RETURN},        // NumpadEnter
    {94, VK_NUMPAD1},       // Numpad1
    {95, VK_NUMPAD2},       // Numpad2
    {96, VK_NUMPAD3},       // Numpad3
    {97, VK_NUMPAD4},       // Numpad4
    {98, VK_NUMPAD5},       // Numpad5
    {99, VK_NUMPAD6},       // Numpad6
    {100, VK_NUMPAD7},      // Numpad7
    {101, VK_NUMPAD8},      // Numpad8
    {102, VK_NUMPAD9},      // Numpad9
    {103, VK_NUMPAD0},      // Numpad0
    {104, VK_DECIMAL},      // NumpadDecimal
    {105, VK_OEM_5},        // IntlBackslash
    {106, VK_APPS},         // ContextMenu
    {107, VK_SLEEP},        // Power
    {108, VK_CLEAR},        // NumpadEqual
    {109, VK_F13},          // F13
    {110, VK_F14},          // F14
    {111, VK_F15},          // F15
    {112, VK_F16},          // F16
    {113, VK_F17},          // F17
    {114, VK_F18},          // F18
    {115, VK_F19},          // F19
    {116, VK_F20},          // F20
    {117, VK_F21},          // F21
    {118, VK_F22},          // F22
    {119, VK_F23},          // F23
    {120, VK_F24},          // F24
    {121, 0},               // Open -> No direct mapping
    {122, VK_HELP},         // Help
    {123, 0},               // Select -> No direct mapping
    {124, 0},               // Again -> No direct mapping
    {125, 0},               // Undo -> No direct mapping
    {126, 0},               // Cut -> No direct mapping
    {127, 0},               // Copy -> No direct mapping
    {128, 0},               // Paste -> No direct mapping
    {129, 0},               // Find -> No direct mapping
    {130, VK_VOLUME_MUTE},  // AudioVolumeMute
    {131, VK_VOLUME_UP},    // AudioVolumeUp
    {132, VK_VOLUME_DOWN},  // AudioVolumeDown
    {133, VK_SEPARATOR},    // NumpadComma
    {134, 0},               // IntlRo -> No direct mapping
    {135, VK_KANA},         // KanaMode
    {136, 0},               // IntlYen -> No direct mapping
    {137, VK_CONVERT},      // Convert
    {138, VK_NONCONVERT},   // NonConvert
    {139, 0},               // Lang1 -> No direct mapping
    {140, 0},               // Lang2 -> No direct mapping
    {141, 0},               // Lang3 -> No direct mapping
    {142, 0},               // Lang4 -> No direct mapping
    {143, 0},               // Lang5 -> No direct mapping
    {144, VK_CANCEL},       // Abort
    {145, 0},               // Props -> No direct mapping
    {146, 0},               // NumpadParenLeft -> No direct mapping
    {147, 0},               // NumpadParenRight -> No direct mapping
    {148, VK_LCONTROL},     // ControlLeft
    {149, VK_LSHIFT},       // ShiftLeft
    {150, VK_LMENU},        // AltLeft
    {151, VK_LWIN},         // MetaLeft
    {152, VK_RCONTROL},     // ControlRight
    {153, VK_RSHIFT},       // ShiftRight
    {154, VK_RMENU},        // AltRight
    {155, VK_RWIN},         // MetaRight
    {156, VK_MEDIA_NEXT_TRACK}, // MediaTrackNext
    {157, VK_MEDIA_PREV_TRACK}, // MediaTrackPrevious
    {158, VK_MEDIA_STOP},   // MediaStop
    {159, VK_MEDIA_PLAY_PAUSE}, // MediaPlayPause
    {160, VK_MEDIA_SELECT}, // MediaSelect
    {161, 0},               // MediaFastForward -> No direct mapping
    {162, 0},               // MediaRewind -> No direct mapping
    {163, VK_BROWSER_BACK},     // BrowserBack
    {164, VK_BROWSER_FORWARD},  // BrowserForward
    {165, VK_BROWSER_REFRESH},  // BrowserRefresh
    {166, VK_BROWSER_STOP},     // BrowserStop
    {167, VK_BROWSER_SEARCH},   // BrowserSearch
    {168, VK_BROWSER_FAVORITES},// BrowserFavorites
    {169, VK_BROWSER_HOME},     // BrowserHome
    {170, 0},               // ZoomToggle -> No direct mapping
    {171, VK_LAUNCH_MAIL},  // Mail
    {172, VK_LAUNCH_APP2},  // LaunchApp2
    {173, VK_LAUNCH_APP1},  // LaunchApp1
};
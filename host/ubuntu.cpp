#include <map>
#include <X11/keysym.h>

std::map<int, int> codeToVK_Linux = {
    {0, XK_Hyper_L},            // Hyper
    {1, XK_Super_L},            // Super
    {2, 0},                     // FnLock -> No direct mapping
    {3, 0},                     // Suspend -> No direct mapping
    {4, 0},                     // Resume -> No direct mapping
    {5, 0},                     // Turbo -> No direct mapping
    {6, XK_Sleep},              // Sleep
    {7, XK_Wake},               // WakeUp
    {8, XK_Alt_L},              // Fn (closest)
    {9, 0},                     // DisplayToggleIntExt -> No direct mapping
    {10, XK_a},                 // KeyA
    {11, XK_b},                 // KeyB
    {12, XK_c},                 // KeyC
    {13, XK_d},                 // KeyD
    {14, XK_e},                 // KeyE
    {15, XK_f},                 // KeyF
    {16, XK_g},                 // KeyG
    {17, XK_h},                 // KeyH
    {18, XK_i},                 // KeyI
    {19, XK_j},                 // KeyJ
    {20, XK_k},                 // KeyK
    {21, XK_l},                 // KeyL
    {22, XK_m},                 // KeyM
    {23, XK_n},                 // KeyN
    {24, XK_o},                 // KeyO
    {25, XK_p},                 // KeyP
    {26, XK_q},                 // KeyQ
    {27, XK_r},                 // KeyR
    {28, XK_s},                 // KeyS
    {29, XK_t},                 // KeyT
    {30, XK_u},                 // KeyU
    {31, XK_v},                 // KeyV
    {32, XK_w},                 // KeyW
    {33, XK_x},                 // KeyX
    {34, XK_y},                 // KeyY
    {35, XK_z},                 // KeyZ
    {36, XK_1},                 // Digit1
    {37, XK_2},                 // Digit2
    {38, XK_3},                 // Digit3
    {39, XK_4},                 // Digit4
    {40, XK_5},                 // Digit5
    {41, XK_6},                 // Digit6
    {42, XK_7},                 // Digit7
    {43, XK_8},                 // Digit8
    {44, XK_9},                 // Digit9
    {45, XK_0},                 // Digit0
    {46, XK_Return},            // Enter
    {47, XK_Escape},            // Escape
    {48, XK_BackSpace},         // Backspace
    {49, XK_Tab},               // Tab
    {50, XK_space},             // Space
    {51, XK_minus},             // Minus
    {52, XK_equal},             // Equal
    {53, XK_bracketleft},       // BracketLeft
    {54, XK_bracketright},      // BracketRight
    {55, XK_backslash},         // Backslash
    {56, XK_semicolon},         // Semicolon
    {57, XK_apostrophe},        // Quote
    {58, XK_grave},             // Backquote
    {59, XK_comma},             // Comma
    {60, XK_period},            // Period
    {61, XK_slash},             // Slash
    {62, XK_Caps_Lock},         // CapsLock
    {63, XK_F1},                // F1
    {64, XK_F2},                // F2
    {65, XK_F3},                // F3
    {66, XK_F4},                // F4
    {67, XK_F5},                // F5
    {68, XK_F6},                // F6
    {69, XK_F7},                // F7
    {70, XK_F8},                // F8
    {71, XK_F9},                // F9
    {72, XK_F10},               // F10
    {73, XK_F11},               // F11
    {74, XK_F12},               // F12
    {75, XK_Print},             // PrintScreen
    {76, XK_Scroll_Lock},       // ScrollLock
    {77, XK_Pause},             // Pause
    {78, XK_Insert},            // Insert
    {79, XK_Home},              // Home
    {80, XK_Prior},             // PageUp
    {81, XK_Delete},            // Delete
    {82, XK_End},               // End
    {83, XK_Next},              // PageDown
    {84, XK_Right},             // ArrowRight
    {85, XK_Left},              // ArrowLeft
    {86, XK_Down},              // ArrowDown
    {87, XK_Up},                // ArrowUp
    {88, XK_Num_Lock},          // NumLock
    {89, XK_KP_Divide},         // NumpadDivide
    {90, XK_KP_Multiply},       // NumpadMultiply
    {91, XK_KP_Subtract},       // NumpadSubtract
    {92, XK_KP_Add},            // NumpadAdd
    {93, XK_KP_Enter},          // NumpadEnter
    {94, XK_KP_1},              // Numpad1
    {95, XK_KP_2},              // Numpad2
    {96, XK_KP_3},              // Numpad3
    {97, XK_KP_4},              // Numpad4
    {98, XK_KP_5},              // Numpad5
    {99, XK_KP_6},              // Numpad6
    {100, XK_KP_7},             // Numpad7
    {101, XK_KP_8},             // Numpad8
    {102, XK_KP_9},             // Numpad9
    {103, XK_KP_0},             // Numpad0
    {104, XK_KP_Decimal},       // NumpadDecimal
    {105, 0},                   // IntlBackslash -> No direct mapping
    {106, XK_Menu},             // ContextMenu
    {107, 0},                   // Power -> No direct mapping
    {108, XK_KP_Equal},         // NumpadEqual
    {109, XK_F13},              // F13
    {110, XK_F14},              // F14
    {111, XK_F15},              // F15
    {112, XK_F16},              // F16
    {113, XK_F17},              // F17
    {114, XK_F18},              // F18
    {115, XK_F19},              // F19
    {116, XK_F20},              // F20
    {117, XK_F21},              // F21
    {118, XK_F22},              // F22
    {119, XK_F23},              // F23
    {120, XK_F24},              // F24
    {121, 0},                   // Open -> No direct mapping
    {122, XK_Help},             // Help
    {123, 0},                   // Select -> No direct mapping
    {124, 0},                   // Again -> No direct mapping
    {125, 0},                   // Undo -> No direct mapping
    {126, 0},                   // Cut -> No direct mapping
    {127, 0},                   // Copy -> No direct mapping
    {128, 0},                   // Paste -> No direct mapping
    {129, 0},                   // Find -> No direct mapping
    {130, 0},                   // AudioVolumeMute -> No direct mapping
    {131, 0},                   // AudioVolumeUp -> No direct mapping
    {132, 0},                   // AudioVolumeDown -> No direct mapping
    {133, 0},                   // NumpadComma -> No direct mapping
    {134, 0},                   // IntlRo -> No direct mapping
    {135, 0},                   // KanaMode -> No direct mapping
    {136, 0},                   // IntlYen -> No direct mapping
    {137, XK_Convert},          // Convert
    {138, XK_NonConvert},       // NonConvert
    {139, 0},                   // Lang1 -> No direct mapping
    {140, 0},                   // Lang2 -> No direct mapping
    {141, 0},                   // Lang3 -> No direct mapping
    {142, 0},                   // Lang4 -> No direct mapping
    {143, 0},                   // Lang5 -> No direct mapping
    {144, XK_Break},            // Abort
    {145, 0},                   // Props -> No direct mapping
    {146, 0},                   // NumpadParenLeft -> No direct mapping
    {147, 0},                   // NumpadParenRight -> No direct mapping
    {148, XK_Control_L},        // ControlLeft
    {149, XK_Shift_L},          // ShiftLeft
    {150, XK_Alt_L},            // AltLeft
    {151, XK_Super_L},          // MetaLeft
    {152, XK_Control_R},        // ControlRight
    {153, XK_Shift_R},          // ShiftRight
    {154, XK_Alt_R},            // AltRight
    {155, XK_Super_R},          // MetaRight
    {156, 0},                   // MediaTrackNext -> No direct mapping
    {157, 0},                   // MediaTrackPrevious -> No direct mapping
    {158, 0},                   // MediaStop -> No direct mapping
    {159, 0},                   // MediaPlayPause -> No direct mapping
    {160, 0},                   // MediaSelect -> No direct mapping
    {161, 0},                   // MediaFastForward -> No direct mapping
    {162, 0},                   // MediaRewind -> No direct mapping
    {163, 0},                   // BrowserBack -> No direct mapping
    {164, 0},                   // BrowserForward -> No direct mapping
    {165, 0},                   // BrowserRefresh -> No direct mapping
    {166, 0},                   // BrowserStop -> No direct mapping
    {167, 0},                   // BrowserSearch -> No direct mapping
    {168, 0},                   // BrowserFavorites -> No direct mapping
    {169, 0},                   // BrowserHome -> No direct mapping
    {170, 0},                   // ZoomToggle -> No direct mapping
    {171, 0},                   // Mail -> No direct mapping
    {172, 0},                   // LaunchApp2 -> No direct mapping
    {173, 0},                   // LaunchApp1 -> No direct mapping
};
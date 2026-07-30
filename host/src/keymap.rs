use enigo::Key;

pub fn code_index_to_key(index: u8) -> Option<Key> {
    Some(match index {
        // Letters -> Unicode
        10 => Key::Unicode('a'),
        11 => Key::Unicode('b'),
        12 => Key::Unicode('c'),
        13 => Key::Unicode('d'),
        14 => Key::Unicode('e'),
        15 => Key::Unicode('f'),
        16 => Key::Unicode('g'),
        17 => Key::Unicode('h'),
        18 => Key::Unicode('i'),
        19 => Key::Unicode('j'),
        20 => Key::Unicode('k'),
        21 => Key::Unicode('l'),
        22 => Key::Unicode('m'),
        23 => Key::Unicode('n'),
        24 => Key::Unicode('o'),
        25 => Key::Unicode('p'),
        26 => Key::Unicode('q'),
        27 => Key::Unicode('r'),
        28 => Key::Unicode('s'),
        29 => Key::Unicode('t'),
        30 => Key::Unicode('u'),
        31 => Key::Unicode('v'),
        32 => Key::Unicode('w'),
        33 => Key::Unicode('x'),
        34 => Key::Unicode('y'),
        35 => Key::Unicode('z'),

        // Digits
        36 => Key::Unicode('1'),
        37 => Key::Unicode('2'),
        38 => Key::Unicode('3'),
        39 => Key::Unicode('4'),
        40 => Key::Unicode('5'),
        41 => Key::Unicode('6'),
        42 => Key::Unicode('7'),
        43 => Key::Unicode('8'),
        44 => Key::Unicode('9'),
        45 => Key::Unicode('0'),

        46 => Key::Return,
        47 => Key::Escape,
        48 => Key::Backspace,
        49 => Key::Tab,
        50 => Key::Space,
        51 => Key::Unicode('-'),
        52 => Key::Unicode('='),
        53 => Key::Unicode('['),
        54 => Key::Unicode(']'),
        55 => Key::Unicode('\\'),
        56 => Key::Unicode(';'),
        57 => Key::Unicode('\''),
        58 => Key::Unicode('`'),
        59 => Key::Unicode(','),
        60 => Key::Unicode('.'),
        61 => Key::Unicode('/'),

        62 => Key::CapsLock,
        63 => Key::F1,
        64 => Key::F2,
        65 => Key::F3,
        66 => Key::F4,
        67 => Key::F5,
        68 => Key::F6,
        69 => Key::F7,
        70 => Key::F8,
        71 => Key::F9,
        72 => Key::F10,
        73 => Key::F11,
        74 => Key::F12,

        #[cfg(any(target_os = "linux", target_os = "windows"))]
        75 => Key::PrintScr,
        #[cfg(target_os = "macos")]
        75 => return None,

        #[cfg(target_os = "linux")]
        76 => Key::ScrollLock,
        #[cfg(not(target_os = "linux"))]
        76 => return None,

        #[cfg(any(target_os = "linux", target_os = "windows"))]
        77 => Key::Pause,
        #[cfg(target_os = "macos")]
        77 => return None,

        #[cfg(any(target_os = "linux", target_os = "windows"))]
        78 => Key::Insert,
        #[cfg(target_os = "macos")]
        78 => return None,

        79 => Key::Home,
        80 => Key::PageUp,
        81 => Key::Delete,
        82 => Key::End,
        83 => Key::PageDown,
        84 => Key::RightArrow,
        85 => Key::LeftArrow,
        86 => Key::DownArrow,
        87 => Key::UpArrow,

        #[cfg(any(target_os = "linux", target_os = "windows"))]
        88 => Key::Numlock,
        #[cfg(target_os = "macos")]
        88 => return None,

        89 => Key::Divide,
        90 => Key::Multiply,
        91 => Key::Subtract,
        92 => Key::Add,
        93 => Key::Return, // NumpadEnter — enigo has no separate variant
        94 => Key::Numpad1,
        95 => Key::Numpad2,
        96 => Key::Numpad3,
        97 => Key::Numpad4,
        98 => Key::Numpad5,
        99 => Key::Numpad6,
        100 => Key::Numpad7,
        101 => Key::Numpad8,
        102 => Key::Numpad9,
        103 => Key::Numpad0,
        104 => Key::Decimal,

        105 => Key::Unicode('\\'), // IntlBackslash, best-effort

        109 => Key::F13,
        110 => Key::F14,
        111 => Key::F15,
        112 => Key::F16,
        113 => Key::F17,
        114 => Key::F18,
        115 => Key::F19,
        116 => Key::F20,
        // F21-F24 don't exist on Windows/macOS enigo::Key — drop them there.
        #[cfg(target_os = "linux")]
        117 => Key::F21,
        #[cfg(target_os = "linux")]
        118 => Key::F22,
        #[cfg(target_os = "linux")]
        119 => Key::F23,
        #[cfg(target_os = "linux")]
        120 => Key::F24,
        #[cfg(not(target_os = "linux"))]
        117..=120 => return None,

        122 => Key::Help,

        #[cfg(target_os = "linux")]
        123 => Key::Select,
        #[cfg(not(target_os = "linux"))]
        123 => return None,

        #[cfg(target_os = "linux")]
        125 => Key::Undo,
        #[cfg(not(target_os = "linux"))]
        125 => return None,

        #[cfg(target_os = "linux")]
        129 => Key::Find,
        #[cfg(not(target_os = "linux"))]
        129 => return None,

        130 => Key::VolumeMute,
        131 => Key::VolumeUp,
        132 => Key::VolumeDown,

        // Modifiers — Alt and Meta are cross-platform-correct per enigo's docs:
        // Alt: alt on Linux/Windows, option on macOS
        // Meta: windows/super/command unified
        148 => Key::LControl,
        149 => Key::LShift,
        150 => Key::Alt,   // AltLeft
        151 => Key::Meta,  // MetaLeft
        152 => Key::RControl,
        153 => Key::RShift,
        154 => Key::Alt,   // AltRight
        155 => Key::Meta,  // MetaRight

        156 => Key::MediaNextTrack,
        157 => Key::MediaPrevTrack,
        #[cfg(target_os = "linux")]
        158 => Key::MediaStop,
        #[cfg(not(target_os = "linux"))]
        158 => return None,
        159 => Key::MediaPlayPause,

        _ => return None,
    })
}
#!/usr/bin/env python3
"""
Set an arbitrary display resolution on macOS using private CoreGraphics SPI.
Requires SIP disabled. No reboot needed.

CGSAddScreenMode injects a mode into the live WindowServer mode table.
CGSSetScreenMode switches to it immediately.
"""
import ctypes
import ctypes.util

# ── Load SkyLight (the private CG server framework) ──────────────────────────
# On older macOS it's in CoreGraphics private; on 11+ it moved to SkyLight.
try:
    cg = ctypes.cdll.LoadLibrary(
        "/System/Library/PrivateFrameworks/SkyLight.framework/SkyLight"
    )
except OSError:
    cg = ctypes.cdll.LoadLibrary(
        "/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics"
    )

cf = ctypes.cdll.LoadLibrary(
    "/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation"
)

# ── Public CG for display ID and existing mode switching ─────────────────────
pub_cg = ctypes.cdll.LoadLibrary(
    "/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics"
)

# ── Types ─────────────────────────────────────────────────────────────────────
CGDirectDisplayID = ctypes.c_uint32
CGError           = ctypes.c_int32

# CGSDisplayModeDescriptionRec — layout reverse-engineered from WebKit/SDL source
# Fields: width, height, freq (refresh), depth, flags, ... (opaque remainder)
class CGSDisplayModeDescription(ctypes.Structure):
    _fields_ = [
        ("mode_id",   ctypes.c_uint32),   # filled in by CGSAddScreenMode
        ("width",     ctypes.c_uint32),
        ("height",    ctypes.c_uint32),
        ("freq",      ctypes.c_double),   # Hz; 0.0 = don't care
        ("depth",     ctypes.c_uint32),   # bits per pixel (32)
        ("flags",     ctypes.c_uint32),   # 0 = normal; 0x20 = HiDPI
        ("pad",       ctypes.c_uint8 * 40),
    ]

# ── Wire up private SPI ───────────────────────────────────────────────────────
# CGSAddScreenMode: inject a new mode into WindowServer's live mode list.
# Returns kCGErrorSuccess (0) on success, sets desc.mode_id.
cg.CGSAddScreenMode.restype  = CGError
cg.CGSAddScreenMode.argtypes = [
    CGDirectDisplayID,
    ctypes.POINTER(CGSDisplayModeDescription),
]

# CGSSetScreenMode: switch the display to a mode_id returned by CGSAddScreenMode.
cg.CGSSetScreenMode.restype  = CGError
cg.CGSSetScreenMode.argtypes = [
    CGDirectDisplayID,
    ctypes.POINTER(CGSDisplayModeDescription),
]

# CGSRemoveScreenMode: clean up an injected mode when done.
try:
    cg.CGSRemoveScreenMode.restype  = CGError
    cg.CGSRemoveScreenMode.argtypes = [
        CGDirectDisplayID,
        ctypes.POINTER(CGSDisplayModeDescription),
    ]
    HAS_REMOVE = True
except AttributeError:
    HAS_REMOVE = False

# ── Public API helpers ────────────────────────────────────────────────────────
pub_cg.CGMainDisplayID.restype  = CGDirectDisplayID
pub_cg.CGMainDisplayID.argtypes = []

pub_cg.CGDisplayModeGetWidth.restype  = ctypes.c_size_t
pub_cg.CGDisplayModeGetWidth.argtypes = [ctypes.c_void_p]

pub_cg.CGDisplayModeGetHeight.restype = ctypes.c_size_t
pub_cg.CGDisplayModeGetHeight.argtypes = [ctypes.c_void_p]

pub_cg.CGDisplayCopyDisplayMode.restype  = ctypes.c_void_p
pub_cg.CGDisplayCopyDisplayMode.argtypes = [CGDirectDisplayID]


# ── Core functions ────────────────────────────────────────────────────────────

def get_current_size(display_id=None):
    if display_id is None:
        display_id = pub_cg.CGMainDisplayID()
    mode = pub_cg.CGDisplayCopyDisplayMode(display_id)
    if not mode:
        return None
    w = pub_cg.CGDisplayModeGetWidth(mode)
    h = pub_cg.CGDisplayModeGetHeight(mode)
    return w, h


def set_arbitrary_resolution(width: int, height: int,
                              display_id=None,
                              hz: float = 0.0,
                              hidpi: bool = False):
    """
    Inject an arbitrary width×height mode into WindowServer and switch to it.

    width, height : logical point size (what apps see)
    hz            : refresh rate; 0.0 = use whatever the display supports
    hidpi         : if True, flag the mode as HiDPI (renders at 2× internally)
    """
    if display_id is None:
        display_id = pub_cg.CGMainDisplayID()

    desc = CGSDisplayModeDescription()
    desc.width   = width
    desc.height  = height
    desc.freq    = hz
    desc.depth   = 32
    desc.flags   = 0x20 if hidpi else 0x00

    # Inject the mode
    err = cg.CGSAddScreenMode(display_id, ctypes.byref(desc))
    if err != 0:
        raise RuntimeError(
            f"CGSAddScreenMode failed: error {err}\n"
            f"  Make sure you're running as root or with appropriate entitlements.\n"
            f"  The display must be able to physically drive {width}×{height}."
        )

    mode_id = desc.mode_id
    print(f"Injected mode id={mode_id}  {width}×{height}  {hz}Hz  hidpi={hidpi}")

    # Switch to it
    err = cg.CGSSetScreenMode(display_id, ctypes.byref(desc))
    if err != 0:
        raise RuntimeError(f"CGSSetScreenMode failed: error {err}")

    print(f"Switched display {display_id} to {width}×{height}")
    return mode_id


def remove_injected_mode(mode_id: int, width: int, height: int,
                          display_id=None, hz: float = 0.0):
    """Remove a previously injected mode."""
    if not HAS_REMOVE:
        print("CGSRemoveScreenMode not available on this OS version.")
        return
    if display_id is None:
        display_id = pub_cg.CGMainDisplayID()

    desc = CGSDisplayModeDescription()
    desc.mode_id = mode_id
    desc.width   = width
    desc.height  = height
    desc.freq    = hz
    desc.depth   = 32

    err = cg.CGSRemoveScreenMode(display_id, ctypes.byref(desc))
    if err != 0:
        print(f"CGSRemoveScreenMode failed: error {err}")
    else:
        print(f"Removed mode id={mode_id}")


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import sys

    display = pub_cg.CGMainDisplayID()
    current = get_current_size(display)
    print(f"Current size: {current[0]}×{current[1]}")

    if len(sys.argv) == 3:
        w, h = int(sys.argv[1]), int(sys.argv[2])
    else:
        w, h = 1366, 768   # change to whatever you want

    set_arbitrary_resolution(w, h, display_id=display)
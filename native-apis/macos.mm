#include <napi.h>
#include <Carbon/Carbon.h>
#include <optional>
#include <array>
#include <cmath>
#import <Foundation/Foundation.h>

// Private CoreGraphics API — no public header exists; redeclared here.
// May break across macOS versions since it's undocumented.
@interface CGVirtualDisplayDescriptor : NSObject
@property(copy) NSString *name;
@property CGSize sizeInMillimeters;
@property uint32_t maxPixelsWide;
@property uint32_t maxPixelsHigh;
@property CGPoint productID;
@property CGPoint vendorID;
@property uint32_t serialNum;
@end

@interface CGVirtualDisplayMode : NSObject
- (instancetype)initWithWidth:(uint32_t)width height:(uint32_t)height refreshRate:(double)refreshRate;
@end

@interface CGVirtualDisplaySettings : NSObject
@property(copy) NSArray<CGVirtualDisplayMode *> *modes;
@end

@interface CGVirtualDisplay : NSObject
- (instancetype)initWithDescriptor:(CGVirtualDisplayDescriptor *)descriptor;
- (BOOL)applySettings:(CGVirtualDisplaySettings *)settings;
@property(readonly) CGDirectDisplayID displayID;
@end

namespace {

inline constexpr std::array<std::optional<CGKeyCode>, 174> kMacVirtualKeyMap = {
    std::nullopt, std::nullopt, std::nullopt, std::nullopt, std::nullopt,
    std::nullopt, std::nullopt, std::nullopt, kVK_Function, std::nullopt,
    kVK_ANSI_A, kVK_ANSI_B, kVK_ANSI_C, kVK_ANSI_D, kVK_ANSI_E, kVK_ANSI_F,
    kVK_ANSI_G, kVK_ANSI_H, kVK_ANSI_I, kVK_ANSI_J, kVK_ANSI_K, kVK_ANSI_L,
    kVK_ANSI_M, kVK_ANSI_N, kVK_ANSI_O, kVK_ANSI_P, kVK_ANSI_Q, kVK_ANSI_R,
    kVK_ANSI_S, kVK_ANSI_T, kVK_ANSI_U, kVK_ANSI_V, kVK_ANSI_W, kVK_ANSI_X,
    kVK_ANSI_Y, kVK_ANSI_Z, kVK_ANSI_1, kVK_ANSI_2, kVK_ANSI_3, kVK_ANSI_4,
    kVK_ANSI_5, kVK_ANSI_6, kVK_ANSI_7, kVK_ANSI_8, kVK_ANSI_9, kVK_ANSI_0,
    kVK_Return, kVK_Escape, kVK_Delete, kVK_Tab, kVK_Space, kVK_ANSI_Minus,
    kVK_ANSI_Equal, kVK_ANSI_LeftBracket, kVK_ANSI_RightBracket,
    kVK_ANSI_Backslash, kVK_ANSI_Semicolon, kVK_ANSI_Quote, kVK_ANSI_Grave,
    kVK_ANSI_Comma, kVK_ANSI_Period, kVK_ANSI_Slash, kVK_CapsLock,
    kVK_F1, kVK_F2, kVK_F3, kVK_F4, kVK_F5, kVK_F6, kVK_F7, kVK_F8, kVK_F9,
    kVK_F10, kVK_F11, kVK_F12, std::nullopt, std::nullopt, std::nullopt,
    kVK_Help, kVK_Home, kVK_PageUp, kVK_ForwardDelete, kVK_End, kVK_PageDown,
    kVK_RightArrow, kVK_LeftArrow, kVK_DownArrow, kVK_UpArrow,
    kVK_ANSI_KeypadClear, kVK_ANSI_KeypadDivide, kVK_ANSI_KeypadMultiply,
    kVK_ANSI_KeypadMinus, kVK_ANSI_KeypadPlus, kVK_ANSI_KeypadEnter,
    kVK_ANSI_Keypad1, kVK_ANSI_Keypad2, kVK_ANSI_Keypad3, kVK_ANSI_Keypad4,
    kVK_ANSI_Keypad5, kVK_ANSI_Keypad6, kVK_ANSI_Keypad7, kVK_ANSI_Keypad8,
    kVK_ANSI_Keypad9, kVK_ANSI_Keypad0, kVK_ANSI_KeypadDecimal,
    kVK_ISO_Section, std::nullopt, std::nullopt, kVK_ANSI_KeypadEquals,
    kVK_F13, kVK_F14, kVK_F15, kVK_F16, kVK_F17, kVK_F18, kVK_F19, kVK_F20,
    std::nullopt, std::nullopt, std::nullopt, std::nullopt, std::nullopt,
    kVK_Help, std::nullopt, std::nullopt, std::nullopt, std::nullopt,
    std::nullopt, std::nullopt, std::nullopt, kVK_Mute, kVK_VolumeUp,
    kVK_VolumeDown, std::nullopt, std::nullopt, kVK_JIS_Kana, kVK_JIS_Yen,
    std::nullopt, std::nullopt, std::nullopt, std::nullopt, std::nullopt,
    std::nullopt, std::nullopt, std::nullopt, std::nullopt, std::nullopt,
    std::nullopt, kVK_Control, kVK_Shift, kVK_Option, kVK_Command,
    kVK_RightControl, kVK_RightShift, kVK_RightOption, kVK_RightCommand,
    std::nullopt, std::nullopt, std::nullopt, std::nullopt, std::nullopt,
    std::nullopt, std::nullopt, std::nullopt, std::nullopt, std::nullopt,
    std::nullopt, std::nullopt, std::nullopt, std::nullopt, std::nullopt,
    std::nullopt, std::nullopt, std::nullopt,
};

CGPoint CurrentMouseLocation() {
    CGEventRef event = CGEventCreate(nullptr);
    CGPoint point = CGEventGetLocation(event);
    CFRelease(event);
    return point;
}

void PostMouseEvent(CGEventType type, CGPoint location, CGMouseButton button) {
    CGEventRef event = CGEventCreateMouseEvent(nullptr, type, location, button);
    CGEventPost(kCGHIDEventTap, event);
    CFRelease(event);
}

CGVirtualDisplay* g_virtualDisplay = nil;

void CreateVirtualScreen(const Napi::CallbackInfo& info) {
    std::uint32_t x = info[0].As<Napi::Number>().Uint32Value();
    std::uint32_t y = info[1].As<Napi::Number>().Uint32Value();

    if (g_virtualDisplay != nil) return; // already created

    CGVirtualDisplayDescriptor *descriptor = [[CGVirtualDisplayDescriptor alloc] init];
    descriptor.name = @"Virtual Display";
    descriptor.sizeInMillimeters = CGSizeMake(x / 4, y / 4); // arbitrary DPI approximation
    descriptor.maxPixelsWide = x;
    descriptor.maxPixelsHigh = y;
    descriptor.serialNum = 1;
    descriptor.vendorID = CGPointMake(0x1234, 0);
    descriptor.productID = CGPointMake(0x5678, 0);

    g_virtualDisplay = [[CGVirtualDisplay alloc] initWithDescriptor:descriptor];

    CGVirtualDisplayMode *mode = [[CGVirtualDisplayMode alloc] initWithWidth:x height:y refreshRate:60.0];
    CGVirtualDisplaySettings *settings = [[CGVirtualDisplaySettings alloc] init];
    settings.modes = @[mode];

    [g_virtualDisplay applySettings:settings];
}

void ResizeVirtualScreen(const Napi::CallbackInfo& info) {
    std::uint32_t x = info[0].As<Napi::Number>().Uint32Value();
    std::uint32_t y = info[1].As<Napi::Number>().Uint32Value();

    if (g_virtualDisplay == nil) return;

    CGVirtualDisplayMode *mode = [[CGVirtualDisplayMode alloc] initWithWidth:x height:y refreshRate:60.0];
    CGVirtualDisplaySettings *settings = [[CGVirtualDisplaySettings alloc] init];
    settings.modes = @[mode];

    [g_virtualDisplay applySettings:settings];
}

void DestroyVirtualScreen(const Napi::CallbackInfo& info) {
    g_virtualDisplay = nil; // ARC releases; display disappears once deallocated
}

void ScrollMouse(const Napi::CallbackInfo& info) {
    std::uint8_t deltaMode = static_cast<std::uint8_t>(info[0].As<Napi::Number>().Uint32Value());
    float deltaX = info[1].As<Napi::Number>().FloatValue();
    float deltaY = info[2].As<Napi::Number>().FloatValue();
    float deltaZ = info[3].As<Napi::Number>().FloatValue();

    CGScrollEventUnit unit = (deltaMode == 0) ? kCGScrollEventUnitPixel : kCGScrollEventUnitLine;
    float scale = (deltaMode == 2) ? 3.0f : 1.0f;

    int32_t wheel1 = static_cast<int32_t>(std::lround(-deltaY * scale));
    int32_t wheel2 = static_cast<int32_t>(std::lround(-deltaX * scale));
    int32_t wheel3 = static_cast<int32_t>(std::lround(-deltaZ * scale));

    CGEventRef event = CGEventCreateScrollWheelEvent(nullptr, unit, 3, wheel1, wheel2, wheel3);
    CGEventSetDoubleValueField(event, kCGScrollWheelEventFixedPtDeltaAxis1, -deltaY * scale);
    CGEventSetDoubleValueField(event, kCGScrollWheelEventFixedPtDeltaAxis2, -deltaX * scale);
    CGEventPost(kCGHIDEventTap, event);
    CFRelease(event);
}

void SetKeyboardKey(const Napi::CallbackInfo& info) {
    std::uint8_t codeValue = static_cast<std::uint8_t>(info[0].As<Napi::Number>().Uint32Value());
    bool isDown = info[1].As<Napi::Boolean>().Value();

    if (codeValue >= kMacVirtualKeyMap.size()) return;
    auto vk = kMacVirtualKeyMap[codeValue];
    if (!vk) return;

    CGEventRef event = CGEventCreateKeyboardEvent(nullptr, *vk, isDown);
    CGEventPost(kCGHIDEventTap, event);
    CFRelease(event);
}

void SetMouseButton(const Napi::CallbackInfo& info) {
    std::uint8_t button = static_cast<std::uint8_t>(info[0].As<Napi::Number>().Uint32Value());
    bool isDown = info[1].As<Napi::Boolean>().Value();

    CGPoint location = CurrentMouseLocation();
    CGMouseButton cgButton;
    CGEventType type;

    switch (button) {
        case 0:
            cgButton = kCGMouseButtonLeft;
            type = isDown ? kCGEventLeftMouseDown : kCGEventLeftMouseUp;
            break;
        case 1:
            cgButton = kCGMouseButtonCenter;
            type = isDown ? kCGEventOtherMouseDown : kCGEventOtherMouseUp;
            break;
        case 2:
            cgButton = kCGMouseButtonRight;
            type = isDown ? kCGEventRightMouseDown : kCGEventRightMouseUp;
            break;
        case 3:
            cgButton = static_cast<CGMouseButton>(3);
            type = isDown ? kCGEventOtherMouseDown : kCGEventOtherMouseUp;
            break;
        case 4:
            cgButton = static_cast<CGMouseButton>(4);
            type = isDown ? kCGEventOtherMouseDown : kCGEventOtherMouseUp;
            break;
        default:
            return;
    }

    PostMouseEvent(type, location, cgButton);
}

void SetMousePosition(const Napi::CallbackInfo& info) {
    std::uint32_t x = info[0].As<Napi::Number>().Uint32Value();
    std::uint32_t y = info[1].As<Napi::Number>().Uint32Value();

    CGPoint location = CGPointMake(static_cast<CGFloat>(x), static_cast<CGFloat>(y));
    PostMouseEvent(kCGEventMouseMoved, location, kCGMouseButtonLeft);
}

void MoveMousePosition(const Napi::CallbackInfo& info) {
    std::int32_t x = info[0].As<Napi::Number>().Int32Value();
    std::int32_t y = info[1].As<Napi::Number>().Int32Value();

    CGPoint current = CurrentMouseLocation();
    CGPoint location = CGPointMake(current.x + x, current.y + y);
    PostMouseEvent(kCGEventMouseMoved, location, kCGMouseButtonLeft);
}

} // namespace

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("createVirtualScreen", Napi::Function::New(env, CreateVirtualScreen));
    exports.Set("resizeVirtualScreen", Napi::Function::New(env, ResizeVirtualScreen));
    exports.Set("destroyVirtualScreen", Napi::Function::New(env, DestroyVirtualScreen));
    exports.Set("scrollMouse", Napi::Function::New(env, ScrollMouse));
    exports.Set("setKeyboardKey", Napi::Function::New(env, SetKeyboardKey));
    exports.Set("setMouseButton", Napi::Function::New(env, SetMouseButton));
    exports.Set("setMousePosition", Napi::Function::New(env, SetMousePosition));
    exports.Set("moveMousePosition", Napi::Function::New(env, MoveMousePosition));
    return exports;
}

NODE_API_MODULE(input_macos, Init)
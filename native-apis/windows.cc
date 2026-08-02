#include <napi.h>
#include <windows.h>
#include <optional>
#include <array>

#include <fstream>
#include <string>

namespace {

inline constexpr std::array<std::optional<WORD>, 174> kWindowsVirtualKeyMap = {
    std::nullopt, std::nullopt, std::nullopt, std::nullopt, std::nullopt,
    std::nullopt, std::nullopt, std::nullopt, std::nullopt, std::nullopt,
    'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N',
    'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
    '1', '2', '3', '4', '5', '6', '7', '8', '9', '0',
    VK_RETURN, VK_ESCAPE, VK_BACK, VK_TAB, VK_SPACE,
    VK_OEM_MINUS, VK_OEM_PLUS, VK_OEM_4, VK_OEM_6, VK_OEM_5,
    VK_OEM_1, VK_OEM_7, VK_OEM_3, VK_OEM_COMMA, VK_OEM_PERIOD, VK_OEM_2,
    VK_CAPITAL, VK_F1, VK_F2, VK_F3, VK_F4, VK_F5, VK_F6, VK_F7, VK_F8,
    VK_F9, VK_F10, VK_F11, VK_F12, std::nullopt, std::nullopt, std::nullopt,
    std::nullopt, VK_HOME, VK_PRIOR, VK_DELETE, VK_END, VK_NEXT,
    VK_RIGHT, VK_LEFT, VK_DOWN, VK_UP, VK_CLEAR, VK_DIVIDE, VK_MULTIPLY,
    VK_SUBTRACT, VK_ADD, VK_RETURN, VK_NUMPAD1, VK_NUMPAD2, VK_NUMPAD3,
    VK_NUMPAD4, VK_NUMPAD5, VK_NUMPAD6, VK_NUMPAD7, VK_NUMPAD8, VK_NUMPAD9,
    VK_NUMPAD0, VK_DECIMAL, std::nullopt, std::nullopt, std::nullopt,
    std::nullopt, VK_F13, VK_F14, VK_F15, VK_F16, VK_F17, VK_F18, VK_F19,
    VK_F20, std::nullopt, std::nullopt, std::nullopt, std::nullopt,
    std::nullopt, VK_HELP, std::nullopt, std::nullopt, std::nullopt,
    std::nullopt, std::nullopt, std::nullopt, std::nullopt, VK_VOLUME_MUTE,
    VK_VOLUME_UP, VK_VOLUME_DOWN, std::nullopt, std::nullopt, VK_KANA,
    std::nullopt, std::nullopt, std::nullopt, std::nullopt, std::nullopt,
    std::nullopt, std::nullopt, std::nullopt, std::nullopt, std::nullopt,
    std::nullopt, std::nullopt, VK_CONTROL, VK_SHIFT, VK_MENU, VK_LWIN,
    VK_RCONTROL, VK_RSHIFT, VK_MENU, VK_RWIN, std::nullopt, std::nullopt,
    std::nullopt, std::nullopt, std::nullopt, std::nullopt, std::nullopt,
    std::nullopt, std::nullopt, std::nullopt, std::nullopt, std::nullopt,
    std::nullopt, std::nullopt, std::nullopt, std::nullopt, std::nullopt,
    std::nullopt, std::nullopt,
};

const wchar_t* kVddConfigPath = L"C:\\ProgramData\\VirtualDisplayDriver\\vdd_settings.xml";
const wchar_t* kVddDeviceInstancePattern = L"Root\\MttVDD"; // adjust to actual hardware ID if different

void WriteVddConfig(std::uint32_t x, std::uint32_t y) {
    std::wofstream file(kVddConfigPath);
    if (!file.is_open()) return;

    file << L"<vdd_settings>\n"
         << L"  <resolutions>\n"
         << L"    <resolution>\n"
         << L"      <width>" << x << L"</width>\n"
         << L"      <height>" << y << L"</height>\n"
         << L"      <refresh_rate>60</refresh_rate>\n"
         << L"    </resolution>\n"
         << L"  </resolutions>\n"
         << L"</vdd_settings>\n";

    file.close();
}

// Disables then re-enables the VDD device node so it re-reads the config
// and re-enumerates with the new resolution.
void ReloadVddDevice() {
    // Requires devcon.exe (Windows Driver Kit tool) available on PATH,
    // or an equivalent SetupAPI-based disable/enable call.
    _wsystem((std::wstring(L"devcon disable ") + kVddDeviceInstancePattern).c_str());
    Sleep(500);
    _wsystem((std::wstring(L"devcon enable ") + kVddDeviceInstancePattern).c_str());
}

bool g_virtualScreenCreated = false;

void CreateVirtualScreen(const Napi::CallbackInfo& info) {
    std::uint32_t x = info[0].As<Napi::Number>().Uint32Value();
    std::uint32_t y = info[1].As<Napi::Number>().Uint32Value();

    WriteVddConfig(x, y);
    ReloadVddDevice();
    g_virtualScreenCreated = true;
}

void ResizeVirtualScreen(const Napi::CallbackInfo& info) {
    std::uint32_t x = info[0].As<Napi::Number>().Uint32Value();
    std::uint32_t y = info[1].As<Napi::Number>().Uint32Value();

    if (!g_virtualScreenCreated) return;

    WriteVddConfig(x, y);
    ReloadVddDevice();
}

void DestroyVirtualScreen(const Napi::CallbackInfo& info) {
    if (!g_virtualScreenCreated) return;

    _wsystem((std::wstring(L"devcon disable ") + kVddDeviceInstancePattern).c_str());
    g_virtualScreenCreated = false;
}

void ScrollMouse(const Napi::CallbackInfo& info) {
    std::uint8_t deltaMode = static_cast<std::uint8_t>(info[0].As<Napi::Number>().Uint32Value());
    float deltaX = info[1].As<Napi::Number>().FloatValue();
    float deltaY = info[2].As<Napi::Number>().FloatValue();
    // deltaZ (info[3]) has no Windows equivalent; ignored.

    float scale = (deltaMode == 2) ? 3.0f : (deltaMode == 0 ? 1.0f : WHEEL_DELTA);

    INPUT input{};
    input.type = INPUT_MOUSE;

    if (deltaY != 0.0f) {
        input.mi.dwFlags = MOUSEEVENTF_WHEEL;
        input.mi.mouseData = static_cast<DWORD>(-deltaY * scale);
        SendInput(1, &input, sizeof(INPUT));
    }
    if (deltaX != 0.0f) {
        input.mi.dwFlags = MOUSEEVENTF_HWHEEL;
        input.mi.mouseData = static_cast<DWORD>(deltaX * scale);
        SendInput(1, &input, sizeof(INPUT));
    }
}

void SetKeyboardKey(const Napi::CallbackInfo& info) {
    std::uint8_t codeValue = static_cast<std::uint8_t>(info[0].As<Napi::Number>().Uint32Value());
    bool isDown = info[1].As<Napi::Boolean>().Value();

    if (codeValue >= kWindowsVirtualKeyMap.size()) return;
    auto vk = kWindowsVirtualKeyMap[codeValue];
    if (!vk) return;

    INPUT input{};
    input.type = INPUT_KEYBOARD;
    input.ki.wVk = *vk;
    input.ki.dwFlags = isDown ? 0 : KEYEVENTF_KEYUP;
    SendInput(1, &input, sizeof(INPUT));
}

void SetMouseButton(const Napi::CallbackInfo& info) {
    std::uint8_t button = static_cast<std::uint8_t>(info[0].As<Napi::Number>().Uint32Value());
    bool isDown = info[1].As<Napi::Boolean>().Value();

    INPUT input{};
    input.type = INPUT_MOUSE;

    switch (button) {
        case 0: input.mi.dwFlags = isDown ? MOUSEEVENTF_LEFTDOWN : MOUSEEVENTF_LEFTUP; break;
        case 1: input.mi.dwFlags = isDown ? MOUSEEVENTF_MIDDLEDOWN : MOUSEEVENTF_MIDDLEUP; break;
        case 2: input.mi.dwFlags = isDown ? MOUSEEVENTF_RIGHTDOWN : MOUSEEVENTF_RIGHTUP; break;
        case 3:
            input.mi.dwFlags = isDown ? MOUSEEVENTF_XDOWN : MOUSEEVENTF_XUP;
            input.mi.mouseData = XBUTTON1;
            break;
        case 4:
            input.mi.dwFlags = isDown ? MOUSEEVENTF_XDOWN : MOUSEEVENTF_XUP;
            input.mi.mouseData = XBUTTON2;
            break;
        default:
            return;
    }

    SendInput(1, &input, sizeof(INPUT));
}

void SetMousePosition(const Napi::CallbackInfo& info) {
    std::uint32_t x = info[0].As<Napi::Number>().Uint32Value();
    std::uint32_t y = info[1].As<Napi::Number>().Uint32Value();
    SetCursorPos(static_cast<int>(x), static_cast<int>(y));
}

void MoveMousePosition(const Napi::CallbackInfo& info) {
    std::int32_t x = info[0].As<Napi::Number>().Int32Value();
    std::int32_t y = info[1].As<Napi::Number>().Int32Value();

    POINT current;
    GetCursorPos(&current);
    SetCursorPos(current.x + x, current.y + y);
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

NODE_API_MODULE(input_windows, Init)
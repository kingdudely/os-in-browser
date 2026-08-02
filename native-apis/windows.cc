#include <napi.h>
#include <windows.h>
#include <setupapi.h>
#include <cfgmgr32.h>
#include <optional>
#include <array>

#include <fstream>
#include <string>

#pragma comment(lib, "setupapi.lib")
#pragma comment(lib, "cfgmgr32.lib")
#pragma comment(lib, "advapi32.lib")   // add this near the other pragma comment lines

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


// Resolves the driver's actual config directory. Checks
// HKLM\SOFTWARE\MikeTheTech\VirtualDisplayDriver\VDDPATH first, since a
// custom install path overrides the C:\VirtualDisplayDriver default (see
// project wiki / discussion #144 — hardcoding the default silently
// no-ops on nondefault installs).
std::wstring GetVddConfigDir() {
    HKEY hKey;
    if (RegOpenKeyExW(HKEY_LOCAL_MACHINE,
                       L"SOFTWARE\\MikeTheTech\\VirtualDisplayDriver",
                       0, KEY_READ, &hKey) == ERROR_SUCCESS) {
        wchar_t buffer[MAX_PATH]{};
        DWORD size = sizeof(buffer);
        DWORD type = 0;
        LONG result = RegQueryValueExW(hKey, L"VDDPATH", nullptr, &type,
                                        reinterpret_cast<LPBYTE>(buffer), &size);
        RegCloseKey(hKey);
        if (result == ERROR_SUCCESS && type == REG_SZ && buffer[0] != L'\0') {
            return std::wstring(buffer);
        }
    }
    return L"C:\\VirtualDisplayDriver";
}
// Device instance/hardware ID the installer registers the driver under.
const wchar_t* kVddHardwareId = L"Root\\MttVDD";

// Full config schema per VirtualDrivers wiki "How to configure the driver"
// (previous version only wrote <resolutions>, which is incomplete).
void WriteVddConfig(std::uint32_t x, std::uint32_t y) {
    std::wstring configPath = GetVddConfigDir() + L"\\vdd_settings.xml";
    std::wofstream file(configPath);
    if (!file.is_open()) return;

    file << L"<?xml version='1.0' encoding='utf-8'?>\n";
    file << L"<vdd_settings>\n"
         << L"  <monitors>\n"
         << L"    <count>1</count>\n"
         << L"  </monitors>\n"
         << L"  <gpu>\n"
         << L"    <friendlyname>default</friendlyname>\n"
         << L"  </gpu>\n"
         << L"  <global>\n"
         << L"    <g_refresh_rate>60</g_refresh_rate>\n"
         << L"  </global>\n"
         << L"  <resolutions>\n"
         << L"    <resolution>\n"
         << L"      <width>" << x << L"</width>\n"
         << L"      <height>" << y << L"</height>\n"
         << L"      <refresh_rate>60</refresh_rate>\n"
         << L"    </resolution>\n"
         << L"  </resolutions>\n"
         << L"  <options>\n"
         << L"    <CustomEdid>false</CustomEdid>\n"
         << L"    <PreventSpoof>false</PreventSpoof>\n"
         << L"    <EdidCeaOverride>false</EdidCeaOverride>\n"
         << L"    <HardwareCursor>true</HardwareCursor>\n"
         << L"    <SDR10bit>false</SDR10bit>\n"
         << L"    <HDRPlus>false</HDRPlus>\n"
         << L"    <logging>false</logging>\n"
         << L"    <debuglogging>false</debuglogging>\n"
         << L"  </options>\n"
         << L"</vdd_settings>\n";

    file.close();
}

// Finds the VDD device node via SetupAPI by matching its hardware ID, then
// toggles it enabled/disabled through the class installer. No devcon.exe
// dependency -- devcon's path isn't stable/discoverable after a
// winget/VDC install, so shelling out to it is unreliable. SetupAPI /
// CfgMgr32 ship with Windows and need no external binary.
bool SetVddDeviceEnabled(bool enable) {
    HDEVINFO deviceInfoSet = SetupDiGetClassDevsW(
        nullptr, nullptr, nullptr, DIGCF_ALLCLASSES | DIGCF_PRESENT);
    if (deviceInfoSet == INVALID_HANDLE_VALUE) return false;

    bool found = false;
    SP_DEVINFO_DATA devInfoData{};
    devInfoData.cbSize = sizeof(SP_DEVINFO_DATA);

    for (DWORD i = 0; SetupDiEnumDeviceInfo(deviceInfoSet, i, &devInfoData); ++i) {
        wchar_t hwIdBuffer[512]{};
        if (!SetupDiGetDeviceRegistryPropertyW(
                deviceInfoSet, &devInfoData, SPDRP_HARDWAREID, nullptr,
                reinterpret_cast<PBYTE>(hwIdBuffer), sizeof(hwIdBuffer), nullptr)) {
            continue;
        }

        for (wchar_t* id = hwIdBuffer; *id; id += wcslen(id) + 1) {
            if (_wcsicmp(id, kVddHardwareId) == 0) {
                found = true;
                break;
            }
        }
        if (!found) continue;

        SP_PROPCHANGE_PARAMS propChangeParams{};
        propChangeParams.ClassInstallHeader.cbSize = sizeof(SP_CLASSINSTALL_HEADER);
        propChangeParams.ClassInstallHeader.InstallFunction = DIF_PROPERTYCHANGE;
        propChangeParams.StateChange = enable ? DICS_ENABLE : DICS_DISABLE;
        propChangeParams.Scope = DICS_FLAG_GLOBAL;
        propChangeParams.HwProfile = 0;

        if (!SetupDiSetClassInstallParamsW(
                deviceInfoSet, &devInfoData,
                reinterpret_cast<SP_CLASSINSTALL_HEADER*>(&propChangeParams),
                sizeof(propChangeParams))) {
            break;
        }
        if (!SetupDiCallClassInstaller(DIF_PROPERTYCHANGE, deviceInfoSet, &devInfoData)) {
            found = false;
        }
        break;
    }

    SetupDiDestroyDeviceInfoList(deviceInfoSet);
    return found;
}

// Disables then re-enables the VDD device node so it re-reads the config
// and re-enumerates with the new resolution. Confirmed as an officially
// valid reload method per the VDD wiki.
void ReloadVddDevice() {
    if (SetVddDeviceEnabled(false)) {
        Sleep(500);
        SetVddDeviceEnabled(true);
    }
}

bool g_virtualScreenCreated = false;
std::uint32_t g_screenWidth = 0;
std::uint32_t g_screenHeight = 0;

void CreateVirtualScreen(const Napi::CallbackInfo& info) {
    g_screenWidth = info[0].As<Napi::Number>().Uint32Value();
    g_screenHeight = info[1].As<Napi::Number>().Uint32Value();

    WriteVddConfig(g_screenWidth, g_screenHeight);
    ReloadVddDevice();
    g_virtualScreenCreated = true;
}

void ResizeVirtualScreen(const Napi::CallbackInfo& info) {
    if (!g_virtualScreenCreated) return;

    g_screenWidth = info[0].As<Napi::Number>().Uint32Value();
    g_screenHeight = info[1].As<Napi::Number>().Uint32Value();

    WriteVddConfig(g_screenWidth, g_screenHeight);
    ReloadVddDevice();
}

void DestroyVirtualScreen(const Napi::CallbackInfo& info) {
    if (!g_virtualScreenCreated) return;

    SetVddDeviceEnabled(false);
    g_virtualScreenCreated = false;
}

void ScrollMouse(const Napi::CallbackInfo& info) {
    std::uint8_t deltaMode = static_cast<std::uint8_t>(info[0].As<Napi::Number>().Uint32Value());
    float deltaX = info[1].As<Napi::Number>().FloatValue();
    float deltaY = info[2].As<Napi::Number>().FloatValue();

    float scaleX, scaleY;
    switch (deltaMode) {
        case 0: // pixel
            scaleX = scaleY = 1.0f;
            break;
        case 2: // page = one full screen dimension
            scaleX = g_screenWidth  ? static_cast<float>(g_screenWidth)  : static_cast<float>(WHEEL_DELTA) * 3.0f;
            scaleY = g_screenHeight ? static_cast<float>(g_screenHeight) : static_cast<float>(WHEEL_DELTA) * 3.0f;
            break;
        case 1: // line = one wheel detent
        default:
            scaleX = scaleY = static_cast<float>(WHEEL_DELTA);
            break;
    }

    INPUT input{};
    input.type = INPUT_MOUSE;
    if (deltaY != 0.0f) {
        input.mi.dwFlags = MOUSEEVENTF_WHEEL;
        input.mi.mouseData = static_cast<DWORD>(-deltaY * scaleY);
        SendInput(1, &input, sizeof(INPUT));
    }
    if (deltaX != 0.0f) {
        input.mi.dwFlags = MOUSEEVENTF_HWHEEL;
        input.mi.mouseData = static_cast<DWORD>(deltaX * scaleX);
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

    INPUT input{};
    input.type = INPUT_MOUSE;
    input.mi.dx = x;
    input.mi.dy = y;
    input.mi.dwFlags = MOUSEEVENTF_MOVE; // no MOUSEEVENTF_ABSOLUTE -> dx/dy are
                                          // relative deltas per MOUSEINPUT docs
    SendInput(1, &input, sizeof(INPUT));
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
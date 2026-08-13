#include "../../shared/virtual_screen.hpp"

#include <windows.h>
#include <setupapi.h>
#include <cfgmgr32.h>

#include <cstdint>
#include <fstream>
#include <string>

#pragma comment(lib, "setupapi.lib")
#pragma comment(lib, "cfgmgr32.lib")
#pragma comment(lib, "advapi32.lib")

namespace {

// Resolves the driver's actual config directory. Checks
// HKLM\SOFTWARE\MikeTheTech\VirtualDisplayDriver\VDDPATH first, since a
// custom install path overrides the C:\VirtualDisplayDriver default (see
// project wiki / discussion #144 -- hardcoding the default silently
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

bool g_virtualDisplayCreated = false;

} // namespace

void CreateVirtualScreen(const Napi::CallbackInfo& info) {
    std::uint32_t screenWidth = info[0].As<Napi::Number>().Uint32Value();
    std::uint32_t screenHeight = info[1].As<Napi::Number>().Uint32Value();

    WriteVddConfig(screenWidth, screenHeight);
    ReloadVddDevice();
    g_virtualDisplayCreated = true;
}

void ResizeVirtualScreen(const Napi::CallbackInfo& info) {
    if (!g_virtualDisplayCreated) return;

    std::uint32_t screenWidth = info[0].As<Napi::Number>().Uint32Value();
    std::uint32_t screenHeight = info[1].As<Napi::Number>().Uint32Value();

    WriteVddConfig(screenWidth, screenHeight);
    ReloadVddDevice();
}

void DestroyVirtualScreen(const Napi::CallbackInfo& info) {
    if (!g_virtualDisplayCreated) return;

    SetVddDeviceEnabled(false);
    g_virtualDisplayCreated = false;
}
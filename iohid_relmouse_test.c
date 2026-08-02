// iohid_relmouse_test.c
//
// Minimal probe: can we create a relative-motion-only HID mouse device via
// IOHIDUserDeviceCreate and post relative X/Y reports, without a kext or
// DriverKit extension? Prints PASS/FAIL and exits non-zero on failure so
// CI can gate on it.

#include <CoreFoundation/CoreFoundation.h>
#include <IOKit/hid/IOHIDUserDevice.h>
#include <IOKit/hid/IOHIDKeys.h>
#include <stdio.h>
#include <unistd.h>

// Minimal HID report descriptor: relative mouse with 2 buttons + X/Y, no wheel.
static const uint8_t report_descriptor[] = {
    0x05, 0x01,       // Usage Page (Generic Desktop)
    0x09, 0x02,       // Usage (Mouse)
    0xA1, 0x01,       // Collection (Application)
    0x09, 0x01,       //   Usage (Pointer)
    0xA1, 0x00,       //   Collection (Physical)
    0x05, 0x09,       //     Usage Page (Buttons)
    0x19, 0x01,       //     Usage Minimum (Button 1)
    0x29, 0x02,       //     Usage Maximum (Button 2)
    0x15, 0x00,       //     Logical Minimum (0)
    0x25, 0x01,       //     Logical Maximum (1)
    0x95, 0x02,       //     Report Count (2)
    0x75, 0x01,       //     Report Size (1)
    0x81, 0x02,       //     Input (Data,Var,Abs)
    0x95, 0x01,       //     Report Count (1)
    0x75, 0x06,       //     Report Size (6)  -- padding to byte
    0x81, 0x03,       //     Input (Const,Var,Abs)
    0x05, 0x01,       //     Usage Page (Generic Desktop)
    0x09, 0x30,       //     Usage (X)
    0x09, 0x31,       //     Usage (Y)
    0x15, 0x81,       //     Logical Minimum (-127)
    0x25, 0x7F,       //     Logical Maximum (127)
    0x75, 0x08,       //     Report Size (8)
    0x95, 0x02,       //     Report Count (2)
    0x81, 0x06,       //     Input (Data,Var,Rel)
    0xC0,             //   End Collection
    0xC0              // End Collection
};

static void addNum(CFMutableDictionaryRef dict, CFStringRef key, int value) {
    CFNumberRef num = CFNumberCreate(kCFAllocatorDefault, kCFNumberIntType, &value);
    CFDictionarySetValue(dict, key, num);
    CFRelease(num);
}

int main(void) {
    CFMutableDictionaryRef props = CFDictionaryCreateMutable(
        kCFAllocatorDefault, 0,
        &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);

    addNum(props, CFSTR(kIOHIDVendorIDKey), 0x1234);
    addNum(props, CFSTR(kIOHIDProductIDKey), 0x0001);
    CFDictionarySetValue(props, CFSTR(kIOHIDProductKey), CFSTR("CI Relative Mouse Probe"));

    CFDataRef descData = CFDataCreate(kCFAllocatorDefault, report_descriptor, sizeof(report_descriptor));
    CFDictionarySetValue(props, CFSTR(kIOHIDReportDescriptorKey), descData);

    IOHIDUserDeviceRef device = IOHIDUserDeviceCreate(kCFAllocatorDefault, props);
    CFRelease(descData);
    CFRelease(props);

    if (device == NULL) {
        fprintf(stderr, "FAIL: IOHIDUserDeviceCreate returned NULL "
                         "(likely blocked by TCC/Input Monitoring, entitlement, or AMFI policy)\n");
        return 1;
    }

    // Give the system a moment to register the device.
    usleep(200 * 1000);

    // Post one relative move report: buttons=0, dx=5, dy=-5
    uint8_t report[3] = { 0x00, 0x05, (uint8_t)(-5) };
    IOReturn ret = IOHIDUserDeviceHandleReport(device, report, sizeof(report));

    if (ret != kIOReturnSuccess) {
        fprintf(stderr, "FAIL: IOHIDUserDeviceHandleReport returned 0x%x\n", ret);
        CFRelease(device);
        return 1;
    }

    printf("PASS: created relative-mouse IOHIDUserDevice and posted a report successfully\n");
    CFRelease(device);
    return 0;
}
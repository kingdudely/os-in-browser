#include <cstdio>
#include <cstdint>
#include <CoreFoundation/CoreFoundation.h>
#include <IOKit/hid/IOHIDManager.h>

typedef struct __IOHIDUserDevice *IOHIDUserDeviceRef;
extern "C" {
    IOHIDUserDeviceRef IOHIDUserDeviceCreate(CFAllocatorRef, CFDictionaryRef);
    IOReturn IOHIDUserDeviceHandleReport(IOHIDUserDeviceRef, uint8_t *, CFIndex);
    void IOHIDUserDeviceScheduleWithRunLoop(IOHIDUserDeviceRef, CFRunLoopRef, CFStringRef);
}

static const uint8_t kMouseDescriptor[] = {
    0x05, 0x01, 0x09, 0x02, 0xa1, 0x01,
    0x09, 0x01, 0xa1, 0x00, 0x05, 0x09,
    0x19, 0x01, 0x29, 0x03, 0x15, 0x00,
    0x25, 0x01, 0x95, 0x03, 0x75, 0x01,
    0x81, 0x02, 0x95, 0x01, 0x75, 0x05,
    0x81, 0x01, 0x05, 0x01, 0x09, 0x30,
    0x09, 0x31, 0x15, 0x81, 0x25, 0x7f,
    0x75, 0x08, 0x95, 0x02, 0x81, 0x06,
    0xc0, 0xc0
};

int main() {
    CFDataRef desc = CFDataCreate(kCFAllocatorDefault, kMouseDescriptor, sizeof(kMouseDescriptor));

    int16_t vid = 0x05AC, pid = 0x0256;
    CFNumberRef vidNum = CFNumberCreate(kCFAllocatorDefault, kCFNumberSInt16Type, &vid);
    CFNumberRef pidNum = CFNumberCreate(kCFAllocatorDefault, kCFNumberSInt16Type, &pid);

    const void *keys[] = {
        CFSTR(kIOHIDReportDescriptorKey),
        CFSTR(kIOHIDVendorIDKey),
        CFSTR(kIOHIDProductIDKey),
        CFSTR(kIOHIDProductKey),
    };
    const void *vals[] = { desc, vidNum, pidNum, CFSTR("Virtual Mouse") };

    CFDictionaryRef props = CFDictionaryCreate(
        kCFAllocatorDefault, keys, vals, 4,
        &kCFTypeDictionaryKeyCallBacks,
        &kCFTypeDictionaryValueCallBacks
    );

    IOHIDUserDeviceRef device = IOHIDUserDeviceCreate(kCFAllocatorDefault, props);

    CFRelease(props);
    CFRelease(desc);
    CFRelease(vidNum);
    CFRelease(pidNum);

    if (!device) {
        printf("Failed to create device (missing entitlement or SIP enabled)\n");
        return 1;
    }

    IOHIDUserDeviceScheduleWithRunLoop(device, CFRunLoopGetMain(), kCFRunLoopDefaultMode);

    uint8_t report[] = { 0b00000001, 10, 0 };
    IOReturn result = IOHIDUserDeviceHandleReport(device, report, sizeof(report));
    printf(result == kIOReturnSuccess ? "Report sent.\n" : "Failed: 0x%08x\n", result);

    CFRelease(device);
    return 0;
}
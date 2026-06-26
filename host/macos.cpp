#include <cstdio>
#include <cstdint>
#include <vector>
#include <functional>

#include <CoreFoundation/CoreFoundation.h>
#include <IOKit/hid/IOHIDManager.h>
// #include <IOKit/hid/IOHIDUserDevice.h>

typedef struct __IOHIDUserDevice *IOHIDUserDeviceRef;
extern "C" {
    IOHIDUserDeviceRef IOHIDUserDeviceCreate(CFAllocatorRef, CFDictionaryRef);
    IOReturn           IOHIDUserDeviceHandleReport(IOHIDUserDeviceRef, uint8_t *, CFIndex);
    void               IOHIDUserDeviceScheduleWithRunLoop(IOHIDUserDeviceRef, CFRunLoopRef, CFStringRef);
}

class VirtualHIDDevice {
public:
    VirtualHIDDevice(
        uint16_t vendorID,
        uint16_t productID,
        const char *name,
        const uint8_t *descriptor,
        size_t descriptorLen
    ) : _vendorID(vendorID), _productID(productID), _device(nullptr) {

        CFDataRef descData = CFDataCreate(kCFAllocatorDefault, descriptor, descriptorLen);

        CFStringRef keys[] = {
            CFStringCreateWithCString(kCFAllocatorDefault, kIOHIDReportDescriptorKey, kCFStringEncodingUTF8),
            CFStringCreateWithCString(kCFAllocatorDefault, kIOHIDVendorIDKey,         kCFStringEncodingUTF8),
            CFStringCreateWithCString(kCFAllocatorDefault, kIOHIDProductIDKey,        kCFStringEncodingUTF8),
            CFStringCreateWithCString(kCFAllocatorDefault, kIOHIDProductKey,          kCFStringEncodingUTF8),
        };

        CFNumberRef vendorNum  = CFNumberCreate(kCFAllocatorDefault, kCFNumberSInt16Type, &vendorID);
        CFNumberRef productNum = CFNumberCreate(kCFAllocatorDefault, kCFNumberSInt16Type, &productID);
        CFStringRef nameStr    = CFStringCreateWithCString(kCFAllocatorDefault, name, kCFStringEncodingUTF8);

        CFTypeRef values[] = { descData, vendorNum, productNum, nameStr };

        CFDictionaryRef props = CFDictionaryCreate(
            kCFAllocatorDefault,
            (const void **)keys, (const void **)values, 4,
            &kCFTypeDictionaryKeyCallBacks,
            &kCFTypeDictionaryValueCallBacks
        );

        _device = IOHIDUserDeviceCreate(kCFAllocatorDefault, props);

        CFRelease(props);
        CFRelease(descData);
        CFRelease(vendorNum);
        CFRelease(productNum);
        CFRelease(nameStr);
        for (auto &k : keys) CFRelease(k);

        IOHIDUserDeviceScheduleWithRunLoop(_device, CFRunLoopGetMain(), kCFRunLoopDefaultMode);

        // Block until kernel has registered the device
        dispatch_semaphore_t sem = dispatch_semaphore_create(0);

        IOHIDManagerRef manager = IOHIDManagerCreate(kCFAllocatorDefault, kIOHIDOptionsTypeNone);

        CFStringRef matchKeys[] = {
            CFStringCreateWithCString(kCFAllocatorDefault, kIOHIDVendorIDKey,  kCFStringEncodingUTF8),
            CFStringCreateWithCString(kCFAllocatorDefault, kIOHIDProductIDKey, kCFStringEncodingUTF8),
        };
        CFNumberRef matchVendor  = CFNumberCreate(kCFAllocatorDefault, kCFNumberSInt16Type, &vendorID);
        CFNumberRef matchProduct = CFNumberCreate(kCFAllocatorDefault, kCFNumberSInt16Type, &productID);
        CFTypeRef   matchValues[] = { matchVendor, matchProduct };

        CFDictionaryRef matching = CFDictionaryCreate(
            kCFAllocatorDefault,
            (const void **)matchKeys, (const void **)matchValues, 2,
            &kCFTypeDictionaryKeyCallBacks,
            &kCFTypeDictionaryValueCallBacks
        );

        IOHIDManagerSetDeviceMatching(manager, matching);
        IOHIDManagerScheduleWithRunLoop(manager, CFRunLoopGetMain(), kCFRunLoopDefaultMode);
        IOHIDManagerOpen(manager, kIOHIDOptionsTypeNone);

        IOHIDManagerRegisterDeviceMatchingCallback(manager, [](void *ctx, IOReturn, void *, IOHIDDeviceRef) {
            dispatch_semaphore_signal(*(dispatch_semaphore_t *)ctx);
        }, &sem);

        // Spin the run loop until the callback fires
        while (dispatch_semaphore_wait(sem, DISPATCH_TIME_NOW) != 0)
            CFRunLoopRunInMode(kCFRunLoopDefaultMode, 0.001, true);

        CFRelease(matching);
        CFRelease(matchVendor);
        CFRelease(matchProduct);
        for (auto &k : matchKeys) CFRelease(k);
        CFRelease(manager);
        dispatch_release(sem);
    }

    ~VirtualHIDDevice() {
        if (_device) CFRelease(_device);
    }

    // Non-copyable
    VirtualHIDDevice(const VirtualHIDDevice &) = delete;
    VirtualHIDDevice &operator=(const VirtualHIDDevice &) = delete;

    IOReturn sendReport(const std::vector<uint8_t> &report) {
        if (!_device) return kIOReturnNotOpen;
        // C API wants non-const; copy to satisfy it
        std::vector<uint8_t> copy = report;
        return IOHIDUserDeviceHandleReport(_device, copy.data(), copy.size());
    }

private:
    uint16_t          _vendorID;
    uint16_t          _productID;
    IOHIDUserDeviceRef _device;
};

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
    VirtualHIDDevice mouse(
        0x05AC, 0x0256,
        "Test Virtual Mouse",
        kMouseDescriptor, sizeof(kMouseDescriptor)
    );
    std::vector<uint8_t> report = { 0b00000001, 10, 0 };
    IOReturn result = mouse.sendReport(report);
    printf(result == kIOReturnSuccess ? "Report sent.\n" : "Failed: 0x%08x\n", result);

    return 0;
}
import IOKit.hid
import Foundation

class VirtualHIDDevice {
    private var device: IOHIDUserDevice?

    init?(
        _ vendorID: UInt16,
        _ productID: UInt16,
        _ name: String,
        _ descriptor: [UInt8]
    ) {
        let properties: [String: Any] = [
            kIOHIDReportDescriptorKey: Data(descriptor),
            kIOHIDVendorIDKey: vendorID,
            kIOHIDProductIDKey: productID,
            kIOHIDProductKey: name,
        ]
        guard let dev = IOHIDUserDeviceCreate(kCFAllocatorDefault, properties as CFDictionary) else {
            return nil
        }
        self.device = dev
    }

    func sendReport(_ report: [UInt8]) -> IOReturn {
        guard let device else { return kIOReturnNotOpen }
        var reportCopy = report
        return IOHIDUserDeviceHandleReport(device, &reportCopy, report.count)
    }
    // No deinit needed — ARC handles IOHIDUserDevice automatically
}

// Example: Standard Mouse Descriptor
let descriptor: [UInt8] = [
    0x05, 0x01,        // Usage Page (Generic Desktop)
    0x09, 0x02,        // Usage (Mouse)
    0xa1, 0x01,        // Collection (Application)
    0x09, 0x01,        //   Usage (Pointer)
    0xa1, 0x00,        //   Collection (Physical)
    0x05, 0x09,        //     Usage Page (Button)
    0x19, 0x01,        //     Usage Minimum (Button 1)
    0x29, 0x03,        //     Usage Maximum (Button 3)
    0x15, 0x00,        //     Logical Minimum (0)
    0x25, 0x01,        //     Logical Maximum (1)
    0x95, 0x03,        //     Report Count (3)
    0x75, 0x01,        //     Report Size (1)
    0x81, 0x02,        //     Input (Data,Var,Abs)
    0x95, 0x01,        //     Report Count (1)
    0x75, 0x05,        //     Report Size (5)
    0x81, 0x01,        //     Input (Cnst,Ary,Abs)
    0x05, 0x01,        //     Usage Page (Generic Desktop)
    0x09, 0x30,        //     Usage (X)
    0x09, 0x31,        //     Usage (Y)
    0x15, 0x81,        //     Logical Minimum (-127)
    0x25, 0x7f,        //     Logical Maximum (127)
    0x75, 0x08,        //     Report Size (8)
    0x95, 0x02,        //     Report Count (2)
    0x81, 0x06,        //     Input (Data,Var,Rel)
    0xc0,              //   End Collection
    0xc0               // End Collection
]

// Initialize the device (Requires DriverKit/SIP disabled)
let virtualMouse = VirtualHIDDevice(0x05AC, 0x0256, "Test Virtual Mouse", descriptor)

// Send a test report (Button 1 pressed, move X by 10)
let report: [UInt8] = [0b00000001, 10, 0]
let result = virtualMouse?.sendReport(report)

if result == kIOReturnSuccess {
    print("Report sent successfully.")
} else {
    print("Failed to send report: \(result ?? 0)")
}

// Keep the main thread alive to allow IOKit to process the device
RunLoop.main.run()
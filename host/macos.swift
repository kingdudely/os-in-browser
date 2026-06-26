import IOKit.hid
import Foundation

class VirtualHIDDevice {
    private let device: IOHIDUserDevice?
    private let vendorID: UInt16
    private let productID: UInt16

    init(
        _ vendorID: UInt16,
        _ productID: UInt16,
        _ name: String,
        _ descriptor: [UInt8]
    ) {
        self.vendorID = vendorID
        self.productID = productID
        self.device = IOHIDUserDeviceCreate(kCFAllocatorDefault, [
            kIOHIDReportDescriptorKey: Data(descriptor),
            kIOHIDVendorIDKey: vendorID,
            kIOHIDProductIDKey: productID,
            kIOHIDProductKey: name,
        ] as CFDictionary)
    }

    var loaded: Void {
        get async {
            guard let device else { return }
            IOHIDUserDeviceScheduleWithRunLoop(device, CFRunLoopGetMain(), CFRunLoopMode.defaultMode.rawValue)
            await withCheckedContinuation { continuation in
                let manager = IOHIDManagerCreate(kCFAllocatorDefault, IOOptionBits(kIOHIDOptionsTypeNone))
                IOHIDManagerSetDeviceMatching(manager, [
                    kIOHIDVendorIDKey as CFString: vendorID,
                    kIOHIDProductIDKey as CFString: productID,
                ] as CFDictionary)
                IOHIDManagerScheduleWithRunLoop(manager, CFRunLoopGetMain(), CFRunLoopMode.defaultMode.rawValue)
                IOHIDManagerOpen(manager, IOOptionBits(kIOHIDOptionsTypeNone))
                IOHIDManagerRegisterDeviceMatchingCallback(manager, { _, _, _, _ in
                    continuation.resume()
                }, nil)
            }
        }
    }

    func sendReport(_ report: [UInt8]) -> IOReturn {
        guard let device else { return kIOReturnNotOpen }
        var copy = report
        return IOHIDUserDeviceHandleReport(device, &copy, copy.count)
    }
}

// Standard relative mouse HID descriptor
let descriptor: [UInt8] = [
    0x05, 0x01, 0x09, 0x02, 0xa1, 0x01,
    0x09, 0x01, 0xa1, 0x00, 0x05, 0x09,
    0x19, 0x01, 0x29, 0x03, 0x15, 0x00,
    0x25, 0x01, 0x95, 0x03, 0x75, 0x01,
    0x81, 0x02, 0x95, 0x01, 0x75, 0x05,
    0x81, 0x01, 0x05, 0x01, 0x09, 0x30,
    0x09, 0x31, 0x15, 0x81, 0x25, 0x7f,
    0x75, 0x08, 0x95, 0x02, 0x81, 0x06,
    0xc0, 0xc0
]

Task {
    let mouse = VirtualHIDDevice(0x05AC, 0x0256, "Test Virtual Mouse", descriptor)
    await mouse.loaded

    switch mouse.sendReport([0b00000001, 10, 0]) {
    case kIOReturnSuccess: print("Report sent successfully.")
    case let e: print("Failed: \(e)")
    }
}

RunLoop.main.run()
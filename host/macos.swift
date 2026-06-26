import IOKit.hid
import Foundation

class VirtualHIDDevice {
	private var device: IOHIDUserDeviceRef?

	init(
		_ vendorID: UInt16,
		_ productID: UInt16,
		_ name: String,
		_ descriptor: [UInt8]
	) {
		let descriptorData = Data(descriptor)
		let properties: [String: Any] = [
			kIOHIDReportDescriptorKey: descriptorData,
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

	deinit {
		if let device {
			CFRelease(device)
		}
	}
}
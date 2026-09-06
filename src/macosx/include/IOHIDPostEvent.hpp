#pragma once

#include <IOKit/hidsystem/IOLLEvent.h>
#include <mach/mach_types.h>

extern "C" {
	kern_return_t IOHIDPostEvent(io_connect_t connect, UInt32 eventType, IOGPoint location, const NXEventData *eventData, UInt32 eventDataVersion, IOOptionBits eventFlags, IOOptionBits options);
}
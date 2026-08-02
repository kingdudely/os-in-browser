/*
 * @APPLE_LICENSE_HEADER_START@
 *
 * Copyright (c) 1999-2003 Apple Computer, Inc. All Rights Reserved.
 *
 * This file contains Original Code and/or Modifications of Original Code
 * as defined in and that are subject to the Apple Public Source License
 * Version 2.0 (the 'License'). You may not use this file except in
 * compliance with the License. Please obtain a copy of the License at
 * http://www.opensource.apple.com/apsl/ and read it before using this
 * file.
 *
 * The Original Code and all software distributed under the License are
 * distributed on an 'AS IS' basis, WITHOUT WARRANTY OF ANY KIND, EITHER
 * EXPRESS OR IMPLIED, AND APPLE HEREBY DISCLAIMS ALL SUCH WARRANTIES,
 * INCLUDING WITHOUT LIMITATION, ANY WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE, QUIET ENJOYMENT OR NON-INFRINGEMENT.
 * Please see the License for the specific language governing rights and
 * limitations under the License.
 *
 * @APPLE_LICENSE_HEADER_END@
 */
#ifndef _IOKIT_HID_IOHIDUSERDEVICE_USER_H
#define _IOKIT_HID_IOHIDUSERDEVICE_USER_H

#include <CoreFoundation/CoreFoundation.h>
#include <IOKit/IOKitLib.h>
#include <IOKit/hid/IOHIDKeys.h>

__BEGIN_DECLS

typedef struct __IOHIDUserDevice * IOHIDUserDeviceRef;

typedef IOReturn (*IOHIDUserDeviceReportCallback)(void * refcon, IOHIDReportType type, uint32_t reportID, uint8_t * report, CFIndex reportLength);
typedef IOReturn (*IOHIDUserDeviceHandleReportAsyncCallback)(void * refcon, IOReturn result);

CF_EXPORT
CFTypeID IOHIDUserDeviceGetTypeID(void);

CF_EXPORT
IOHIDUserDeviceRef IOHIDUserDeviceCreate(CFAllocatorRef allocator, CFDictionaryRef properties);

CF_EXPORT
void IOHIDUserDeviceScheduleWithRunLoop(IOHIDUserDeviceRef device, CFRunLoopRef runLoop, CFStringRef runLoopMode);

CF_EXPORT
void IOHIDUserDeviceUnscheduleFromRunLoop(IOHIDUserDeviceRef device, CFRunLoopRef runLoop, CFStringRef runLoopMode);

CF_EXPORT
void IOHIDUserDeviceRegisterGetReportCallback(IOHIDUserDeviceRef device, IOHIDUserDeviceReportCallback callback, void * refcon);

CF_EXPORT
void IOHIDUserDeviceRegisterSetReportCallback(IOHIDUserDeviceRef device, IOHIDUserDeviceReportCallback callback, void * refcon);

CF_EXPORT
IOReturn IOHIDUserDeviceHandleReport(IOHIDUserDeviceRef device, uint8_t * report, CFIndex reportLength);

CF_EXPORT
IOReturn IOHIDUserDeviceHandleReportAsync(IOHIDUserDeviceRef device, uint8_t *report, CFIndex reportLength, IOHIDUserDeviceHandleReportAsyncCallback callback, void * refcon);

__END_DECLS

#endif /* _IOKIT_HID_IOHIDUSERDEVICE_USER_H */
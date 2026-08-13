// CGVirtualDisplay.mm
//
// Private CoreGraphics API bridging interfaces for creating virtual
// displays on macOS. Apple does not ship public headers for these
// classes, so they are declared here (reconstructed via class-dump
// against the CoreGraphics binary). This is the same pattern used by
// Chromium (ui/display/mac/test/virtual_display_mac_util.mm),
// FreeDisplay, oldmac-display, and similar open-source projects.
//
// Requires ARC.
// Available on macOS 10.14+ (reliable from macOS 11+).

#pragma once

#import <Foundation/Foundation.h>
#import <CoreGraphics/CoreGraphics.h>

#if !defined(__has_feature) || !__has_feature(objc_arc)
#error "This file requires ARC support."
#endif

NS_ASSUME_NONNULL_BEGIN

// A single supported mode (resolution + refresh rate) for the virtual display.
@interface CGVirtualDisplayMode : NSObject

@property(readonly, nonatomic) unsigned int width;
@property(readonly, nonatomic) unsigned int height;
@property(readonly, nonatomic) double refreshRate;

- (instancetype)initWithWidth:(unsigned int)width
                        height:(unsigned int)height
                  refreshRate:(double)refreshRate;

@end

// Settings applied to a CGVirtualDisplay after creation (modes + HiDPI flag).
@interface CGVirtualDisplaySettings : NSObject

@property(strong, nonatomic) NSArray<CGVirtualDisplayMode *> *modes;
@property(nonatomic) unsigned int hiDPI;

- (instancetype)init;

@end

// Descriptor used to configure a CGVirtualDisplay at creation time
// (identity, physical size, color primaries, dispatch queue, etc).
@interface CGVirtualDisplayDescriptor : NSObject

@property(nonatomic) unsigned int vendorID;
@property(nonatomic) unsigned int productID;
@property(nonatomic) unsigned int serialNum;
@property(strong, nonatomic) NSString *name;
@property(nonatomic) CGSize sizeInMillimeters;
@property(nonatomic) unsigned int maxPixelsWide;
@property(nonatomic) unsigned int maxPixelsHigh;
@property(nonatomic) CGPoint redPrimary;
@property(nonatomic) CGPoint greenPrimary;
@property(nonatomic) CGPoint bluePrimary;
@property(nonatomic) CGPoint whitePoint;
@property(strong, nonatomic) dispatch_queue_t queue;
@property(copy, nonatomic, nullable) void (^terminationHandler)(id _Nullable, CGDirectDisplayID);

- (instancetype)init;

@end

// The virtual display itself.
@interface CGVirtualDisplay : NSObject

@property(readonly, nonatomic) unsigned int vendorID;
@property(readonly, nonatomic) unsigned int productID;
@property(readonly, nonatomic) unsigned int serialNum;
@property(readonly, nonatomic) NSString *name;
@property(readonly, nonatomic) CGSize sizeInMillimeters;
@property(readonly, nonatomic) unsigned int maxPixelsWide;
@property(readonly, nonatomic) unsigned int maxPixelsHigh;
@property(readonly, nonatomic) CGPoint redPrimary;
@property(readonly, nonatomic) CGPoint greenPrimary;
@property(readonly, nonatomic) CGPoint bluePrimary;
@property(readonly, nonatomic) CGPoint whitePoint;
@property(readonly, nonatomic) dispatch_queue_t queue;
@property(readonly, nonatomic, nullable) id terminationHandler;
@property(readonly, nonatomic) CGDirectDisplayID displayID;
@property(readonly, nonatomic) unsigned int hiDPI;
@property(readonly, nonatomic) NSArray<CGVirtualDisplayMode *> *modes;

- (instancetype)initWithDescriptor:(CGVirtualDisplayDescriptor *)descriptor;
- (BOOL)applySettings:(CGVirtualDisplaySettings *)settings;

@end

NS_ASSUME_NONNULL_END

/*
 * ---------------------------------------------------------------------
 * Example usage:
 * ---------------------------------------------------------------------
 *
 * CGVirtualDisplayDescriptor *descriptor = [[CGVirtualDisplayDescriptor alloc] init];
 * descriptor.name  = @"My Virtual Display";
 * descriptor.queue = dispatch_get_main_queue();
 *
 * // See System Settings > Displays > Color > Open Profile for reference values.
 * descriptor.whitePoint  = CGPointMake(0.3125, 0.3291);
 * descriptor.redPrimary  = CGPointMake(0.6797, 0.3203);
 * descriptor.greenPrimary = CGPointMake(0.2559, 0.6983);
 * descriptor.bluePrimary  = CGPointMake(0.1494, 0.0557);
 *
 * int width = 1920, height = 1080, ppi = 109;
 * descriptor.maxPixelsWide = width;
 * descriptor.maxPixelsHigh = height;
 * descriptor.sizeInMillimeters = CGSizeMake(25.4 * width / ppi, 25.4 * height / ppi);
 *
 * descriptor.serialNum = 0;
 * descriptor.productID = 0;
 * descriptor.vendorID  = 0;
 *
 * CGVirtualDisplay *display = [[CGVirtualDisplay alloc] initWithDescriptor:descriptor];
 *
 * CGVirtualDisplayMode *mode =
 *     [[CGVirtualDisplayMode alloc] initWithWidth:width height:height refreshRate:60];
 *
 * CGVirtualDisplaySettings *settings = [[CGVirtualDisplaySettings alloc] init];
 * settings.hiDPI = NO;
 * settings.modes = @[ mode ];
 *
 * if (![display applySettings:settings]) {
 *     NSLog(@"Failed to apply virtual display settings");
 * }
 *
 * // display.displayID now holds the CGDirectDisplayID you can use with
 * // the rest of CoreGraphics (CGDisplayBounds, CGDisplayCopyDisplayMode, etc).
 * ---------------------------------------------------------------------
 */
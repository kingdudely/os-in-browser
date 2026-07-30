import Foundation
import VideoToolbox
import CoreMedia
import CoreVideo

// Definitive hardware-vs-software check for H.264 VideoToolbox encode.
// Unlike inferring from ffmpeg speed, this reads VideoToolbox's own
// kVTCompressionPropertyKey_UsingHardwareAcceleratedVideoEncoder property.

let width: Int32 = 1920
let height: Int32 = 1080
let frameCount = 60
let fps: Int32 = 30

var session: VTCompressionSession?

// Force hardware encoder attempt explicitly rather than letting
// VideoToolbox silently choose — this is the same knob AVFoundation/
// ffmpeg use, but we can inspect the result directly here.
let encoderSpecification: [CFString: Any] = [
    kVTVideoEncoderSpecification_EnableHardwareAcceleratedVideoEncoder: true,
    kVTVideoEncoderSpecification_RequireHardwareAcceleratedVideoEncoder: false
]

let status = VTCompressionSessionCreate(
    allocator: kCFAllocatorDefault,
    width: width,
    height: height,
    codecType: kCMVideoCodecType_H264,
    encoderSpecification: encoderSpecification as CFDictionary,
    imageBufferAttributes: nil,
    compressedDataAllocator: nil,
    outputCallback: nil,
    refcon: nil,
    compressionSessionOut: &session
)

guard status == noErr, let compressionSession = session else {
    print("VTCompressionSessionCreate FAILED with status: \(status)")
    print("This means VideoToolbox could not create a session at all (hardware or software).")
    exit(1)
}

print("VTCompressionSessionCreate succeeded.")

// Query which encoder VideoToolbox actually picked.
var usingHardware: CFTypeRef?
let propStatus = VTSessionCopyProperty(
    compressionSession,
    key: kVTCompressionPropertyKey_UsingHardwareAcceleratedVideoEncoder,
    allocator: kCFAllocatorDefault,
    valueOut: &usingHardware
)

if propStatus == noErr, let value = usingHardware as? Bool {
    print("kVTCompressionPropertyKey_UsingHardwareAcceleratedVideoEncoder = \(value)")
    if value {
        print("RESULT: VideoToolbox IS using real hardware acceleration.")
    } else {
        print("RESULT: VideoToolbox created a session but is running SOFTWARE encode.")
    }
} else {
    print("Could not read UsingHardwareAcceleratedVideoEncoder property, status: \(propStatus)")
    print("(Property may be unsupported on this OS/encoder combination — treat as inconclusive.)")
}

// Also print the encoder's declared name/ID for extra context —
// some VideoToolbox software fallback paths still report a
// hardware-sounding encoder ID, so this is supplementary, not authoritative.
var encoderIDValue: CFTypeRef?
_ = VTSessionCopyProperty(
    compressionSession,
    key: kVTCompressionPropertyKey_EncoderID,
    allocator: kCFAllocatorDefault,
    valueOut: &encoderIDValue
)
if let encoderID = encoderIDValue as? String {
    print("Encoder ID: \(encoderID)")
}

// Now actually run real frames through it and time it, so we get a
// speed measurement alongside the authoritative hardware/software flag.
VTCompressionSessionPrepareToEncodeFrames(compressionSession)

var pixelBufferPool: CVPixelBufferPool?
let poolAttrs: [CFString: Any] = [
    kCVPixelBufferWidthKey: width,
    kCVPixelBufferHeightKey: height,
    kCVPixelBufferPixelFormatTypeKey: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange
]
CVPixelBufferPoolCreate(kCFAllocatorDefault, nil, poolAttrs as CFDictionary, &pixelBufferPool)

let startTime = Date()
var framesSubmitted = 0

for i in 0..<frameCount {
    var pixelBuffer: CVPixelBuffer?
    guard let pool = pixelBufferPool else { break }
    CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, pool, &pixelBuffer)
    guard let buffer = pixelBuffer else { continue }

    // Fill with a trivial pattern so it's not encoding pure garbage memory.
    CVPixelBufferLockBaseAddress(buffer, [])
    if let base = CVPixelBufferGetBaseAddress(buffer) {
        memset(base, Int32((i * 4) % 255), CVPixelBufferGetDataSize(buffer))
    }
    CVPixelBufferUnlockBaseAddress(buffer, [])

    let pts = CMTimeMake(value: Int64(i), timescale: fps)
    VTCompressionSessionEncodeFrame(
        compressionSession,
        imageBuffer: buffer,
        presentationTimeStamp: pts,
        duration: CMTimeMake(value: 1, timescale: fps),
        frameProperties: nil,
        sourceFrameRefcon: nil,
        infoFlagsOut: nil
    )
    framesSubmitted += 1
}

VTCompressionSessionCompleteFrames(compressionSession, untilPresentationTimeStamp: .invalid)
let elapsed = Date().timeIntervalSince(startTime)

print("---")
print("Frames submitted: \(framesSubmitted)")
print("Elapsed: \(String(format: "%.3f", elapsed))s")
print("Effective speed: \(String(format: "%.2f", Double(framesSubmitted) / Double(fps) / elapsed))x realtime")

VTCompressionSessionInvalidate(compressionSession)
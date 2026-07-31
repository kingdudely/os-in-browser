import Foundation
import VideoToolbox
import CoreMedia
import CoreVideo

// Accurate hardware-vs-software check + REAL throughput benchmark.
// Uses a proper output callback so timing reflects actual completed
// encodes, not just frame submission (the bug in the previous version
// that produced a bogus 382x number).

let width: Int32 = 1920
let height: Int32 = 1080
let frameCount = 150   // match ffmpeg test: 150 frames @ 30fps = 5s of content
let fps: Int32 = 30

final class EncodeCounter {
    var framesCompleted = 0
    var totalBytes = 0
    let semaphore = DispatchSemaphore(value: 0)
    let targetCount: Int

    init(targetCount: Int) {
        self.targetCount = targetCount
    }

    func recordFrame(dataSize: Int) {
        framesCompleted += 1
        totalBytes += dataSize
        if framesCompleted >= targetCount {
            semaphore.signal()
        }
    }
}

let counter = EncodeCounter(targetCount: frameCount)
let counterPtr = Unmanaged.passRetained(counter).toOpaque()

let outputCallback: VTCompressionOutputCallback = { refcon, sourceFrameRefcon, status, infoFlags, sampleBuffer in
    guard let refcon = refcon else { return }
    let counter = Unmanaged<EncodeCounter>.fromOpaque(refcon).takeUnretainedValue()

    var size = 0
    if status == noErr, let sbuf = sampleBuffer {
        size = CMSampleBufferGetTotalSampleSize(sbuf)
    }
    counter.recordFrame(dataSize: size)
}

var session: VTCompressionSession?
let encoderSpecification: [CFString: Any] = [
    kVTVideoEncoderSpecification_EnableHardwareAcceleratedVideoEncoder: true,
    kVTVideoEncoderSpecification_RequireHardwareAcceleratedVideoEncoder: true
]

let status = VTCompressionSessionCreate(
    allocator: kCFAllocatorDefault,
    width: width,
    height: height,
    codecType: kCMVideoCodecType_H264,
    encoderSpecification: encoderSpecification as CFDictionary,
    imageBufferAttributes: nil,
    compressedDataAllocator: nil,
    outputCallback: outputCallback,
    refcon: counterPtr,
    compressionSessionOut: &session
)

guard status == noErr, let compressionSession = session else {
    print("VTCompressionSessionCreate FAILED (hardware required), status: \(status)")
    print("RESULT: No real hardware encoder available in this environment.")
    exit(1)
}

print("VTCompressionSessionCreate (hardware-required) succeeded.")

var usingHardware: CFTypeRef?
let propStatus = VTSessionCopyProperty(
    compressionSession,
    key: kVTCompressionPropertyKey_UsingHardwareAcceleratedVideoEncoder,
    allocator: kCFAllocatorDefault,
    valueOut: &usingHardware
)
if propStatus == noErr, let value = usingHardware as? Bool {
    print("UsingHardwareAcceleratedVideoEncoder = \(value)")
}

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

// Set a realtime bitrate similar to the ffmpeg comparison (4 Mbps).
VTSessionSetProperty(compressionSession, key: kVTCompressionPropertyKey_AverageBitRate, value: 4_000_000 as CFTypeRef)
VTSessionSetProperty(compressionSession, key: kVTCompressionPropertyKey_RealTime, value: kCFBooleanTrue)

VTCompressionSessionPrepareToEncodeFrames(compressionSession)

var pixelBufferPool: CVPixelBufferPool?
let poolAttrs: [CFString: Any] = [
    kCVPixelBufferWidthKey: width,
    kCVPixelBufferHeightKey: height,
    kCVPixelBufferPixelFormatTypeKey: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange
]
CVPixelBufferPoolCreate(kCFAllocatorDefault, nil, poolAttrs as CFDictionary, &pixelBufferPool)

print("Encoding \(frameCount) frames at \(width)x\(height)...")
let startTime = Date()

for i in 0..<frameCount {
    var pixelBuffer: CVPixelBuffer?
    guard let pool = pixelBufferPool else { break }
    CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, pool, &pixelBuffer)
    guard let buffer = pixelBuffer else { continue }

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
}

VTCompressionSessionCompleteFrames(compressionSession, untilPresentationTimeStamp: .invalid)

// Wait for the callback to actually confirm all frames completed —
// this is the fix for the previous bogus 382x number.
let waitResult = counter.semaphore.wait(timeout: .now() + 30)
let elapsed = Date().timeIntervalSince(startTime)

if waitResult == .timedOut {
    print("WARNING: timed out waiting for all frames to complete.")
}

print("---")
print("Frames completed: \(counter.framesCompleted)/\(frameCount)")
print("Total encoded bytes: \(counter.totalBytes)")
print("Elapsed: \(String(format: "%.3f", elapsed))s")
let contentSeconds = Double(frameCount) / Double(fps)
print("Content duration: \(String(format: "%.2f", contentSeconds))s")
print("REAL effective speed: \(String(format: "%.2f", contentSeconds / elapsed))x realtime")

VTCompressionSessionInvalidate(compressionSession)
Unmanaged<EncodeCounter>.fromOpaque(counterPtr).release()
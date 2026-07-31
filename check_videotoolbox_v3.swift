import Foundation
import VideoToolbox
import CoreMedia
import CoreVideo

// v3: applies the full set of low-latency-oriented VideoToolbox properties
// on top of v2's callback-based accurate timing, to see whether proper
// tuning closes the gap with x264 ultrafast (or beats it).

let width: Int32 = 1920
let height: Int32 = 1080
let frameCount = 150
let fps: Int32 = 30

// Bitrate is now a CLI arg so we can sweep it: ./vt_bench 4000000
let bitrate: Int = CommandLine.arguments.count > 1 ? (Int(CommandLine.arguments[1]) ?? 4_000_000) : 4_000_000
print("Testing at bitrate: \(bitrate) bps")

final class EncodeCounter {
    var framesCompleted = 0
    var totalBytes = 0
    let semaphore = DispatchSemaphore(value: 0)
    let targetCount: Int
    init(targetCount: Int) { self.targetCount = targetCount }
    func recordFrame(dataSize: Int) {
        framesCompleted += 1
        totalBytes += dataSize
        if framesCompleted >= targetCount { semaphore.signal() }
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

// --- Encoder specification: require real hardware AND request low-latency mode ---
let encoderSpecification: [CFString: Any] = [
    kVTVideoEncoderSpecification_EnableHardwareAcceleratedVideoEncoder: true,
    kVTVideoEncoderSpecification_RequireHardwareAcceleratedVideoEncoder: true,
    kVTVideoEncoderSpecification_EnableLowLatencyRateControl: true
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

var vtSessionOpt: VTCompressionSession? = session

if status != noErr || vtSessionOpt == nil {
    print("VTCompressionSessionCreate FAILED (hardware + low-latency required), status: \(status)")
    print("Retrying without EnableLowLatencyRateControl in case it's the incompatible property...")

    let fallbackSpec: [CFString: Any] = [
        kVTVideoEncoderSpecification_EnableHardwareAcceleratedVideoEncoder: true,
        kVTVideoEncoderSpecification_RequireHardwareAcceleratedVideoEncoder: true
    ]
    var fallbackSession: VTCompressionSession?
    let fallbackStatus = VTCompressionSessionCreate(
        allocator: kCFAllocatorDefault, width: width, height: height,
        codecType: kCMVideoCodecType_H264,
        encoderSpecification: fallbackSpec as CFDictionary,
        imageBufferAttributes: nil, compressedDataAllocator: nil,
        outputCallback: outputCallback, refcon: counterPtr,
        compressionSessionOut: &fallbackSession
    )
    if fallbackStatus != noErr || fallbackSession == nil {
        print("Fallback also failed, status: \(fallbackStatus). No hardware encoder available.")
        exit(1)
    }
    print("Fallback session (hardware, no explicit low-latency spec) succeeded.")
    vtSessionOpt = fallbackSession
}

guard let vtSession = vtSessionOpt else {
    print("No session available after all attempts.")
    exit(1)
}

print("VTCompressionSessionCreate succeeded.")

var usingHardware: CFTypeRef?
_ = VTSessionCopyProperty(vtSession, key: kVTCompressionPropertyKey_UsingHardwareAcceleratedVideoEncoder, allocator: kCFAllocatorDefault, valueOut: &usingHardware)
if let value = usingHardware as? Bool {
    print("UsingHardwareAcceleratedVideoEncoder = \(value)")
}

var encoderIDValue: CFTypeRef?
_ = VTSessionCopyProperty(vtSession, key: kVTCompressionPropertyKey_EncoderID, allocator: kCFAllocatorDefault, valueOut: &encoderIDValue)
if let encoderID = encoderIDValue as? String {
    print("Encoder ID: \(encoderID)")
}

// --- Apply every low-latency-relevant property, logging pass/fail for each ---
// so a rejected property doesn't silently no-op.
func setProp(_ key: CFString, _ value: CFTypeRef, _ label: String) {
    let s = VTSessionSetProperty(vtSession, key: key, value: value)
    print("  set \(label): \(s == noErr ? "OK" : "FAILED (status \(s))")")
}

print("--- Applying tuning properties ---")
setProp(kVTCompressionPropertyKey_RealTime, kCFBooleanTrue, "RealTime=true")
setProp(kVTCompressionPropertyKey_AllowFrameReordering, kCFBooleanFalse, "AllowFrameReordering=false")
setProp(kVTCompressionPropertyKey_AverageBitRate, bitrate as CFTypeRef, "AverageBitRate=\(bitrate)")
setProp(kVTCompressionPropertyKey_ExpectedFrameRate, Int(fps) as CFTypeRef, "ExpectedFrameRate=\(fps)")
setProp(kVTCompressionPropertyKey_MaxKeyFrameInterval, Int(fps * 60) as CFTypeRef, "MaxKeyFrameInterval=\(fps*60)")
setProp(kVTCompressionPropertyKey_MaxKeyFrameIntervalDuration, 60.0 as CFTypeRef, "MaxKeyFrameIntervalDuration=60s")
setProp(kVTCompressionPropertyKey_H264EntropyMode, kVTH264EntropyMode_CABAC, "H264EntropyMode=CABAC")
setProp(kVTCompressionPropertyKey_ProfileLevel, kVTProfileLevel_H264_Baseline_AutoLevel, "ProfileLevel=Baseline_AutoLevel")

// DataRateLimits: [bytesPerSecond, 1 second window]
let byteLimit = (Double(bitrate) / 8.0) as CFNumber
let secLimit = 1.0 as CFNumber
setProp(kVTCompressionPropertyKey_DataRateLimits, [byteLimit, secLimit] as CFArray, "DataRateLimits")

VTCompressionSessionPrepareToEncodeFrames(vtSession)

var pixelBufferPool: CVPixelBufferPool?
let poolAttrs: [CFString: Any] = [
    kCVPixelBufferWidthKey: width,
    kCVPixelBufferHeightKey: height,
    kCVPixelBufferPixelFormatTypeKey: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange
]
CVPixelBufferPoolCreate(kCFAllocatorDefault, nil, poolAttrs as CFDictionary, &pixelBufferPool)

print("Encoding \(frameCount) frames at \(width)x\(height) with tuned properties...")
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
        vtSession, imageBuffer: buffer, presentationTimeStamp: pts,
        duration: CMTimeMake(value: 1, timescale: fps),
        frameProperties: nil, sourceFrameRefcon: nil, infoFlagsOut: nil
    )
}

VTCompressionSessionCompleteFrames(vtSession, untilPresentationTimeStamp: .invalid)
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

VTCompressionSessionInvalidate(vtSession)
Unmanaged<EncodeCounter>.fromOpaque(counterPtr).release()
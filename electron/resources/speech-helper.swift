// Dictation, and meeting notes, done natively.
//
// The browser speech APIs need a network round trip; this helper uses the
// macOS recognizer, on device when the machine supports it. It exists as
// a separate binary spawned from the Electron MAIN process for one
// reason: the microphone and speech permission prompts attribute to
// whichever app owns the process, and that has to say Bloks.
//
// Two modes. Dictation (no arguments) is one utterance for the composer.
// The contract with electron/speech.mjs, one JSON object per line:
//
//   {"partial":true,"text":"…"}   recognition in progress
//   {"partial":false,"text":"…"}  the finished transcript; exits 0
//   {"level":0.0-1.0}             loudness right now, for the meter
//   {"error":"…"}                 something failed; exits 1
//
// Meeting (--meeting, optionally --system) runs until it is told to stop
// and writes what was said as it goes, a segment at each pause:
//
//   {"partial":true,"who":"you","text":"…"}   the sentence in progress
//   {"segment":"…","who":"you"|"them"}         a finished stretch of speech
//   {"level":0.0-1.0}                          the microphone's loudness
//   {"notice":"…"}                             something worth knowing
//
// "you" is the microphone. "them" is the sound the Mac itself is playing,
// which is the other side of a Zoom or Meet call; it needs macOS 13 and
// Screen Recording permission, and without either the meeting carries on
// with the microphone alone. Nothing is recorded to disk and nothing is
// sent anywhere: recognition is on device where the Mac supports it.
import AVFoundation
import CoreMedia
import Foundation
import Speech

#if canImport(ScreenCaptureKit)
  import ScreenCaptureKit
#endif

func writeLine(_ payload: [String: Any]) {
  guard let data = try? JSONSerialization.data(withJSONObject: payload),
    let line = String(data: data, encoding: .utf8)
  else { return }
  print(line)
  // stdout to a pipe is block buffered; a partial that sits in the buffer
  // is a transcript the user cannot see growing
  fflush(stdout)
}

func die(_ reason: String) -> Never {
  writeLine(["error": reason])
  exit(1)
}

/// Loudness of a buffer, lifted into a usable 0...1 range.
func level(of buffer: AVAudioPCMBuffer) -> Double? {
  guard let channel = buffer.floatChannelData?[0] else { return nil }
  let count = Int(buffer.frameLength)
  guard count > 0 else { return nil }
  var sum: Float = 0
  for i in 0..<count { sum += channel[i] * channel[i] }
  return min(1.0, Double((sum / Float(count)).squareRoot()) * 12)
}

// ── dictation ─────────────────────────────────────────────────────────

func runDictation(_ recognizer: SFSpeechRecognizer) {
  let request = SFSpeechAudioBufferRecognitionRequest()
  request.shouldReportPartialResults = true
  // Prefer on-device: no audio leaves the machine, and it works offline.
  // Older hardware falls back to Apple's server recognizer.
  if recognizer.supportsOnDeviceRecognition {
    request.requiresOnDeviceRecognition = true
  }

  let engine = AVAudioEngine()
  let microphone = engine.inputNode
  // Loudness, about ten times a second. Without it a person talking into
  // a silent interface cannot tell the difference between "listening"
  // and "broken", which is the whole complaint a meter answers.
  var lastLevelAt = Date.distantPast
  microphone.installTap(
    onBus: 0, bufferSize: 1024, format: microphone.outputFormat(forBus: 0)
  ) { buffer, _ in
    request.append(buffer)
    let now = Date()
    if now.timeIntervalSince(lastLevelAt) >= 0.1, let loud = level(of: buffer) {
      lastLevelAt = now
      writeLine(["level": loud])
    }
  }

  do {
    engine.prepare()
    try engine.start()
  } catch {
    die("mic-failed")
  }

  recognizer.recognitionTask(with: request) { result, error in
    if let result {
      writeLine(["partial": !result.isFinal, "text": result.bestTranscription.formattedString])
      if result.isFinal { exit(0) }
    }
    if error != nil { die("recognition-error") }
  }
}

// ── meeting ───────────────────────────────────────────────────────────

/// One voice being transcribed: the microphone, or the Mac's own sound.
///
/// The recognizer takes a minute of audio per request at most, and a
/// transcript with no breaks is unreadable, so a request is closed and a
/// new one begun at every pause of a couple of seconds and at fifty
/// seconds regardless. Each closed request becomes one segment.
final class Voice {
  let who: String
  let recognizer: SFSpeechRecognizer
  private let lock = NSLock()
  private var request: SFSpeechAudioBufferRecognitionRequest?
  private var text = ""
  private var startedAt = Date()
  private var changedAt = Date()

  init(who: String, recognizer: SFSpeechRecognizer) {
    self.who = who
    self.recognizer = recognizer
  }

  func begin() {
    let next = SFSpeechAudioBufferRecognitionRequest()
    next.shouldReportPartialResults = true
    if recognizer.supportsOnDeviceRecognition { next.requiresOnDeviceRecognition = true }
    // Each request owns its own text: a closing request's final words
    // arrive after the next one has started, and must not be mixed in.
    final class Heard { var text = ""; var sent = false }
    let heard = Heard()
    let who = self.who
    let emit = {
      guard !heard.sent else { return }
      heard.sent = true
      let said = heard.text.trimmingCharacters(in: .whitespacesAndNewlines)
      if !said.isEmpty { writeLine(["segment": said, "who": who]) }
    }
    recognizer.recognitionTask(with: next) { [weak self] result, error in
      if let result {
        heard.text = result.bestTranscription.formattedString
        if let self, self.isCurrent(next) {
          self.noteChange(heard.text)
          writeLine(["partial": true, "who": who, "text": heard.text])
        }
        if result.isFinal { emit() }
      }
      if error != nil { emit() }
    }
    lock.lock()
    request = next
    text = ""
    startedAt = Date()
    changedAt = Date()
    lock.unlock()
  }

  private func isCurrent(_ candidate: SFSpeechAudioBufferRecognitionRequest) -> Bool {
    lock.lock()
    defer { lock.unlock() }
    return request === candidate
  }

  private func noteChange(_ now: String) {
    lock.lock()
    if now != text {
      text = now
      changedAt = Date()
    }
    lock.unlock()
  }

  func append(_ buffer: AVAudioPCMBuffer) {
    lock.lock()
    let current = request
    lock.unlock()
    current?.append(buffer)
  }

  /// Closes the current request at a pause, or when it is getting long.
  func rotateIfDue() {
    lock.lock()
    let now = Date()
    let paused = !text.isEmpty && now.timeIntervalSince(changedAt) > 2.0
    let long = now.timeIntervalSince(startedAt) > 50
    let closing = (paused || long) ? request : nil
    lock.unlock()
    guard let closing else { return }
    closing.endAudio()
    begin()
  }

  func finish() {
    lock.lock()
    let closing = request
    request = nil
    lock.unlock()
    closing?.endAudio()
  }
}

#if canImport(ScreenCaptureKit)
  /// The Mac's own sound, minus Bloks itself, through ScreenCaptureKit.
  @available(macOS 13.0, *)
  final class SystemSound: NSObject, SCStreamOutput, SCStreamDelegate {
    private var stream: SCStream?
    private let onBuffer: (AVAudioPCMBuffer) -> Void

    init(onBuffer: @escaping (AVAudioPCMBuffer) -> Void) {
      self.onBuffer = onBuffer
    }

    func start() async throws {
      let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
      guard let display = content.displays.first else { throw NSError(domain: "bloks", code: 1) }
      let filter = SCContentFilter(display: display, excludingApplications: [], exceptingWindows: [])
      let config = SCStreamConfiguration()
      config.capturesAudio = true
      config.excludesCurrentProcessAudio = true
      config.sampleRate = 48_000
      config.channelCount = 1
      // the picture is not wanted; the smallest one the API accepts
      config.width = 2
      config.height = 2
      config.minimumFrameInterval = CMTime(value: 1, timescale: 1)
      let stream = SCStream(filter: filter, configuration: config, delegate: self)
      try stream.addStreamOutput(self, type: .audio, sampleHandlerQueue: DispatchQueue(label: "bloks.system-sound"))
      try await stream.startCapture()
      self.stream = stream
    }

    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
      guard type == .audio, let buffer = pcm(sampleBuffer) else { return }
      onBuffer(buffer)
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
      writeLine(["notice": "system-sound-stopped"])
    }

    private func pcm(_ sample: CMSampleBuffer) -> AVAudioPCMBuffer? {
      guard let description = CMSampleBufferGetFormatDescription(sample),
        let asbd = CMAudioFormatDescriptionGetStreamBasicDescription(description),
        let format = AVAudioFormat(streamDescription: asbd)
      else { return nil }
      let frames = AVAudioFrameCount(CMSampleBufferGetNumSamples(sample))
      guard frames > 0, let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames) else { return nil }
      buffer.frameLength = frames
      let status = CMSampleBufferCopyPCMDataIntoAudioBufferList(
        sample, at: 0, frameCount: Int32(frames), into: buffer.mutableAudioBufferList)
      return status == noErr ? buffer : nil
    }
  }
#endif

var keepAlive: [AnyObject] = []

func runMeeting(_ recognizer: SFSpeechRecognizer, system: Bool) {
  let you = Voice(who: "you", recognizer: recognizer)
  you.begin()

  let engine = AVAudioEngine()
  let microphone = engine.inputNode
  var lastLevelAt = Date.distantPast
  microphone.installTap(onBus: 0, bufferSize: 1024, format: microphone.outputFormat(forBus: 0)) { buffer, _ in
    you.append(buffer)
    let now = Date()
    if now.timeIntervalSince(lastLevelAt) >= 0.1, let loud = level(of: buffer) {
      lastLevelAt = now
      writeLine(["level": loud])
    }
  }
  do {
    engine.prepare()
    try engine.start()
  } catch {
    die("mic-failed")
  }

  var voices = [you]
  if system {
    #if canImport(ScreenCaptureKit)
      if #available(macOS 13.0, *) {
        let them = Voice(who: "them", recognizer: recognizer)
        them.begin()
        voices.append(them)
        let sound = SystemSound { buffer in them.append(buffer) }
        keepAlive.append(sound)
        Task {
          do {
            try await sound.start()
          } catch {
            writeLine(["notice": "system-sound-unavailable"])
          }
        }
      } else {
        writeLine(["notice": "system-sound-needs-macos-13"])
      }
    #else
      writeLine(["notice": "system-sound-needs-macos-13"])
    #endif
  }

  let tick = Timer(timeInterval: 0.5, repeats: true) { _ in
    for voice in voices { voice.rotateIfDue() }
  }
  RunLoop.main.add(tick, forMode: .common)

  // Told to stop: the last words are finished, then out.
  signal(SIGTERM, SIG_IGN)
  let stop = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
  stop.setEventHandler {
    engine.stop()
    for voice in voices { voice.finish() }
    DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { exit(0) }
  }
  stop.resume()
  keepAlive.append(stop as AnyObject)
  keepAlive.append(tick)
}

// ── start ─────────────────────────────────────────────────────────────

let arguments = CommandLine.arguments
let meeting = arguments.contains("--meeting")
let systemSound = arguments.contains("--system")

SFSpeechRecognizer.requestAuthorization { status in
  guard status == .authorized else { die("speech-not-authorized") }
  guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US")),
    recognizer.isAvailable
  else { die("recognizer-unavailable") }
  DispatchQueue.main.async {
    if meeting {
      runMeeting(recognizer, system: systemSound)
    } else {
      runDictation(recognizer)
    }
  }
}

RunLoop.main.run()

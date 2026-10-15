import Foundation
import UserNotifications
import AVFoundation

/// Sonnerie course/livraison côté iOS quand l’app est en fond / écran verrouillé.
/// Les Timer Dart sont suspendus : on programme des notifs locales + lecture AVAudio.
enum JobRingIOS {
  static let soundFile = "senga_job.caf"
  private static let prefix = "senga_job_ring_"
  private static var player: AVAudioPlayer?

  static func isJob(_ userInfo: [AnyHashable: Any]) -> Bool {
    let kind = stringValue(userInfo["jobKind"]) ?? stringValue(userInfo["type"]) ?? ""
    if kind.isEmpty { return false }
    if kind == "INCIDENT_CREATED" || kind == "SOS" || kind == "CHAT_MESSAGE" { return false }
    let upper = kind.uppercased()
    return upper.contains("RIDE")
      || upper.contains("DELIVERY")
      || upper.contains("OFFER")
      || upper.contains("JOB")
      || upper.contains("CALL")
      || upper.contains("MISSION")
  }

  static func handleRemote(userInfo: [AnyHashable: Any]) {
    guard isJob(userInfo) else { return }
    let title = stringValue(userInfo["title"]) ?? "SENGA Driver"
    let body = stringValue(userInfo["body"]) ?? "Nouvelle course ou livraison"
    schedulePulses(title: title, body: body)
    playBundleSound()
  }

  static func stop() {
    let center = UNUserNotificationCenter.current()
    let ids = (0..<5).map { "\(prefix)\($0)" }
    center.removePendingNotificationRequests(withIdentifiers: ids)
    center.removeDeliveredNotifications(withIdentifiers: ids)
    player?.stop()
    player = nil
  }

  private static func schedulePulses(title: String, body: String) {
    let center = UNUserNotificationCenter.current()
    let ids = (0..<6).map { "\(prefix)\($0)" }
    center.removePendingNotificationRequests(withIdentifiers: ids)

    for i in 0..<6 {
      let content = UNMutableNotificationContent()
      content.title = title
      content.body = body
      // Alternate SENGA custom + system default (custom alone was silent on many devices).
      if i % 2 == 0 {
        content.sound = UNNotificationSound(named: UNNotificationSoundName(soundFile))
      } else {
        content.sound = .default
      }
      content.threadIdentifier = "senga-driver-jobs"
      // i=0 quasi immédiat, puis toutes les ~7 s (survivent à la suspension).
      let delay = max(0.3, Double(i) * 7.0)
      let trigger = UNTimeIntervalNotificationTrigger(timeInterval: delay, repeats: false)
      let request = UNNotificationRequest(
        identifier: ids[i],
        content: content,
        trigger: trigger
      )
      center.add(request, withCompletionHandler: nil)
    }
  }

  private static func playBundleSound() {
    guard let url = Bundle.main.url(forResource: "senga_job", withExtension: "caf")
      ?? Bundle.main.url(forResource: "senga_job", withExtension: "wav")
    else { return }
    do {
      let session = AVAudioSession.sharedInstance()
      try session.setCategory(.playback, options: [.duckOthers, .mixWithOthers])
      try session.setActive(true)
      let p = try AVAudioPlayer(contentsOf: url)
      p.numberOfLoops = 2
      p.volume = 1.0
      p.play()
      player = p
    } catch {
      // Silent failure — APNs / local notif sound remains the primary path.
    }
  }

  private static func stringValue(_ raw: Any?) -> String? {
    if let s = raw as? String, !s.isEmpty { return s }
    if let n = raw as? NSNumber { return n.stringValue }
    return nil
  }
}

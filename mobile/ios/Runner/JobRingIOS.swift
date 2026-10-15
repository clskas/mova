import Foundation
import UserNotifications
import AVFoundation

/// Sonnerie course/livraison côté iOS quand l’app est en fond / écran verrouillé.
/// Pas de pulses locales répétées : elles continuaient après annulation passager.
enum JobRingIOS {
  static let soundFile = "senga_job.caf"
  private static let prefix = "senga_job_ring_"
  private static var player: AVAudioPlayer?

  static func isJob(_ userInfo: [AnyHashable: Any]) -> Bool {
    let kind = stringValue(userInfo["jobKind"]) ?? stringValue(userInfo["type"]) ?? ""
    if kind.isEmpty { return false }
    if kind == "INCIDENT_CREATED" || kind == "SOS" || kind == "CHAT_MESSAGE" { return false }
    let upper = kind.uppercased()
    // Arrêt si annulation / fin.
    if upper.contains("CANCEL") || upper.contains("COMPLETED") || upper.contains("TAKEN") {
      stop()
      return false
    }
    return upper.contains("RIDE")
      || upper.contains("DELIVERY")
      || upper.contains("OFFER")
      || upper.contains("JOB")
      || upper.contains("CALL")
      || upper.contains("MISSION")
  }

  static func handleRemote(userInfo: [AnyHashable: Any]) {
    // Toujours couper d’anciennes sonneries avant d’évaluer.
    let kind = (stringValue(userInfo["jobKind"]) ?? stringValue(userInfo["type"]) ?? "").uppercased()
    if kind.contains("CANCEL") || kind.contains("COMPLETED") {
      stop()
      return
    }
    guard isJob(userInfo) else { return }
    playBundleSound()
  }

  static func stop() {
    let center = UNUserNotificationCenter.current()
    let ids = (0..<8).map { "\(prefix)\($0)" }
    center.removePendingNotificationRequests(withIdentifiers: ids)
    center.removeDeliveredNotifications(withIdentifiers: ids)
    player?.stop()
    player = nil
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
      p.numberOfLoops = 0
      p.volume = 1.0
      p.play()
      player = p
    } catch {
      // Silent failure — APNs sound remains the primary path.
    }
  }

  private static func stringValue(_ raw: Any?) -> String? {
    if let s = raw as? String, !s.isEmpty { return s }
    if let n = raw as? NSNumber { return n.stringValue }
    return nil
  }
}

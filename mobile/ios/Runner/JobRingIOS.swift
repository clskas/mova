import Foundation
import UserNotifications

/// Arrêt des sonneries course/livraison iOS (fond / écran verrouillé).
/// Le son APNs seul suffit — ne pas rejouer un AVAudioPlayer (mélange de sons).
enum JobRingIOS {
  static let soundFile = "senga_job.caf"
  private static let prefix = "senga_job_ring_"

  static func isJob(_ userInfo: [AnyHashable: Any]) -> Bool {
    let kind = stringValue(userInfo["jobKind"]) ?? stringValue(userInfo["type"]) ?? ""
    if kind.isEmpty { return false }
    if kind == "INCIDENT_CREATED" || kind == "SOS" || kind == "CHAT_MESSAGE" { return false }
    let upper = kind.uppercased()
    // Arrêt si annulation / fin / appel (CallRing gère les appels).
    if upper.contains("CANCEL")
      || upper.contains("COMPLETED")
      || upper.contains("TAKEN")
      || upper.contains("CALL")
    {
      stop()
      return false
    }
    return upper.contains("RIDE")
      || upper.contains("DELIVERY")
      || upper.contains("OFFER")
      || upper.contains("JOB")
      || upper.contains("MISSION")
  }

  static func handleRemote(userInfo: [AnyHashable: Any]) {
    let kind = (stringValue(userInfo["jobKind"]) ?? stringValue(userInfo["type"]) ?? "").uppercased()
    if kind.contains("CANCEL") || kind.contains("COMPLETED") || kind.contains("CALL") {
      stop()
      return
    }
    // APNs joue déjà le son — ne pas empiler un 2ᵉ lecteur.
    _ = isJob(userInfo)
  }

  static func stop() {
    let center = UNUserNotificationCenter.current()
    let ids = (0..<8).map { "\(prefix)\($0)" }
    center.removePendingNotificationRequests(withIdentifiers: ids)
    center.removeDeliveredNotifications(withIdentifiers: ids)
  }

  private static func stringValue(_ raw: Any?) -> String? {
    if let s = raw as? String, !s.isEmpty { return s }
    if let n = raw as? NSNumber { return n.stringValue }
    return nil
  }
}

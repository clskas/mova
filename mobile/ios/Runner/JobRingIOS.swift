import Foundation
import UIKit
import UserNotifications

/// Sonnerie continue course/livraison iOS (app en fond / fermée) via notifs locales
/// espacées — APNs ne permet pas un MediaPlayer en boucle process mort.
enum JobRingIOS {
  static let soundFile = "senga_job.caf"
  private static let prefix = "senga_job_ring_"
  /// ~3 min de reprises (limite pending iOS ~64).
  private static let maxRepeats = 40
  private static let intervalSec: TimeInterval = 3.5

  static func isStop(_ userInfo: [AnyHashable: Any]) -> Bool {
    if stringValue(userInfo["stopRing"]) == "1" || stringValue(userInfo["stopRing"]) == "true" {
      return true
    }
    let kind = (stringValue(userInfo["jobKind"]) ?? stringValue(userInfo["type"]) ?? "").uppercased()
    if kind.isEmpty { return false }
    return kind == "JOB_STOP" || kind.contains("TAKEN") || kind.contains("CANCEL")
  }

  static func isJob(_ userInfo: [AnyHashable: Any]) -> Bool {
    if isStop(userInfo) { return false }
    let kind = stringValue(userInfo["jobKind"]) ?? stringValue(userInfo["type"]) ?? ""
    if kind.isEmpty { return false }
    if kind == "INCIDENT_CREATED" || kind == "SOS" || kind == "CHAT_MESSAGE" { return false }
    let upper = kind.uppercased()
    if upper.contains("CALL") { return false }
    return upper.contains("RIDE")
      || upper.contains("DELIVERY")
      || upper.contains("OFFER")
      || upper.contains("JOB")
      || upper.contains("MISSION")
  }

  static func handleRemote(userInfo: [AnyHashable: Any]) {
    if isStop(userInfo) {
      stop()
      return
    }
    guard isJob(userInfo) else { return }
    // Premier plan : Flutter AudioPlayer boucle déjà — ne pas spam le centre.
    if UIApplication.shared.applicationState == .active { return }
    let title = stringValue(userInfo["title"]) ?? "SENGA Driver"
    let body = stringValue(userInfo["body"]) ?? "Nouvelle course ou livraison"
    startContinuous(title: title, body: body)
  }

  /// Planifie des notifs locales avec son SENGA pour simuler une sonnerie continue.
  static func startContinuous(title: String, body: String) {
    stopPendingOnly()
    let center = UNUserNotificationCenter.current()
    let sound = UNNotificationSound(named: UNNotificationSoundName(rawValue: soundFile))
    for i in 0..<maxRepeats {
      let content = UNMutableNotificationContent()
      content.title = title
      content.body = body
      content.sound = sound
      content.threadIdentifier = "senga_job_ring"
      if #available(iOS 15.0, *) {
        content.interruptionLevel = .timeSensitive
      }
      // Premier délai > 0 (APNs a déjà joué le 1er bip).
      let delay = intervalSec * Double(i + 1)
      let trigger = UNTimeIntervalNotificationTrigger(timeInterval: delay, repeats: false)
      let req = UNNotificationRequest(
        identifier: "\(prefix)\(i)",
        content: content,
        trigger: trigger
      )
      center.add(req, withCompletionHandler: nil)
    }
  }

  static func stop() {
    let center = UNUserNotificationCenter.current()
    let ids = (0..<maxRepeats).map { "\(prefix)\($0)" }
    center.removePendingNotificationRequests(withIdentifiers: ids)
    center.removeDeliveredNotifications(withIdentifiers: ids)
    // Aussi les notifs FCM d’offre encore affichées (même thread).
    center.getDeliveredNotifications { notes in
      let jobIds = notes
        .filter { $0.request.content.threadIdentifier == "senga_job_ring" }
        .map(\.request.identifier)
      if !jobIds.isEmpty {
        center.removeDeliveredNotifications(withIdentifiers: jobIds)
      }
    }
    DispatchQueue.main.async {
      UIApplication.shared.applicationIconBadgeNumber = 0
    }
  }

  private static func stopPendingOnly() {
    let center = UNUserNotificationCenter.current()
    let ids = (0..<maxRepeats).map { "\(prefix)\($0)" }
    center.removePendingNotificationRequests(withIdentifiers: ids)
  }

  private static func stringValue(_ raw: Any?) -> String? {
    if let s = raw as? String, !s.isEmpty { return s }
    if let n = raw as? NSNumber { return n.stringValue }
    return nil
  }
}

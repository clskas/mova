import Flutter
import UIKit
import UserNotifications

@main
@objc class AppDelegate: FlutterAppDelegate {
  private var jobWakeChannelReady = false

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    GeneratedPluginRegistrant.register(with: self)

    if #available(iOS 10.0, *) {
      UNUserNotificationCenter.current().delegate = self
      UNUserNotificationCenter.current().requestAuthorization(
        options: [.alert, .badge, .sound]
      ) { _, _ in }
    }
    application.registerForRemoteNotifications()

    let ok = super.application(application, didFinishLaunchingWithOptions: launchOptions)

    // google_sign_in_ios still resolves the presenting VC via deprecated
    // UIApplication.keyWindow. On iOS 15+ that is often nil → GIDSignIn throws
    // NSInvalidArgumentException ("presentingViewController must be set") and
    // the plugin re-raises it, which kills the app on "Continuer avec Google".
    ensureKeyWindow(application)

    // Same guard as google_sign_in_ios (SIGPIPE after OAuth on some devices).
    signal(SIGPIPE, SIG_IGN)

    registerJobWakeChannel()

    return ok
  }

  override func application(
    _ application: UIApplication,
    didReceiveRemoteNotification userInfo: [AnyHashable: Any],
    fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void
  ) {
    JobRingIOS.handleRemote(userInfo: userInfo)
    super.application(
      application,
      didReceiveRemoteNotification: userInfo,
      fetchCompletionHandler: completionHandler
    )
  }

  /// Évite les badges « fantômes » (chiffre sur l’icône sans entrée dans le Centre de notifications).
  override func applicationDidBecomeActive(_ application: UIApplication) {
    super.applicationDidBecomeActive(application)
    // Arrêt sonnerie continue dès que le chauffeur ouvre l’app.
    JobRingIOS.stop()
    registerJobWakeChannel()
    syncIconBadgeWithDeliveredNotifications(application)
  }

  private func registerJobWakeChannel() {
    guard !jobWakeChannelReady else { return }
    guard let controller = window?.rootViewController as? FlutterViewController else { return }
    let channel = FlutterMethodChannel(
      name: "senga/job_wake",
      binaryMessenger: controller.binaryMessenger
    )
    channel.setMethodCallHandler { call, result in
      if call.method == "stopRing" {
        JobRingIOS.stop()
        result(true)
      } else {
        result(FlutterMethodNotImplemented)
      }
    }
    jobWakeChannelReady = true
  }

  private func syncIconBadgeWithDeliveredNotifications(_ application: UIApplication) {
    UNUserNotificationCenter.current().getDeliveredNotifications { notes in
      DispatchQueue.main.async {
        application.applicationIconBadgeNumber = notes.count
      }
    }
  }

  private func ensureKeyWindow(_ application: UIApplication) {
    if let window = self.window {
      window.makeKeyAndVisible()
      return
    }
    if #available(iOS 13.0, *) {
      let scenes = application.connectedScenes.compactMap { $0 as? UIWindowScene }
      let candidate =
        scenes.flatMap(\.windows).first(where: \.isKeyWindow)
        ?? scenes.flatMap(\.windows).first
      candidate?.makeKeyAndVisible()
      if self.window == nil {
        self.window = candidate
      }
    }
  }
}

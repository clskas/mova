import Flutter
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    GeneratedPluginRegistrant.register(with: self)
    let ok = super.application(application, didFinishLaunchingWithOptions: launchOptions)

    // google_sign_in_ios still resolves the presenting VC via deprecated
    // UIApplication.keyWindow. On iOS 15+ that is often nil → GIDSignIn throws
    // NSInvalidArgumentException ("presentingViewController must be set") and
    // the plugin re-raises it, which kills the app on "Continuer avec Google".
    ensureKeyWindow(application)

    // Same guard as google_sign_in_ios (SIGPIPE after OAuth on some devices).
    signal(SIGPIPE, SIG_IGN)

    return ok
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

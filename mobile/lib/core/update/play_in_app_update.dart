import 'package:flutter/foundation.dart';
import 'package:in_app_update/in_app_update.dart';

/// Snapshot of Play Core in-app update (versionCode only — the boolean
/// `updateAvailable` stays true after a store install and kept the banner).
class PlayUpdateProbe {
  const PlayUpdateProbe({this.availableVersionCode = 0});
  final int availableVersionCode;
}

/// Google Play In-App Updates (Android). No-op on iOS / web / sideload.
class PlayInAppUpdate {
  static bool get supported =>
      !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

  static Future<PlayUpdateProbe> inspect() async {
    if (!supported) return const PlayUpdateProbe();
    try {
      final info = await InAppUpdate.checkForUpdate();
      return PlayUpdateProbe(availableVersionCode: info.availableVersionCode ?? 0);
    } catch (_) {
      return const PlayUpdateProbe();
    }
  }

  static Future<bool> hasUpdate() async {
    final probe = await inspect();
    return probe.availableVersionCode > 0;
  }

  /// Background flexible download. Completes when the AAB is on device.
  static Future<bool> startFlexible() async {
    if (!supported) return false;
    try {
      final info = await InAppUpdate.checkForUpdate();
      if (info.updateAvailability != UpdateAvailability.updateAvailable) {
        return false;
      }
      if (!info.flexibleUpdateAllowed) return false;
      final result = await InAppUpdate.startFlexibleUpdate();
      return result == AppUpdateResult.success;
    } catch (_) {
      return false;
    }
  }

  /// Full-screen blocking update (mandatory / security).
  static Future<bool> startImmediate() async {
    if (!supported) return false;
    try {
      final info = await InAppUpdate.checkForUpdate();
      if (info.updateAvailability != UpdateAvailability.updateAvailable) {
        return false;
      }
      if (!info.immediateUpdateAllowed) return false;
      final result = await InAppUpdate.performImmediateUpdate();
      return result == AppUpdateResult.success;
    } catch (_) {
      return false;
    }
  }

  static Future<bool> completeFlexible() async {
    if (!supported) return false;
    try {
      await InAppUpdate.completeFlexibleUpdate();
      return true;
    } catch (_) {
      return false;
    }
  }
}

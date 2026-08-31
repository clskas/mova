import 'package:flutter/foundation.dart';
import 'package:in_app_update/in_app_update.dart';

/// Google Play In-App Updates (Android). No-op on iOS / web / sideload.
class PlayInAppUpdate {
  static bool get supported =>
      !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

  static Future<bool> hasUpdate() async {
    if (!supported) return false;
    try {
      final info = await InAppUpdate.checkForUpdate();
      return info.updateAvailability == UpdateAvailability.updateAvailable;
    } catch (_) {
      return false;
    }
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

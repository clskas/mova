import 'dart:io';

import 'package:flutter/services.dart';

import '../sos/notification_tap_router.dart';

/// Pont Android : offre reçue app tuée (intent natif) → écran d’offre.
class NativeJobWake {
  NativeJobWake._();

  static const _channel = MethodChannel('senga/job_wake');
  static bool _handlerReady = false;

  static void install() {
    if (_handlerReady) return;
    if (!Platform.isAndroid && !Platform.isIOS) return;
    _handlerReady = true;
    if (Platform.isAndroid) {
      _channel.setMethodCallHandler((call) async {
        if (call.method == 'arrived') {
          _open(call.arguments);
        }
      });
    }
  }

  static Future<void> consumePending() async {
    if (!Platform.isAndroid) return;
    install();
    try {
      final raw = await _channel.invokeMethod<dynamic>('consumePending');
      _open(raw);
    } catch (_) {
      /* canal absent (tests / iOS) */
    }
  }

  static Future<void> ensureAlerts() async {
    if (!Platform.isAndroid) return;
    try {
      await _channel.invokeMethod<void>('ensureAlerts');
    } catch (_) {}
  }

  /// Coupe MediaPlayer Android / notifs locales iOS même app en fond.
  static Future<void> stopRing() async {
    if (!Platform.isAndroid && !Platform.isIOS) return;
    install();
    try {
      await _channel.invokeMethod<void>('stopRing');
    } catch (_) {}
  }

  static void _open(dynamic raw) {
    if (raw is! Map) return;
    final id = raw['id']?.toString() ?? '';
    if (id.isEmpty) return;
    final kind = raw['kind']?.toString() ?? 'ride';
    NotificationTapRouter.openJob(JobOpenRequest(kind: kind, id: id));
  }
}

import 'package:flutter/foundation.dart';
import 'package:sms_autofill/sms_autofill.dart';

/// Android app signature hash for SMS Retriever (silent OTP fill).
Future<String?> androidSmsAppHash() async {
  if (kIsWeb) return null;
  if (defaultTargetPlatform != TargetPlatform.android) return null;
  try {
    final hash = await SmsAutoFill().getAppSignature;
    final trimmed = hash.trim();
    return trimmed.isEmpty ? null : trimmed;
  } catch (_) {
    return null;
  }
}

/// Starts listening for the OTP SMS (Android Retriever). No-op on iOS/web.
Future<void> startOtpSmsListen() async {
  if (kIsWeb) return;
  if (defaultTargetPlatform != TargetPlatform.android) return;
  try {
    await SmsAutoFill().listenForCode();
  } catch (_) {}
}

void stopOtpSmsListen() {
  if (kIsWeb) return;
  try {
    SmsAutoFill().unregisterListener();
  } catch (_) {}
}

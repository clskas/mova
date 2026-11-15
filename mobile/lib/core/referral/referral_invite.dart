import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../api/api_client.dart';
import '../error/result.dart';

/// Referral code brought by an invitation link (Android: Play install referrer) or typed at
/// sign-up. Kept until the account exists, then sent once to /users/me/referral.
class ReferralInvite {
  ReferralInvite._();

  static const _prefKey = 'referral_pending_code';
  static const _referrerReadKey = 'referral_install_referrer_read';
  static const _channel = MethodChannel('senga/install_referrer');

  /// Web page that opens the invitation (store buttons, or sign-up on the web).
  static const inviteBaseUrl = 'https://senga.afri-soft.com/';

  /// « sg ab-12 cd » → « SGAB12CD »; null when it cannot be a code (pure, tested).
  static String? normalize(String? raw) {
    final c = (raw ?? '').toUpperCase().replaceAll(RegExp('[^A-Z0-9]'), '');
    return c.length >= 4 && c.length <= 16 ? c : null;
  }

  /// Code inside a Play install referrer (« ref=SGAB12CD&utm_source=… », maybe URL-encoded).
  static String? fromInstallReferrer(String? referrer) {
    if (referrer == null || referrer.isEmpty) return null;
    var text = referrer;
    try {
      text = Uri.decodeComponent(referrer);
    } catch (_) {
      /* keep as is */
    }
    final m = RegExp(r'(?:^|[?&])ref=([A-Za-z0-9-]+)').firstMatch(text);
    return normalize(m?.group(1));
  }

  /// Link a user shares: the code is already inside (pure, tested).
  static String inviteLink(String code, {bool driver = false}) {
    final c = normalize(code) ?? code;
    return '$inviteBaseUrl?ref=${Uri.encodeQueryComponent(c)}${driver ? '&app=driver' : ''}';
  }

  static Future<String?> pending() async {
    try {
      final p = await SharedPreferences.getInstance();
      return normalize(p.getString(_prefKey));
    } catch (_) {
      return null;
    }
  }

  static Future<void> savePending(String? raw) async {
    try {
      final p = await SharedPreferences.getInstance();
      final c = normalize(raw);
      if (c == null) {
        await p.remove(_prefKey);
      } else {
        await p.setString(_prefKey, c);
      }
    } catch (_) {
      /* tests */
    }
  }

  /// First launch after installing from an invitation link (Android only): the Play Store
  /// passes the code. Read once; returns the code now pending, if any.
  static Future<String?> captureInstallReferrer() async {
    final already = await pending();
    if (already != null) return already;
    if (kIsWeb || defaultTargetPlatform != TargetPlatform.android) return null;
    try {
      final p = await SharedPreferences.getInstance();
      if (p.getBool(_referrerReadKey) == true) return null;
      final raw = await _channel.invokeMethod<String>('get').timeout(const Duration(seconds: 4));
      await p.setBool(_referrerReadKey, true);
      final code = fromInstallReferrer(raw);
      if (code != null) await p.setString(_prefKey, code);
      return code;
    } catch (_) {
      return null;
    }
  }

  /// After the sign-in: sends the pending code. Returns a message to show, or null.
  /// Old accounts (past the entry days, or already referred) are skipped quietly.
  static Future<String?> applyPending(ApiClient api, {required bool isNew}) async {
    final code = await pending();
    if (code == null) return null;
    final result = await api.post('/users/me/referral', {'code': code});
    await savePending(null);
    return switch (result) {
      Success() => 'ok',
      Failure(:final error) => isNew ? error.message : null,
    };
  }
}

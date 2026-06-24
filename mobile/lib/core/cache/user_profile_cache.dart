import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

/// Cache local du profil passager (`GET /users/me`).
class UserProfileCache {
  static const _payloadKey = 'mova_user_profile_payload';
  static const _syncedAtKey = 'mova_user_profile_synced_at';

  static Future<void> save(Map<String, dynamic> profile) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_payloadKey, jsonEncode(profile));
    await prefs.setString(_syncedAtKey, DateTime.now().toIso8601String());
  }

  static Future<void> clear() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_payloadKey);
    await prefs.remove(_syncedAtKey);
  }

  static Future<UserProfileSnapshot> load() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_payloadKey);
    final syncedRaw = prefs.getString(_syncedAtKey);
    if (raw == null) return const UserProfileSnapshot();

    final decoded = jsonDecode(raw) as Map<String, dynamic>;
    return UserProfileSnapshot(
      profile: decoded,
      syncedAt: syncedRaw != null ? DateTime.tryParse(syncedRaw) : null,
    );
  }
}

class UserProfileSnapshot {
  const UserProfileSnapshot({this.profile, this.syncedAt});

  final Map<String, dynamic>? profile;
  final DateTime? syncedAt;

  bool get isEmpty => profile == null || syncedAt == null;
}

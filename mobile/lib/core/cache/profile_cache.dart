import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

/// Cache local du profil chauffeur (`/drivers/profile`).
class ProfileCache {
  static const _payloadKey = 'mova_profile_payload';
  static const _syncedAtKey = 'mova_profile_synced_at';

  static Future<void> save(Map<String, dynamic> response) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_payloadKey, jsonEncode(response));
    await prefs.setString(_syncedAtKey, DateTime.now().toIso8601String());
  }

  static Future<void> clear() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_payloadKey);
    await prefs.remove(_syncedAtKey);
  }

  static Future<ProfileSnapshot> load() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_payloadKey);
    final syncedRaw = prefs.getString(_syncedAtKey);
    if (raw == null) return const ProfileSnapshot();

    final decoded = jsonDecode(raw) as Map<String, dynamic>;
    final profile = decoded['profile'] as Map<String, dynamic>? ?? decoded;
    return ProfileSnapshot(
      profile: profile,
      syncedAt: syncedRaw != null ? DateTime.tryParse(syncedRaw) : null,
    );
  }
}

class ProfileSnapshot {
  const ProfileSnapshot({this.profile, this.syncedAt});

  final Map<String, dynamic>? profile;
  final DateTime? syncedAt;

  bool get isEmpty => profile == null;
}

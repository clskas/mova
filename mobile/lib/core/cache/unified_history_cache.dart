import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

/// Cache persistant de la réponse unifiée `/history`.
class UnifiedHistoryCache {
  static const _payloadKey = 'mova_unified_history_payload';
  static const _syncedAtKey = 'mova_unified_history_synced_at';

  static Future<void> save(Map<String, dynamic> response) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_payloadKey, jsonEncode(response));
    await prefs.setString(_syncedAtKey, DateTime.now().toIso8601String());
  }

  static Future<UnifiedHistorySnapshot> load() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_payloadKey);
    final syncedRaw = prefs.getString(_syncedAtKey);
    if (raw == null) {
      return const UnifiedHistorySnapshot(data: []);
    }
    final decoded = jsonDecode(raw) as Map<String, dynamic>;
    final list = decoded['data'] as List? ?? [];
    return UnifiedHistorySnapshot(
      data: List<dynamic>.from(list),
      currency: decoded['currency']?.toString(),
      city: decoded['city']?.toString(),
      syncedAt: syncedRaw != null ? DateTime.tryParse(syncedRaw) : null,
    );
  }

  static Future<void> clear() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_payloadKey);
    await prefs.remove(_syncedAtKey);
  }
}

class UnifiedHistorySnapshot {
  const UnifiedHistorySnapshot({
    required this.data,
    this.currency,
    this.city,
    this.syncedAt,
  });

  final List<dynamic> data;
  final String? currency;
  final String? city;
  final DateTime? syncedAt;

  bool get isEmpty => data.isEmpty;
}

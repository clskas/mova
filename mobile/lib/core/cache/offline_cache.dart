import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

class OfflineCache {
  static const _ridesKey = 'cached_rides';

  static Future<void> cacheRides(List<Map<String, dynamic>> rides) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_ridesKey, jsonEncode(rides));
  }

  static Future<List<Map<String, dynamic>>> getCachedRides() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_ridesKey);
    if (raw == null) return [];
    final list = jsonDecode(raw) as List;
    return list.cast<Map<String, dynamic>>();
  }

  static Future<void> clearCache() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_ridesKey);
  }
}

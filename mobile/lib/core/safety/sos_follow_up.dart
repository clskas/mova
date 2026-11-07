import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../api/api_client.dart';
import '../error/result.dart';

/// Numbers the app needs even without Internet (saved when the network works).
class SosConfigCache {
  static const _key = 'sos_config_cache_v1';

  /// Number to text a SOS when it cannot go over the Internet ('' = none).
  static String smsNumber = '';

  /// Emergency numbers to call: (label, phone). 112 is always there.
  static List<({String label, String phone})> emergencyNumbers = const [(label: '112', phone: '112')];

  static Future<void> load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_key);
      if (raw == null) return;
      _apply(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      /* keep defaults */
    }
  }

  /// Refreshes from /public/client-config; silent when offline.
  static Future<void> refresh(ApiClient api) async {
    final result = await api.get('/public/client-config');
    if (result case Success(:final data)) {
      final slice = {'sosSmsNumber': data['sosSmsNumber'], 'sosEmergencyContacts': data['sosEmergencyContacts']};
      _apply(slice);
      try {
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString(_key, jsonEncode(slice));
      } catch (_) {}
    }
  }

  static void _apply(Map<String, dynamic> data) {
    smsNumber = data['sosSmsNumber']?.toString().trim() ?? '';
    final raw = data['sosEmergencyContacts'];
    final list = <({String label, String phone})>[];
    if (raw is List) {
      for (final row in raw) {
        if (row is! Map || row['enabled'] == false) continue;
        final label = row['label']?.toString().trim() ?? '';
        final phone = row['phone']?.toString().trim() ?? '';
        if (label.isNotEmpty && phone.isNotEmpty) list.add((label: label, phone: phone));
      }
    }
    if (!list.any((n) => n.phone == '112')) list.insert(0, (label: '112', phone: '112'));
    emergencyNumbers = list;
  }
}

/// After a SOS: shares the position every 15 s for 30 minutes and follows the alert status.
class SosFollowUp {
  SosFollowUp._();

  static final ValueNotifier<Map<String, dynamic>?> status = ValueNotifier(null);
  static String? activeId;
  static Timer? _locationTimer;
  static Timer? _statusTimer;
  static DateTime? _until;

  static bool get sharing => _locationTimer != null;

  static void start(ApiClient api, String incidentId) {
    stop();
    activeId = incidentId;
    _until = DateTime.now().add(const Duration(minutes: 30));
    status.value = {'id': incidentId, 'status': 'OPEN'};
    _locationTimer = Timer.periodic(const Duration(seconds: 15), (_) => _sendPosition(api));
    _statusTimer = Timer.periodic(const Duration(seconds: 20), (_) => refreshStatus(api));
    unawaited(refreshStatus(api));
  }

  static void stopSharing() {
    _locationTimer?.cancel();
    _locationTimer = null;
  }

  static void stop() {
    stopSharing();
    _statusTimer?.cancel();
    _statusTimer = null;
  }

  static Future<void> refreshStatus(ApiClient api) async {
    final id = activeId;
    if (id == null) return;
    final result = await api.get('/incidents/$id');
    if (result case Success(:final data)) {
      status.value = data;
      if (data['status']?.toString() != 'OPEN') stop();
    }
  }

  static Future<void> _sendPosition(ApiClient api) async {
    final id = activeId;
    if (id == null || (_until != null && DateTime.now().isAfter(_until!))) {
      stopSharing();
      return;
    }
    try {
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, timeLimit: Duration(seconds: 10)),
      );
      final result = await api.post(
        '/incidents/$id/location',
        {'lat': pos.latitude, 'lng': pos.longitude},
        retries: 1,
        skipOffline: true,
      );
      if (result case Success(:final data) when data['tracking'] == false) stopSharing();
    } catch (_) {
      /* no fix this time: try again on the next tick */
    }
  }
}

import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import '../../core/navigation/mova_navigator.dart';
import 'sos_alert_screen.dart';

/// Routage des taps notifications (SOS, etc.) vers un écran utile.
class NotificationTapRouter {
  NotificationTapRouter._();

  static SosOpenRequest? _pending;
  static bool _launchDetailsConsumed = false;
  static Timer? _retryTimer;

  /// Encode un payload SOS pour [FlutterLocalNotificationsPlugin.show].
  static String encodeSosPayload({
    String? incidentId,
    String? title,
    String? body,
    double? lat,
    double? lng,
    String? rideId,
    String? referenceType,
    String? referenceId,
    bool forOps = false,
  }) {
    return jsonEncode({
      't': 'sos',
      if (incidentId != null && incidentId.isNotEmpty) 'id': incidentId,
      if (title != null && title.isNotEmpty) 'title': title,
      if (body != null && body.isNotEmpty) 'body': body,
      if (lat != null) 'lat': lat,
      if (lng != null) 'lng': lng,
      if (rideId != null && rideId.isNotEmpty) 'rideId': rideId,
      if (referenceType != null && referenceType.isNotEmpty) 'referenceType': referenceType,
      if (referenceId != null && referenceId.isNotEmpty) 'referenceId': referenceId,
      'forOps': forOps,
    });
  }

  static void onLocalNotificationResponse(NotificationResponse response) {
    handlePayload(response.payload);
  }

  @pragma('vm:entry-point')
  static void onBackgroundNotificationResponse(NotificationResponse response) {
    // Isolate background : la navigation se fera via getNotificationAppLaunchDetails
    // au prochain démarrage / reprise. On ne peut pas pousser de route ici.
    if (kDebugMode) {
      debugPrint('NotificationTapRouter background payload=${response.payload}');
    }
  }

  static void handlePayload(String? payload) {
    if (payload == null || payload.isEmpty) return;
    final req = parsePayload(payload);
    if (req != null) {
      openSos(req);
    }
  }

  static void openFromFcmData(
    Map<String, dynamic> data, {
    String? title,
    String? body,
  }) {
    final type = data['type']?.toString() ?? '';
    if (type != 'INCIDENT_CREATED' && type != 'SOS') return;
    openSos(
      SosOpenRequest(
        incidentId: data['incidentId']?.toString(),
        title: title ?? data['title']?.toString() ?? 'Alerte SOS',
        body: body ?? data['body']?.toString(),
        lat: _asDouble(data['lat']),
        lng: _asDouble(data['lng']),
        rideId: data['rideId']?.toString(),
        referenceType: data['referenceType']?.toString(),
        referenceId: data['referenceId']?.toString(),
        forOps: data['forOps']?.toString() == '1' || data['forOps'] == true,
      ),
    );
  }

  static SosOpenRequest? parsePayload(String payload) {
    final trimmed = payload.trim();
    if (trimmed == 'SOS' || trimmed.toLowerCase() == 'sos') {
      return const SosOpenRequest(title: 'Alerte SOS');
    }
    String jsonStr = trimmed;
    if (trimmed.startsWith('sos:')) {
      jsonStr = trimmed.substring(4);
    }
    if (!jsonStr.startsWith('{')) return null;
    try {
      final map = jsonDecode(jsonStr);
      if (map is! Map) return null;
      final t = map['t']?.toString();
      if (t != null && t != 'sos' && t.toUpperCase() != 'SOS') return null;
      return SosOpenRequest(
        incidentId: map['id']?.toString() ?? map['incidentId']?.toString(),
        title: map['title']?.toString(),
        body: map['body']?.toString(),
        lat: _asDouble(map['lat']),
        lng: _asDouble(map['lng']),
        rideId: map['rideId']?.toString(),
        referenceType: map['referenceType']?.toString(),
        referenceId: map['referenceId']?.toString(),
        forOps: map['forOps'] == true || map['forOps']?.toString() == '1',
      );
    } catch (e) {
      if (kDebugMode) debugPrint('NotificationTapRouter parse: $e');
      return const SosOpenRequest(title: 'Alerte SOS');
    }
  }

  static void openSos(SosOpenRequest request) {
    final nav = movaNavigatorKey.currentState;
    if (nav == null) {
      _pending = request;
      _armRetry();
      return;
    }
    _pending = null;
    _retryTimer?.cancel();
    nav.push(
      MaterialPageRoute<void>(
        builder: (_) => SosAlertScreen(
          incidentId: request.incidentId,
          title: request.title,
          body: request.body,
          lat: request.lat,
          lng: request.lng,
          rideId: request.rideId,
          referenceType: request.referenceType,
          referenceId: request.referenceId,
          forOps: request.forOps,
        ),
      ),
    );
  }

  /// À appeler après démarrage (splash / home) pour vider une ouverture différée
  /// et consommer le tap qui a lancé l’app.
  static Future<void> flushPendingAndLaunchDetails() async {
    if (!_launchDetailsConsumed) {
      _launchDetailsConsumed = true;
      try {
        final plugin = FlutterLocalNotificationsPlugin();
        final details = await plugin.getNotificationAppLaunchDetails();
        if (details?.didNotificationLaunchApp == true) {
          handlePayload(details!.notificationResponse?.payload);
        }
      } catch (e) {
        if (kDebugMode) debugPrint('NotificationTapRouter launchDetails: $e');
      }
    }
    final pending = _pending;
    if (pending != null) openSos(pending);
  }

  static void _armRetry() {
    _retryTimer?.cancel();
    var attempts = 0;
    _retryTimer = Timer.periodic(const Duration(milliseconds: 400), (t) {
      attempts++;
      if (_pending == null || movaNavigatorKey.currentState != null) {
        t.cancel();
        final pending = _pending;
        if (pending != null) openSos(pending);
        return;
      }
      if (attempts >= 40) t.cancel();
    });
  }

  static double? _asDouble(Object? v) {
    if (v == null) return null;
    if (v is num) return v.toDouble();
    return double.tryParse(v.toString());
  }
}

class SosOpenRequest {
  const SosOpenRequest({
    this.incidentId,
    this.title,
    this.body,
    this.lat,
    this.lng,
    this.rideId,
    this.referenceType,
    this.referenceId,
    this.forOps = false,
  });

  final String? incidentId;
  final String? title;
  final String? body;
  final double? lat;
  final double? lng;
  final String? rideId;
  final String? referenceType;
  final String? referenceId;
  final bool forOps;
}

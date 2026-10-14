import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import '../../core/navigation/mova_navigator.dart';
import 'sos_alert_screen.dart';

/// Routage des taps notifications (SOS, offres course/livraison, appels).
class NotificationTapRouter {
  NotificationTapRouter._();

  static SosOpenRequest? _pendingSos;
  static JobOpenRequest? _pendingJob;
  static bool _launchDetailsConsumed = false;
  static Timer? _retryTimer;

  /// Enregistré par [DriverHomeScreen] pour ouvrir une offre hors cold-start.
  static Future<void> Function(JobOpenRequest request)? onJobOfferOpen;

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

  static String encodeJobPayload({required String kind, required String id}) {
    return jsonEncode({'t': 'job', 'kind': kind, 'id': id});
  }

  static void onLocalNotificationResponse(NotificationResponse response) {
    handlePayload(response.payload);
  }

  @pragma('vm:entry-point')
  static void onBackgroundNotificationResponse(NotificationResponse response) {
    if (kDebugMode) {
      debugPrint('NotificationTapRouter background payload=${response.payload}');
    }
  }

  static void handlePayload(String? payload) {
    if (payload == null || payload.isEmpty) return;
    final trimmed = payload.trim();

    if (trimmed.startsWith('call:')) {
      // L’overlay d’appel se gère via socket / poll ; le tap réveille juste l’app.
      return;
    }

    final job = parseJobPayload(trimmed);
    if (job != null) {
      openJob(job);
      return;
    }

    final sos = parseSosPayload(trimmed);
    if (sos != null) openSos(sos);
  }

  static void openFromFcmData(
    Map<String, dynamic> data, {
    String? title,
    String? body,
  }) {
    final type = data['type']?.toString() ?? '';
    final jobKind = data['jobKind']?.toString() ?? type;
    final refId = data['referenceId']?.toString() ??
        data['rideId']?.toString() ??
        data['deliveryId']?.toString() ??
        '';

    if (type == 'INCIDENT_CREATED' || type == 'SOS') {
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
      return;
    }

    final isOffer = jobKind.contains('RIDE') ||
        jobKind.contains('DELIVERY') ||
        jobKind.contains('OFFER') ||
        jobKind.contains('JOB');
    if (isOffer && refId.isNotEmpty) {
      final kind = jobKind.contains('DELIVERY') ? 'delivery' : 'ride';
      openJob(JobOpenRequest(kind: kind, id: refId));
    }
  }

  static JobOpenRequest? parseJobPayload(String payload) {
    if (payload.startsWith('ride:') || payload.startsWith('delivery:')) {
      final i = payload.indexOf(':');
      return JobOpenRequest(kind: payload.substring(0, i), id: payload.substring(i + 1));
    }
    if (!payload.startsWith('{')) {
      // Anciens payloads texte type "RIDE_OFFER"
      if (payload.contains('RIDE') || payload.contains('DELIVERY') || payload.contains('OFFER')) {
        return null;
      }
      return null;
    }
    try {
      final map = jsonDecode(payload);
      if (map is! Map) return null;
      if (map['t']?.toString() != 'job') return null;
      final kind = map['kind']?.toString() ?? 'ride';
      final id = map['id']?.toString() ?? '';
      if (id.isEmpty) return null;
      return JobOpenRequest(kind: kind, id: id);
    } catch (_) {
      return null;
    }
  }

  static SosOpenRequest? parseSosPayload(String payload) {
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
      if (t == 'job') return null;
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
      if (kDebugMode) debugPrint('NotificationTapRouter parse SOS: $e');
      return const SosOpenRequest(title: 'Alerte SOS');
    }
  }

  static void openSos(SosOpenRequest request) {
    final nav = movaNavigatorKey.currentState;
    if (nav == null) {
      _pendingSos = request;
      _armRetry();
      return;
    }
    _pendingSos = null;
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

  static void openJob(JobOpenRequest request) {
    final opener = onJobOfferOpen;
    if (opener == null) {
      _pendingJob = request;
      _armRetry();
      return;
    }
    _pendingJob = null;
    unawaited(opener(request));
  }

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
    final pendingSos = _pendingSos;
    if (pendingSos != null) openSos(pendingSos);
    final pendingJob = _pendingJob;
    if (pendingJob != null) openJob(pendingJob);
  }

  static void _armRetry() {
    _retryTimer?.cancel();
    var attempts = 0;
    _retryTimer = Timer.periodic(const Duration(milliseconds: 400), (t) {
      attempts++;
      final canNav = movaNavigatorKey.currentState != null;
      final canJob = onJobOfferOpen != null;
      if ((_pendingSos == null || canNav) && (_pendingJob == null || canJob)) {
        t.cancel();
        final pendingSos = _pendingSos;
        if (pendingSos != null) openSos(pendingSos);
        final pendingJob = _pendingJob;
        if (pendingJob != null) openJob(pendingJob);
        return;
      }
      if (attempts >= 50) t.cancel();
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

class JobOpenRequest {
  const JobOpenRequest({required this.kind, required this.id});

  final String kind;
  final String id;
}

// Real App Store screenshots of Senga Driver, taken on iOS simulators by
// .github/workflows/store-screenshots.yml (Apple guideline 2.3.3: screenshots must
// show the app in use, not mock-ups).
//
// Runs against STAGING only (mocked SMS / payments) with the seed demo driver:
// it goes online, receives a real ride offer created by a seed passenger, then
// opens Earnings and History. Each screenshot is taken by a small server on the
// Mac host (`xcrun simctl io … screenshot`), so it includes the real iOS status bar.
//
// Native permission prompts (location, notifications) would cover the screen, so
// those plugins are answered here; everything else is the real app and real data.
import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:integration_test/integration_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:mova/features/driver/driver_earnings_screen.dart';
import 'package:mova/features/driver/driver_ride_history_screen.dart';
import 'package:mova/features/driver/ride_offer_screen.dart';
import 'package:mova/mova_launcher.dart';

const _api = String.fromEnvironment('API_URL');
const _shotServer = String.fromEnvironment('SHOT_SERVER', defaultValue: 'http://127.0.0.1:8765');
const _driverPhone = String.fromEnvironment('DEMO_DRIVER_PHONE', defaultValue: '+243900000023');
const _passengerPhone = String.fromEnvironment('DEMO_PASSENGER_PHONE', defaultValue: '+243900000044');

// Kinshasa, Gombe — where the demo driver waits and the passenger is picked up.
const _lat = -4.3105;
const _lng = 15.3136;

Map<String, dynamic> get _position => {
      'latitude': _lat,
      'longitude': _lng,
      'timestamp': DateTime.now().millisecondsSinceEpoch,
      'accuracy': 5.0,
      'altitude': 300.0,
      'altitude_accuracy': 3.0,
      'heading': 0.0,
      'heading_accuracy': 1.0,
      'speed': 0.0,
      'speed_accuracy': 0.5,
      'is_mocked': false,
    };

Map<String, String> _headers([String? token]) => {
      'Content-Type': 'application/json',
      'X-Senga-Client': 'senga',
      if (token != null) 'Authorization': 'Bearer $token',
    };

Future<Map<String, dynamic>> _call(String method, String path, {String? token, Object? body}) async {
  final uri = Uri.parse('$_api$path');
  final encoded = body == null ? null : jsonEncode(body);
  final res = switch (method) {
    'POST' => await http.post(uri, headers: _headers(token), body: encoded),
    'PATCH' => await http.patch(uri, headers: _headers(token), body: encoded),
    _ => await http.get(uri, headers: _headers(token)),
  };
  final text = res.body.isEmpty ? '{}' : res.body;
  final decoded = jsonDecode(text);
  if (res.statusCode >= 300) {
    debugPrint('[screens] $method $path → ${res.statusCode} ${text.substring(0, text.length.clamp(0, 300))}');
  }
  return decoded is Map<String, dynamic> ? decoded : {'data': decoded};
}

Future<String> _driverToken() async {
  final r = await _call('POST', '/auth/pin/login', body: {'phone': _driverPhone, 'pin': '123456', 'role': 'DRIVER'});
  final token = (r['accessToken'] ?? (r['data'] as Map?)?['accessToken'])?.toString() ?? '';
  if (token.isEmpty) throw StateError('demo driver sign-in failed: $r');
  return token;
}

Future<String> _passengerToken() async {
  await _call('POST', '/auth/otp/request', body: {'phone': _passengerPhone});
  final r = await _call('POST', '/auth/otp/verify', body: {'phone': _passengerPhone, 'code': '123456'});
  final token = (r['accessToken'] ?? (r['data'] as Map?)?['accessToken'])?.toString() ?? '';
  if (token.isEmpty) throw StateError('demo passenger sign-in failed: $r');
  return token;
}

Future<void> _cancelActiveRide(String passengerToken) async {
  final active = await _call('GET', '/rides/active', token: passengerToken);
  final ride = active['ride'] ?? active['data'];
  final id = ride is Map ? ride['id']?.toString() : null;
  if (id != null && id.isNotEmpty) {
    await _call('POST', '/rides/$id/cancel', token: passengerToken, body: {'reason': 'store screenshots cleanup'});
  }
}

Future<void> _shot(String name) async {
  try {
    await http.get(Uri.parse('$_shotServer/shot?name=$name')).timeout(const Duration(seconds: 30));
  } catch (e) {
    debugPrint('[screens] screenshot $name failed: $e');
  }
}

/// Lets the app run (polling, animations, network) for [d] without waiting for idle.
Future<void> _run(WidgetTester tester, Duration d) async {
  final end = DateTime.now().add(d);
  while (DateTime.now().isBefore(end)) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

Future<bool> _waitFor(WidgetTester tester, Finder finder, Duration timeout) async {
  final end = DateTime.now().add(timeout);
  while (DateTime.now().isBefore(end)) {
    await tester.pump(const Duration(milliseconds: 200));
    if (finder.evaluate().isNotEmpty) return true;
  }
  return false;
}

/// Prints the visible texts (error banners, labels) to the CI log for diagnosis.
void _dumpTexts(String label) {
  final texts = find.byType(Text).evaluate().map((e) => (e.widget as Text).data ?? '').where((t) => t.trim().isNotEmpty);
  debugPrint('[screens] $label: ${texts.take(40).join(' | ')}');
}

void _answerNativePrompts(TestDefaultBinaryMessenger messenger) {
  messenger.setMockMethodCallHandler(const MethodChannel('flutter.baseflow.com/geolocator_apple'), (call) async {
    switch (call.method) {
      case 'checkPermission':
      case 'requestPermission':
        return 3; // always
      case 'isLocationServiceEnabled':
        return true;
      case 'getLocationAccuracy':
        return 1; // precise
      case 'getLastKnownPosition':
      case 'getCurrentPosition':
        return _position;
    }
    return null;
  });
  messenger.setMockStreamHandler(
    const EventChannel('flutter.baseflow.com/geolocator_updates_apple'),
    MockStreamHandler.inline(onListen: (_, sink) => sink.success(_position)),
  );
  messenger.setMockStreamHandler(
    const EventChannel('flutter.baseflow.com/geolocator_service_updates_apple'),
    MockStreamHandler.inline(onListen: (_, sink) => sink.success(1)),
  );
  messenger.setMockMethodCallHandler(const MethodChannel('dexterous.com/flutter/local_notifications'), (call) async {
    switch (call.method) {
      case 'initialize':
      case 'requestPermissions':
        return true;
      case 'pendingNotificationRequests':
      case 'getActiveNotifications':
        return <Object>[];
    }
    return null;
  });
  messenger.setMockMethodCallHandler(const MethodChannel('plugins.flutter.io/firebase_messaging'), (call) async {
    switch (call.method) {
      case 'Messaging#requestPermission':
      case 'Messaging#getNotificationSettings':
        return <String, int>{
          'authorizationStatus': 1,
          'alert': 1,
          'announcement': 0,
          'badge': 1,
          'carPlay': 0,
          'lockScreen': 1,
          'notificationCenter': 1,
          'showPreviews': 1,
          'timeSensitive': 0,
          'criticalAlert': 0,
          'sound': 1,
          'providesAppNotificationSettings': 0,
        };
      case 'Messaging#getToken':
        return <String, String>{'token': 'store-screenshots-simulator'};
    }
    return null;
  });
  messenger.setMockMethodCallHandler(const MethodChannel('flutter_foreground_task/methods'), (call) async {
    switch (call.method) {
      case 'checkNotificationPermission':
      case 'requestNotificationPermission':
        return 0; // granted
      case 'isRunningService':
        return false;
    }
    return true;
  });
}

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('Senga Driver — App Store screenshots', (tester) async {
    expect(_api.contains('mova-stg-'), isTrue, reason: 'screenshots run against staging only (API_URL=$_api)');
    _answerNativePrompts(binding.defaultBinaryMessenger);

    final driverToken = await _driverToken();
    final passengerToken = await _passengerToken();
    // Clean start: driver offline, no ride left by an earlier run.
    await _cancelActiveRide(passengerToken);
    await _call('PATCH', '/drivers/availability', token: driverToken, body: {'isAvailable': false});

    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('auth_token', driverToken);
    await prefs.setInt('session_unlocked_at_ms', DateTime.now().millisecondsSinceEpoch);
    await prefs.setString('user_phone', _driverPhone);

    await runMovaDriverApp();
    await _run(tester, const Duration(seconds: 10));
    await _shot('00-diag-start');

    try {
      // The animated welcome screen waits for a tap (« Touchez l'écran pour continuer »).
      for (var i = 0; i < 20 && find.text('Disponibilité').evaluate().isEmpty; i++) {
        final splash = find.textContaining("Touchez l'écran");
        if (splash.evaluate().isNotEmpty) await tester.tap(splash.first, warnIfMissed: false);
        await _run(tester, const Duration(seconds: 2));
      }
      expect(find.text('Disponibilité'), findsWidgets, reason: 'driver home screen');
      await _run(tester, const Duration(seconds: 3));

      // 1) Go online with the real availability switch.
      for (var i = 0; i < 3 && find.text('En ligne').evaluate().isEmpty; i++) {
        await tester.tap(find.byType(Switch).first);
        await _run(tester, const Duration(seconds: 6));
      }
      _dumpTexts('after going online');
      await _shot('00-diag-online');

      // 2) A seed passenger books a ride next to the driver → real offer screen.
      final ride = await _call('POST', '/rides', token: passengerToken, body: {
        'pickupLat': _lat + 0.002,
        'pickupLng': _lng + 0.002,
        'dropoffLat': -4.3389,
        'dropoffLng': 15.3446,
        'vehicleType': 'STANDARD',
        'pickupAddress': 'Gombe, Boulevard du 30 Juin',
        'dropoffAddress': 'Limete, 7e Rue',
      });
      final rideId = ride['id']?.toString() ?? '';
      debugPrint('[screens] ride ${rideId.isEmpty ? ride : rideId}');
      // Start the driver search (dispatch), like the passenger app does after booking.
      if (rideId.isNotEmpty) await _call('POST', '/rides/$rideId/search', token: passengerToken, body: {});
      final offered = await _waitFor(tester, find.byType(RideOfferScreen), const Duration(seconds: 75));
      await _run(tester, const Duration(seconds: 2));
      await _shot(offered ? '02-nouvelle-course' : '00-diag-no-offer');

      // 3) Decline, cancel the booking, back on the online home screen.
      if (offered) {
        final decline = find.text('Refuser');
        if (decline.evaluate().isNotEmpty) await tester.tap(decline.first);
      }
      await _cancelActiveRide(passengerToken);
      await _run(tester, const Duration(seconds: 8));
      await _shot('01-en-ligne');

      // 4) Earnings and 5) trip history, opened like the home-screen shortcuts do.
      unawaited(movaNavigatorKey.currentState!.push(MaterialPageRoute<void>(builder: (_) => const EarningsScreen())));
      await _run(tester, const Duration(seconds: 8));
      await _shot('03-revenus');
      movaNavigatorKey.currentState!.pop();
      await _run(tester, const Duration(seconds: 2));

      unawaited(movaNavigatorKey.currentState!.push(
        MaterialPageRoute<void>(builder: (_) => const DriverRideHistoryScreen()),
      ));
      await _run(tester, const Duration(seconds: 8));
      await _shot('04-historique');
      movaNavigatorKey.currentState!.pop();
      await _run(tester, const Duration(seconds: 2));
    } finally {
      await _cancelActiveRide(passengerToken);
      await _call('PATCH', '/drivers/availability', token: driverToken, body: {'isAvailable': false});
      await _call('POST', '/auth/logout', token: passengerToken);
    }
  });
}

import 'dart:convert';

import 'package:flutter_foreground_task/flutter_foreground_task.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import 'driver_job_alert_service.dart';

const _prefsKnownJobs = 'driver_known_job_keys';

/// Polling en arrière-plan (Android) quand le chauffeur est en ligne.
@pragma('vm:entry-point')
void driverBackgroundStartCallback() {
  FlutterForegroundTask.setTaskHandler(_DriverJobTaskHandler());
}

class _DriverJobTaskHandler extends TaskHandler {
  @override
  Future<void> onStart(DateTime timestamp, TaskStarter starter) async {}

  @override
  void onRepeatEvent(DateTime timestamp) {
    _pollJobs();
  }

  @override
  Future<void> onDestroy(DateTime timestamp, bool isTimeout) async {}

  @override
  void onReceiveData(Object data) {}

  Future<void> _pollJobs() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('auth_token');
    if (token == null || token.isEmpty) return;

    const apiBase = String.fromEnvironment('API_URL', defaultValue: 'http://10.0.2.2:3000/api');
    final gateway = apiBase.endsWith('/api') ? apiBase.substring(0, apiBase.length - 4) : apiBase;
    final headers = {
      'Authorization': 'Bearer $token',
      'Content-Type': 'application/json',
    };

    final known = (prefs.getStringList(_prefsKnownJobs) ?? []).toSet();
    final discovered = <String>{};

    Future<void> checkEndpoint(
      String path,
      String kind,
      String offerKind,
      String Function(Map<String, dynamic>) message,
    ) async {
      try {
        final res = await http.get(Uri.parse('$gateway$path'), headers: headers).timeout(const Duration(seconds: 10));
        if (res.statusCode != 200) return;
        final body = jsonDecode(res.body) as Map<String, dynamic>;
        final rows = (body['data'] as List? ?? body['offers'] as List? ?? []).cast<Map<String, dynamic>>();
        for (final row in rows) {
          final id = row['id']?.toString();
          if (id == null || id.isEmpty) continue;
          final key = kind == 'offer'
              ? DriverJobAlertService.offerKey(offerKind, id)
              : DriverJobAlertService.missionKey(row);
          discovered.add(key);
          if (!known.contains(key)) {
            await DriverJobAlertService.notify(
              title: kind == 'offer' ? 'Nouvelle offre MOVA' : 'Nouvelle mission MOVA',
              body: message(row),
              payload: key,
            );
          }
        }
      } catch (_) {}
    }

    await checkEndpoint('/api/moving/assignments', 'mission', '', (_) => 'Nouvelle mission déménagement');
    await checkEndpoint('/api/rides/scheduled/assignments', 'mission', '', (_) => 'Nouvelle course planifiée');
    await checkEndpoint('/api/deliveries/assignments', 'mission', '', (_) => 'Nouvelle mission livraison');
    await checkEndpoint('/api/rental/assignments', 'mission', '', (_) => 'Nouvelle mission location');
    await checkEndpoint('/api/rides/offers', 'offer', 'ride', DriverJobAlertService.rideOfferMessage);
    await checkEndpoint('/api/deliveries/offers', 'offer', 'delivery', DriverJobAlertService.deliveryOfferMessage);

    if (discovered.isNotEmpty) {
      final merged = {...known, ...discovered}.toList();
      await prefs.setStringList(_prefsKnownJobs, merged);
    }
  }
}

class DriverBackgroundService {
  DriverBackgroundService._();

  static Future<void> init() async {
    FlutterForegroundTask.init(
      androidNotificationOptions: AndroidNotificationOptions(
        channelId: 'mova_driver_online',
        channelName: 'MOVA Driver en ligne',
        channelDescription: 'Recherche de courses et missions en arrière-plan',
        onlyAlertOnce: true,
      ),
      iosNotificationOptions: const IOSNotificationOptions(),
      foregroundTaskOptions: ForegroundTaskOptions(
        eventAction: ForegroundTaskEventAction.repeat(5000),
        autoRunOnBoot: false,
        allowWakeLock: true,
        allowWifiLock: true,
      ),
    );
  }

  static Future<void> start() async {
    await init();
    if (await FlutterForegroundTask.isRunningService) return;
    await FlutterForegroundTask.startService(
      serviceId: 1001,
      notificationTitle: 'MOVA Driver',
      notificationText: 'En ligne — recherche de courses et missions',
      callback: driverBackgroundStartCallback,
    );
  }

  static Future<void> stop() async {
    if (!await FlutterForegroundTask.isRunningService) return;
    await FlutterForegroundTask.stopService();
  }
}

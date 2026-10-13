import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../core/api/api_client.dart';
import '../../core/config/app_version.dart';
import '../../core/error/result.dart';
import '../driver/driver_job_alert_service.dart';
import '../passenger/passenger_alert_service.dart';
import 'call_ring_service.dart';
import 'chat_alert_service.dart';

/// Poll léger des notifications serveur pour afficher une bannière chat / SOS
/// même hors écran dédié, sans dépendre de FCM (fonctionne tant que l'app tourne).
///
/// Le premier passage mémorise les notifications existantes sans alerter (évite
/// un flot au démarrage) ; ensuite les nouvelles `CHAT_MESSAGE` / `INCIDENT_CREATED`
/// (SOS) non lues déclenchent une bannière locale.
class ChatPollService {
  ChatPollService(this._api);

  final ApiClient _api;
  Timer? _timer;
  bool _primed = false;
  bool _inFlight = false;
  final Set<String> _seenNotificationIds = <String>{};

  static const _interval = Duration(seconds: 8);

  void start() {
    if (_timer != null) return;
    unawaited(_poll());
    _timer = Timer.periodic(_interval, (_) => unawaited(_poll()));
  }

  /// Poll immédiat (ex. reprise de l'app) sans attendre le prochain tick.
  void poke() => unawaited(_poll());

  void stop() {
    _timer?.cancel();
    _timer = null;
  }

  Future<void> _poll() async {
    if (_inFlight) return;
    _inFlight = true;
    try {
      if (_api.isMockMode) return;
      final token = await _api.authToken();
      if (token == null || token.isEmpty) return;

      final result = await _api.getNotifications();
      if (result is! Success<List<Map<String, dynamic>>>) return;
      final items = result.data;

      for (final n in items) {
        final id = n['id']?.toString();
        if (id == null) continue;
        final isChat = n['type']?.toString() == 'CHAT_MESSAGE';

        // Amorçage : mémoriser l'existant sans alerter.
        if (!_primed) {
          _seenNotificationIds.add(id);
          continue;
        }
        if (_seenNotificationIds.contains(id)) continue;
        _seenNotificationIds.add(id);
        if (n['read'] == true) continue;

        final type = n['type']?.toString() ?? '';
        if (type == 'INCIDENT_CREATED') {
          final title = n['title']?.toString() ?? 'Alerte SOS';
          final body = n['body']?.toString() ?? 'Urgence signalée sur SENGA';
          if (AppFlavor.isDriver) {
            await DriverJobAlertService.notify(title: title, body: body, payload: 'SOS');
          } else {
            await PassengerAlertService.notify(title: title, body: body);
          }
          continue;
        }

        if (!isChat) continue;

        final data = (n['data'] is Map) ? n['data'] as Map : const {};
        final kind = data['kind']?.toString() ?? 'ride';
        final threadId = data['threadId']?.toString() ?? '';
        final messageId = data['messageId']?.toString();

        final body = n['body']?.toString() ?? '';
        if (body.contains('Appel vocal SENGA') && threadId.isNotEmpty) {
          final myId = await _api.currentUserId();
          final starterId = data['senderId']?.toString() ??
              data['starterId']?.toString() ??
              '';
          await CallRingService.startIncoming(
            deliveryId: threadId,
            starterId: starterId,
            myUserId: myId,
            peerLabel: 'Contact',
            fromRealtime: false,
          );
        }

        await ChatAlertService.notifyFromServer(
          kind: kind,
          threadId: threadId,
          messageId: messageId,
          title: n['title']?.toString() ?? 'Message SENGA',
          body: body,
        );
      }
      _primed = true;

      // Borne mémoire : conserver les ids récents.
      if (_seenNotificationIds.length > 500) {
        _seenNotificationIds.clear();
        _primed = false;
      }
    } catch (e) {
      if (kDebugMode) debugPrint('ChatPollService: $e');
    } finally {
      _inFlight = false;
    }
  }
}

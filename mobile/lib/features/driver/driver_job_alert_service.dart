import 'dart:async';

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import '../../core/config/market_config.dart';
import '../../core/billing/driver_earnings_display.dart';
import '../../core/geo/geo_utils.dart';
import 'driver_alert_prefs.dart';

/// Alertes chauffeur : vibration + **son SENGA dédié** (ou son système / mute).
///
/// Android : canaux distincts (le son d’un canal est immuable après création).
/// iOS : `senga_job.wav` ou son par défaut / silencieux selon les prefs.
///
/// En premier plan, beaucoup d’Android restent muets sur les notifs locales :
/// on joue donc aussi le WAV via [AudioPlayer] (comme le portail partenaire).
///
/// Important : si le canal / son SENGA échoue (OEM, raw manquant, etc.), on
/// retombe sur le canal système pour que la course/livraison reste visible.
class DriverJobAlertService {
  DriverJobAlertService._();

  static final FlutterLocalNotificationsPlugin _plugin = FlutterLocalNotificationsPlugin();
  static final AudioPlayer _player = AudioPlayer();
  static bool _initialized = false;
  static int _notificationId = 0;

  /// v4 : fallback robuste si le canal SENGA casse la publication de la notif.
  static const _channelSengaId = 'mova_driver_jobs_v4';
  static const _channelSystemId = 'mova_driver_jobs_system_v2';
  static const _channelSilentId = 'mova_driver_jobs_silent_v2';
  static const _channelName = 'Missions & courses SENGA';
  static const _androidSound = RawResourceAndroidNotificationSound('senga_job');
  static const _iosSound = 'senga_job.wav';
  static const _assetSound = 'sounds/senga_job.wav';

  static Future<void> init() async {
    if (_initialized) return;

    const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
    const darwinInit = DarwinInitializationSettings();
    await _plugin.initialize(
      settings: const InitializationSettings(android: androidInit, iOS: darwinInit),
    );

    final androidPlugin =
        _plugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
    final vibration = Int64List.fromList([0, 450, 180, 450]);

    // Créer d’abord les canaux « sûrs », puis SENGA — un échec SENGA ne doit
    // pas empêcher les alertes avec son téléphone.
    await androidPlugin?.createNotificationChannel(
      AndroidNotificationChannel(
        _channelSystemId,
        '$_channelName (son téléphone)',
        description: 'Missions avec le son de notification système',
        importance: Importance.max,
        playSound: true,
        enableVibration: true,
        vibrationPattern: vibration,
        audioAttributesUsage: AudioAttributesUsage.notification,
      ),
    );
    await androidPlugin?.createNotificationChannel(
      AndroidNotificationChannel(
        _channelSilentId,
        '$_channelName (sans son)',
        description: 'Missions en vibration seule (son coupé dans l’app)',
        importance: Importance.max,
        playSound: false,
        enableVibration: true,
        vibrationPattern: vibration,
        audioAttributesUsage: AudioAttributesUsage.notification,
      ),
    );
    try {
      await androidPlugin?.createNotificationChannel(
        AndroidNotificationChannel(
          _channelSengaId,
          _channelName,
          description: 'Nouvelles courses, livraisons et missions — son SENGA',
          importance: Importance.max,
          playSound: true,
          sound: _androidSound,
          enableVibration: true,
          vibrationPattern: vibration,
          audioAttributesUsage: AudioAttributesUsage.notification,
        ),
      );
    } catch (e) {
      if (kDebugMode) debugPrint('Canal SENGA indisponible, fallback système : $e');
    }

    await androidPlugin?.requestNotificationsPermission();
    await DriverAlertPrefs.ensureLoaded();
    try {
      await _player.setReleaseMode(ReleaseMode.stop);
      await _player.setPlayerMode(PlayerMode.lowLatency);
    } catch (_) {
      /* ignore */
    }
    _initialized = true;
  }

  /// Joue le WAV SENGA dans l’app (volume média) — fiable au premier plan.
  static Future<void> playSengaSound() async {
    try {
      await _player.stop();
      await _player.play(AssetSource(_assetSound), volume: 1.0);
    } catch (e) {
      if (kDebugMode) debugPrint('Lecture son SENGA (in-app) échouée : $e');
    }
  }

  static Future<void> notify({
    required String title,
    required String body,
    String? payload,
  }) async {
    await init();
    await DriverAlertPrefs.ensureLoaded();
    final muted = DriverAlertPrefs.muted;
    final style = DriverAlertPrefs.style;

    try {
      await HapticFeedback.heavyImpact();
      await Future<void>.delayed(const Duration(milliseconds: 100));
      await HapticFeedback.heavyImpact();
    } catch (_) {
      /* ignore — haptics absents en isolate background */
    }

    final preferSenga = !muted && style == DriverAlertSoundStyle.senga;
    final channelId = muted
        ? _channelSilentId
        : (preferSenga ? _channelSengaId : _channelSystemId);
    final playSound = !muted;

    final id = ++_notificationId;
    final shown = await _showSafe(
      id: id,
      title: title,
      body: body,
      payload: payload,
      channelId: channelId,
      playSound: playSound,
      useSengaSound: preferSenga,
    );

    // Si le canal SENGA empêche l’affichage, republier sans son custom.
    if (!shown && preferSenga) {
      await _showSafe(
        id: id,
        title: title,
        body: body,
        payload: payload,
        channelId: _channelSystemId,
        playSound: true,
        useSengaSound: false,
      );
    }

    // Son in-app après la notif (ne doit jamais bloquer / remplacer le push).
    if (preferSenga) {
      unawaited(playSengaSound());
    }
  }

  static Future<bool> _showSafe({
    required int id,
    required String title,
    required String body,
    required String? payload,
    required String channelId,
    required bool playSound,
    required bool useSengaSound,
  }) async {
    try {
      await _plugin.show(
        id: id,
        title: title,
        body: body,
        notificationDetails: NotificationDetails(
          android: AndroidNotificationDetails(
            channelId,
            _channelName,
            channelDescription: 'Alertes chauffeur SENGA',
            importance: Importance.max,
            priority: Priority.max,
            category: AndroidNotificationCategory.message,
            playSound: playSound,
            // Le son est déjà sur le canal ; le repasser ici casse certains OEM.
            sound: null,
            enableVibration: true,
            vibrationPattern: Int64List.fromList([0, 450, 180, 450]),
            audioAttributesUsage: AudioAttributesUsage.notification,
            ticker: title,
          ),
          iOS: DarwinNotificationDetails(
            presentAlert: true,
            presentBadge: true,
            presentSound: playSound,
            sound: useSengaSound ? _iosSound : null,
            interruptionLevel: InterruptionLevel.timeSensitive,
          ),
        ),
        payload: payload,
      );
      return true;
    } catch (e) {
      if (kDebugMode) {
        debugPrint('Notification locale échouée (canal=$channelId, senga=$useSengaSound) : $e');
      }
      return false;
    }
  }

  static String missionKey(Map<String, dynamic> mission) {
    final id = mission['id']?.toString() ?? '';
    final type = mission['type']?.toString() ?? 'MISSION';
    return '$type:$id';
  }

  static String offerKey(String kind, String id) => '$kind:$id';

  static String messageForMissions(List<Map<String, dynamic>> missions) {
    if (missions.isEmpty) return 'Nouvelle mission assignée';
    if (missions.length > 1) return '${missions.length} nouvelles missions assignées';
    final m = missions.first;
    final label = m['label']?.toString() ??
        switch (m['type']?.toString()) {
          'RENTAL' => 'Location véhicule',
          'MOVING' => 'Déménagement',
          'SCHEDULED' => 'Course planifiée',
          'ERRAND' => 'Courses & commissions',
          _ => 'Mission',
        };
    return 'Nouvelle mission : $label';
  }

  static String rideOfferMessage(Map<String, dynamic> offer) {
    final pickup = offer['pickupAddress']?.toString() ?? 'près de vous';
    final driverNet = DriverEarningsDisplay.netFromMap(offer);
    final pickupKm = (offer['distanceToPickupKm'] as num?)?.toDouble();
    final dist = pickupKm != null ? ' · ${GeoUtils.formatDistanceKm(pickupKm)}' : '';
    if (driverNet != null) return 'Course · $pickup$dist · ${MarketConfig.formatCdf(driverNet)}';
    return 'Nouvelle course disponible · $pickup$dist';
  }

  static String deliveryOfferMessage(Map<String, dynamic> offer) {
    final kind = offer['type']?.toString() ?? offer['deliveryType']?.toString() ?? 'Livraison';
    final pickup = offer['pickupAddress']?.toString() ?? '';
    final driverNet = DriverEarningsDisplay.netFromMap(offer);
    final pickupKm = (offer['distanceToPickupKm'] as num?)?.toDouble();
    final tripKm =
        (offer['tripDistanceKm'] as num?)?.toDouble() ?? (offer['distanceKm'] as num?)?.toDouble();
    final parts = <String>[kind];
    if (pickup.isNotEmpty) parts.add(pickup);
    if (pickupKm != null) parts.add('à ${GeoUtils.formatDistanceKm(pickupKm)}');
    if (tripKm != null) parts.add('trajet ${GeoUtils.formatDistanceKm(tripKm)}');
    if (driverNet != null) parts.add(MarketConfig.formatCdf(driverNet));
    return parts.join(' · ');
  }
}

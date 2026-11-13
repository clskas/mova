import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/config/client_apps_config.dart';
import '../../core/api/api_client.dart';
import '../../core/voice/voice_command_button.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/geo/geo_utils.dart';
import '../../core/billing/driver_earnings_display.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_widgets.dart';
import 'active_ride_screen.dart';
import 'driver_alert_prefs.dart';
import 'driver_job_alert_service.dart';
import 'widgets/passenger_rating_badge.dart';
import '../../core/location/location_permission.dart';
import '../../core/i18n/i18n.dart';

class RideOfferScreen extends ConsumerStatefulWidget {
  const RideOfferScreen({
    super.key,
    required this.offer,
    this.vehicleId,
  });

  final Map<String, dynamic> offer;
  final String? vehicleId;

  @override
  ConsumerState<RideOfferScreen> createState() => _RideOfferScreenState();
}

class _RideOfferScreenState extends ConsumerState<RideOfferScreen> {
  int _countdown = 30;
  bool _loading = false;
  String? _error;
  Timer? _timer;
  Timer? _statusPollTimer;
  StreamSubscription<DriverJobStopEvent>? _jobStopSub;
  double? _pickupDistanceKm;
  int? _pickupEtaMin;
  bool _closingForCancel = false;
  bool _voiceListening = false;
  // Passenger note (offers list, refreshed by the status poll for push offers).
  late double? _passengerRating = PassengerRatingBadge.ratingFrom(widget.offer);
  late int _passengerRatingCount = PassengerRatingBadge.countFrom(widget.offer);

  String get _rideId => widget.offer['id']?.toString() ?? '';

  @override
  void initState() {
    super.initState();
    _resolvePickupProximity();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      if (_countdown <= 0) {
        _timer?.cancel();
        _expireOffer();
        return;
      }
      setState(() => _countdown--);
    });
    _statusPollTimer = Timer.periodic(const Duration(seconds: 1), (_) => _pollRideStillOpen());
    _jobStopSub = DriverJobAlertService.onJobStop.listen((ev) {
      if (_closingForCancel || !mounted) return;
      final matchesId = ev.referenceId == _rideId;
      final matchesKey = ev.offerKey == DriverJobAlertService.offerKey('ride', _rideId);
      if (!matchesId && !matchesKey) return;
      if (ev.reason == 'taken') {
        _timer?.cancel();
        _statusPollTimer?.cancel();
        Navigator.pop(context, 'taken');
      } else {
        _closeAsCancelled();
      }
    });
    WidgetsBinding.instance.addPostFrameCallback((_) => _pollRideStillOpen());
  }

  @override
  void dispose() {
    _jobStopSub?.cancel();
    _timer?.cancel();
    _statusPollTimer?.cancel();
    super.dispose();
  }

  /// Si le passager annule pendant l'affichage de l'offre, fermer immédiatement.
  Future<void> _pollRideStillOpen() async {
    if (_closingForCancel || _loading || !mounted || _rideId.isEmpty) return;
    final api = ref.read(apiClientProvider);
    final result = await api.getRide(_rideId);
    if (!mounted || _closingForCancel) return;
    if (result case Success(:final data)) {
      if (data.containsKey('passengerRatingCount') &&
          (PassengerRatingBadge.countFrom(data) != _passengerRatingCount ||
              PassengerRatingBadge.ratingFrom(data) != _passengerRating)) {
        setState(() {
          _passengerRating = PassengerRatingBadge.ratingFrom(data);
          _passengerRatingCount = PassengerRatingBadge.countFrom(data);
        });
      }
      final status = (data['status']?.toString() ?? '').toUpperCase();
      if (status == 'CANCELLED' || status == 'CANCELED') {
        _closeAsCancelled();
      } else if (status.isNotEmpty &&
          status != 'SEARCHING' &&
          status != 'MATCHING' &&
          status != 'REQUESTED') {
        // Déjà prise / autre état — fermer sans message d'erreur générique.
        _timer?.cancel();
        _statusPollTimer?.cancel();
        if (mounted) Navigator.pop(context, 'taken');
      }
    }
  }

  void _closeAsCancelled() {
    if (_closingForCancel || !mounted) return;
    _closingForCancel = true;
    _timer?.cancel();
    _statusPollTimer?.cancel();
    // Couper la sonnerie immédiatement (ne pas attendre le pop du parent).
    unawaited(
      DriverJobAlertService.stopRinging(
        offerKey: DriverJobAlertService.offerKey('ride', _rideId),
      ),
    );
    Navigator.pop(context, 'cancelled');
  }

  /// Le compte à rebours a expiré sans réponse du chauffeur.
  /// On ne rejette PAS la course (pas de DRIVER_REJECTED permanent) afin
  /// qu'elle puisse être re-proposée plus tard. On renvoie 'timeout' pour
  /// que le tableau de bord ne fasse qu'une mise en veille temporaire.
  Future<void> _expireOffer() async {
    if (mounted) Navigator.pop(context, 'timeout');
  }

  /// Distance/ETA chauffeur → client (point de prise en charge).
  /// Priorité au calcul backend (distanceToPickupKm), sinon GPS local.
  Future<void> _resolvePickupProximity() async {
    final backendKm = (widget.offer['distanceToPickupKm'] as num?)?.toDouble();
    if (backendKm != null && backendKm > 0) {
      setState(() {
        _pickupDistanceKm = backendKm;
        _pickupEtaMin = GeoUtils.etaMinutesFromDistanceKm(backendKm);
      });
      return;
    }
    final pickupLat = (widget.offer['pickupLat'] as num?)?.toDouble();
    final pickupLng = (widget.offer['pickupLng'] as num?)?.toDouble();
    if (pickupLat == null || pickupLng == null) return;
    try {
      if (!await Geolocator.isLocationServiceEnabled()) return;
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await LocationPermissionGate.request();
      }
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        return;
      }
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 8),
        ),
      );
      if (!mounted) return;
      final km = GeoUtils.haversineKm(pos.latitude, pos.longitude, pickupLat, pickupLng);
      setState(() {
        _pickupDistanceKm = km;
        _pickupEtaMin = GeoUtils.etaMinutesFromDistanceKm(km);
      });
    } catch (_) {
      /* GPS indisponible — on n'affiche simplement pas la proximité */
    }
  }

  Future<void> _accept() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final api = ref.read(apiClientProvider);
    final result = await api.acceptRide(_rideId, vehicleId: widget.vehicleId);
    if (!mounted) return;
    setState(() => _loading = false);
    switch (result) {
      case Success(:final data):
        _timer?.cancel();
        _statusPollTimer?.cancel();
        await DriverJobAlertService.stopRinging(
          offerKey: DriverJobAlertService.offerKey('ride', _rideId),
        );
        if (!mounted) return;
        // Remonter l’accueil avec la course acceptée pour renseigner _activeRide,
        // puis ouvrir ActiveRideScreen (évite un écran fantôme si annulation).
        Navigator.pop(context, data);
      case Failure(:final error):
        final msg = error.message;
        final looksInvalidStatus = msg.contains('Statut de course invalide') ||
            msg.contains('n’est plus à l’étape') ||
            msg.contains('n\'est plus à l\'étape') ||
            msg.contains('déjà terminée') ||
            msg.contains('déjà annulée');
        if (looksInvalidStatus) {
          final rideResult = await api.getRide(_rideId);
          if (!mounted) return;
          if (rideResult case Success(:final data)) {
            final status = (data['status']?.toString() ?? '').toUpperCase();
            if (status == 'CANCELLED' || status == 'CANCELED') {
              _closeAsCancelled();
              return;
            }
          }
          setState(() => _error = tr('Course annulée ou déjà prise.'));
          return;
        }
        setState(() => _error = msg);
    }
  }

  void _onAutoListenChanged(bool listening) {
    if (listening) {
      unawaited(DriverJobAlertService.pauseRingForVoice());
    } else if (mounted && !_loading && !_closingForCancel) {
      // Nothing understood: the offer keeps ringing.
      unawaited(DriverJobAlertService.resumeRingAfterVoice());
    }
    if (mounted) setState(() => _voiceListening = listening);
  }

  Future<void> _onOfferVoice(String text) async {
    final intent = parseDriverVoiceIntent(text);
    if (intent == DriverVoiceIntent.accept) return _accept();
    if (intent == DriverVoiceIntent.reject) return _reject();
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(trf('Commande non reconnue : « {text} ». Dites « accepter » ou « refuser ».', {'text': text}))),
    );
  }

  Future<void> _reject() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final api = ref.read(apiClientProvider);
    final result = await api.rejectRide(_rideId);
    if (!mounted) return;
    setState(() => _loading = false);
    switch (result) {
      case Success():
        _timer?.cancel();
        _statusPollTimer?.cancel();
        Navigator.pop(context, 'rejected');
      case Failure(:final error):
        final msg = error.message;
        // Offre déjà annulée / prise / refusée : toujours fermer (fenêtre fantôme).
        if (msg.contains('Statut de course invalide') ||
            msg.contains('n’est plus à l’étape') ||
            msg.contains('n\'est plus à l\'étape') ||
            msg.contains('déjà terminée') ||
            msg.contains('déjà annulée') ||
            msg.contains('annul') ||
            msg.contains('CANCEL') ||
            msg.toLowerCase().contains('not found') ||
            msg.contains('404')) {
          _closeAsCancelled();
          return;
        }
        setState(() => _error = msg);
    }
  }

  Future<void> _openNavigation() async {
    final lat = widget.offer['pickupLat'] as num?;
    final lng = widget.offer['pickupLng'] as num?;
    if (lat == null || lng == null) return;
    final url = 'https://www.google.com/maps/dir/?api=1&destination=$lat,$lng';
    if (await canLaunchUrl(Uri.parse(url))) {
      await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    }
  }

  @override
  Widget build(BuildContext context) {
    final driverNet = DriverEarningsDisplay.netFromMap(widget.offer);
    final distance = widget.offer['tripDistanceKm'] as num? ?? widget.offer['distanceKm'] as num?;
    final pickup = widget.offer['pickupAddress']?.toString() ?? tr('Point de départ');
    final dropoff = widget.offer['dropoffAddress']?.toString() ?? tr('Destination');
    final vehicleType = widget.offer['vehicleType']?.toString() ?? 'Moto-taxi';
    final progress = _countdown / 30.0;

    return Scaffold(
      backgroundColor: MovaColors.midnight,
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              child: Row(
                children: [
                  IconButton(
                    icon: const Icon(Icons.close, color: Colors.white70),
                    onPressed: _loading ? null : _reject,
                  ),
                  Expanded(
                    child: Text(
                      tr('Nouvelle course'),
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w600),
                    ),
                  ),
                  const SizedBox(width: 48),
                ],
              ),
            ),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Stack(
                      alignment: Alignment.center,
                      children: [
                        SizedBox(
                          width: 120,
                          height: 120,
                          child: CircularProgressIndicator(
                            value: progress,
                            strokeWidth: 6,
                            color: MovaColors.orange,
                            backgroundColor: Colors.white12,
                          ),
                        ),
                        Text(
                          '$_countdown',
                          style: const TextStyle(
                            color: MovaColors.orange,
                            fontSize: 36,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 32),
                    Text(
                      driverNet != null ? MarketConfig.formatCdf(driverNet) : '—',
                      style: const TextStyle(
                        color: MovaColors.green,
                        fontSize: 42,
                        fontWeight: FontWeight.bold,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      textAlign: TextAlign.center,
                    ),
                    Text(
                      DriverEarningsDisplay.serviceNetLabel(
                        data: widget.offer,
                        type: widget.offer['type']?.toString() ?? 'RIDE',
                      ),
                      style: TextStyle(color: Colors.white.withValues(alpha: 0.55), fontSize: 13),
                    ),
                    const SizedBox(height: 10),
                    PassengerRatingBadge(
                      rating: _passengerRating,
                      count: _passengerRatingCount,
                      onDark: true,
                    ),
                    if (passengerCountLabel(widget.offer['passengerCount']) != null) ...[
                      const SizedBox(height: 10),
                      Container(
                        key: const Key('offerPassengerCount'),
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                        decoration: BoxDecoration(
                          color: MovaColors.green.withValues(alpha: 0.25),
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(color: MovaColors.green.withValues(alpha: 0.5)),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.people_alt, color: Colors.white, size: 16),
                            const SizedBox(width: 6),
                            Text(
                              passengerCountLabel(widget.offer['passengerCount'])!,
                              style: const TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w700,
                                fontSize: 13,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                    if (widget.offer['roundTrip'] == true) ...[
                      const SizedBox(height: 10),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                        decoration: BoxDecoration(
                          color: MovaColors.violet.withValues(alpha: 0.25),
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(color: MovaColors.violet.withValues(alpha: 0.5)),
                        ),
                        child: Text(
                          tr('Aller-retour'),
                          style: TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w700,
                            fontSize: 13,
                          ),
                        ),
                      ),
                    ],
                    if (distance != null) ...[
                      const SizedBox(height: 4),
                      Wrap(
                        alignment: WrapAlignment.center,
                        spacing: 4,
                        runSpacing: 4,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          Text(
                            trf('Trajet {v1}', {'v1': GeoUtils.formatDistanceKm(distance.toDouble())}),
                            style: const TextStyle(color: Colors.white70, fontSize: 15),
                          ),
                          Text(
                            '· $vehicleType',
                            style: const TextStyle(color: Colors.white70, fontSize: 15),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ),
                    ],
                    if (_pickupDistanceKm != null) ...[
                      const SizedBox(height: 14),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                        decoration: BoxDecoration(
                          color: MovaColors.orange.withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: MovaColors.orange.withValues(alpha: 0.5)),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.directions_car, color: MovaColors.orange, size: 20),
                            const SizedBox(width: 8),
                            Flexible(
                              child: Text(
                                trf('Client à {v1}{v2}', {'v1': GeoUtils.formatDistanceKm(_pickupDistanceKm!), 'v2': _pickupEtaMin != null ? trf(' · ~{_pickupEtaMin} min', {'_pickupEtaMin': _pickupEtaMin}) : ''}),
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 16,
                                  fontWeight: FontWeight.w700,
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                    const SizedBox(height: 32),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(20),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.08),
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Icon(Icons.trip_origin, color: MovaColors.green, size: 20),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Text(
                                  pickup,
                                  style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w600),
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                            ],
                          ),
                          Padding(
                            padding: const EdgeInsets.only(left: 9, top: 4, bottom: 4),
                            child: Container(width: 2, height: 24, color: Colors.white24),
                          ),
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Icon(Icons.location_on, color: MovaColors.violet, size: 20),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Text(
                                  dropoff,
                                  style: const TextStyle(color: Colors.white70, fontSize: 15),
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    if (_error != null) ...[
                      const SizedBox(height: 16),
                      MovaErrorBanner(message: _error!),
                    ],
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      VoiceCommandButton(
                        onText: _onOfferVoice,
                        color: Colors.white,
                        hint: tr('Dites « accepter » ou « refuser »'),
                        autoListen: DriverAlertPrefs.voiceAutoListen,
                        onAutoListenChanged: _onAutoListenChanged,
                      ),
                      Flexible(
                        child: Text(
                          _voiceListening ? tr('Je vous écoute : « accepter » ou « refuser »') : tr('Répondre à la voix'),
                          style: TextStyle(
                            color: _voiceListening ? Colors.white : Colors.white.withValues(alpha: 0.7),
                            fontSize: 13,
                            fontWeight: _voiceListening ? FontWeight.w600 : FontWeight.normal,
                          ),
                        ),
                      ),
                    ],
                  ),
                  SizedBox(
                    width: double.infinity,
                    child: MovaButton(
                      label: tr('Accepter la course'),
                      icon: Icons.check_circle_outline,
                      isLoading: _loading,
                      onPressed: _loading ? null : _accept,
                    ),
                  ),
                  const SizedBox(height: 10),
                  SizedBox(
                    width: double.infinity,
                    child: MovaButton(
                      label: tr('Refuser'),
                      isSecondary: true,
                      icon: Icons.close,
                      isLoading: _loading,
                      onPressed: _loading ? null : _reject,
                    ),
                  ),
                  const SizedBox(height: 10),
                  SizedBox(
                    width: double.infinity,
                    child: MovaButton(
                      label: tr('Navigation vers le passager'),
                      isSecondary: true,
                      icon: Icons.navigation_outlined,
                      onPressed: _openNavigation,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

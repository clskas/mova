import '../../core/i18n/i18n_remote.dart';
import '../../core/safety/sos_follow_up.dart';
import '../../core/i18n/i18n.dart';
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import '../../core/config/market_config.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import '../../core/widgets/publicite_carousel.dart';
import '../../core/billing/driver_earnings_display.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/cache/profile_cache.dart';
import '../../core/api/api_client.dart';
import '../../core/api/ride_socket.dart';
import '../../core/auth/session.dart';
import '../../core/offline/connectivity_service.dart';
import '../../core/location/gps_enable_prompt.dart';
import '../../core/location/service_area_gps.dart';
import '../../core/error/result.dart';
import '../../core/geo/geo_utils.dart';
import '../../core/safety/sos_helper.dart';
import '../help/driver_help_screen.dart';
import '../profile/profile_screen.dart';
import '../carpool/carpool_screen.dart';
import 'active_delivery_screen.dart';
import 'active_ride_screen.dart';
import 'driver_onboarding_screen.dart';
import 'driver_earnings_screen.dart';
import 'kyc_screen.dart';
import 'driver_ride_history_screen.dart';
import 'ride_offer_screen.dart';
import 'delivery_offer_screen.dart';
import 'driver_background_service.dart';
import 'driver_job_alert_service.dart';
import 'driver_notification_settings_screen.dart';
import 'driver_moving_mission_screen.dart';
import 'driver_push_service.dart';
import 'driver_rental_mission_screen.dart';
import 'driver_scheduled_mission_screen.dart';
import '../delivery/delivery_payment_state.dart';
import '../notifications/notifications_inbox_screen.dart';
import '../sos/notification_tap_router.dart';
import '../../core/location/location_permission.dart';

enum _DriverMenuAction {
  earnings,
  history,
  carpool,
  dossier,
  inbox,
  notifications,
  profile,
  help,
  incident,
  logout,
}

class DriverHomeScreen extends ConsumerStatefulWidget {
  const DriverHomeScreen({super.key});

  @override
  ConsumerState<DriverHomeScreen> createState() => _DriverHomeScreenState();
}

class _DriverHomeScreenState extends ConsumerState<DriverHomeScreen> with WidgetsBindingObserver {
  bool _available = false;
  bool _bootstrapping = true;
  Map<String, dynamic>? _earnings;
  Map<String, dynamic>? _profile;
  Map<String, dynamic>? _activeRide;
  Map<String, dynamic>? _pendingCashRide;
  Map<String, dynamic>? _pendingCashDelivery;
  Map<String, dynamic>? _activeDelivery;
  bool _cashDeliveryPromptOpen = false;
  String? _availabilityError;
  String? _vehicleId;
  Timer? _offerPollTimer;
  Timer? _cashPollTimer;
  Timer? _locationTimer;
  Timer? _profilePollTimer;
  Timer? _assignmentsPollTimer;
  final Set<String> _dismissedOffers = {};
  // Offres ignorées temporairement (time-out sans réponse) : clé -> instant de mise en veille.
  // Elles réapparaissent automatiquement après [_offerSnoozeDuration].
  final Map<String, DateTime> _snoozedOffers = {};
  static const Duration _offerSnoozeDuration = Duration(seconds: 90);
  static const double _sectionGap = 20;
  static const double _cardLineGap = 8;
  static const double _listItemGap = 14;
  String? _profileError;
  bool _showingOffer = false;
  String? _openOfferKind;
  String? _openOfferId;
  List<Map<String, dynamic>> _rideOffers = [];
  List<Map<String, dynamic>> _deliveryOffers = [];
  List<Map<String, dynamic>> _assignedMissions = [];
  List<Map<String, dynamic>> _scheduledOffers = [];
  List<Map<String, dynamic>> _movingOffers = [];
  String? _acceptingMovingId;
  List<Map<String, dynamic>> _publicites = const [];
  final Set<String> _knownMissionKeys = {};
  final Set<String> _knownOfferKeys = {};
  bool _missionAlertsSeeded = false;
  bool _offerAlertsSeeded = false;
  String? _offersError;
  bool _activationPinDialogOpen = false;
  StreamSubscription<DriverJobStopEvent>? _jobStopSub;

  void _syncOfferSuppression() {
    DriverJobAlertService.suppressNewJobOffers =
        _activeRide != null || _activeDelivery != null;
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    NotificationTapRouter.onJobOfferOpen = _openJobFromNotification;
    _jobStopSub = DriverJobAlertService.onJobStop.listen(_onJobStopEvent);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) GpsEnablePrompt.promptIfNeeded(context);
      unawaited(NotificationTapRouter.flushPendingAndLaunchDetails());
    });
    _bootstrap();
  }

  void _onJobStopEvent(DriverJobStopEvent ev) {
    if (!mounted) return;
    final id = ev.referenceId;
    if (id == null || id.isEmpty) return;
    final kind = ev.kind ??
        (ev.offerKey?.startsWith('delivery:') == true ? 'delivery' : 'ride');
    _dismissedOffers.add('$kind:$id');
    setState(() {
      if (kind == 'delivery') {
        _deliveryOffers = _deliveryOffers.where((o) => o['id']?.toString() != id).toList();
      } else {
        _rideOffers = _rideOffers.where((o) => o['id']?.toString() != id).toList();
      }
    });
    // L'écran d'offre écoute aussi onJobStop et fait le pop — éviter un double pop.
    // Si l'offre n'est pas encore montée mais qu'on sonne encore, couper suffit (handleJobStop).
  }

  @override
  void dispose() {
    if (NotificationTapRouter.onJobOfferOpen == _openJobFromNotification) {
      NotificationTapRouter.onJobOfferOpen = null;
    }
    WidgetsBinding.instance.removeObserver(this);
    _jobStopSub?.cancel();
    DriverJobAlertService.suppressNewJobOffers = false;
    _offerPollTimer?.cancel();
    _cashPollTimer?.cancel();
    _locationTimer?.cancel();
    _profilePollTimer?.cancel();
    _assignmentsPollTimer?.cancel();
    unawaited(DriverJobAlertService.stopRinging());
    super.dispose();
  }

  /// Tap notif FCM / locale (app fermée ou en fond) → écran d'offre.
  ///
  /// Ne jamais appeler [_pollOffers] ici : ce poll ouvre déjà une fenêtre,
  /// puis ce handler en rouvrait une 2ᵉ après fermeture/annulation.
  Future<void> _openJobFromNotification(JobOpenRequest request) async {
    if (!mounted || request.id.isEmpty) return;
    if (_showingOffer) return;
    final hideKey = '${request.kind == 'delivery' ? 'delivery' : 'ride'}:${request.id}';
    if (_isOfferHidden(hideKey)) return;

    // Attendre la fin du bootstrap si besoin.
    for (var i = 0; i < 25 && _bootstrapping && mounted; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 200));
    }
    if (!mounted || _showingOffer) return;

    Map<String, dynamic>? findOffer(List<Map<String, dynamic>> list) {
      for (final o in list) {
        if (o['id']?.toString() == request.id) return o;
      }
      return null;
    }

    if (request.kind == 'delivery') {
      var offer = findOffer(_deliveryOffers);
      if (offer == null) {
        await _refreshRideOffers();
        if (!mounted || _showingOffer) return;
        offer = findOffer(_deliveryOffers);
      }
      if (offer != null) {
        await _openDeliveryOfferPopup(offer);
        return;
      }
    } else {
      var offer = findOffer(_rideOffers);
      if (offer == null) {
        await _refreshRideOffers();
        if (!mounted || _showingOffer) return;
        offer = findOffer(_rideOffers);
      }
      if (offer != null) {
        await _openRideOffer(offer);
        return;
      }
      // Fallback : détail course (peut déjà être assignée).
      final ride = await ref.read(apiClientProvider).getRide(request.id);
      if (!mounted || _showingOffer) return;
      if (ride case Success(:final data)) {
        final status = data['status']?.toString().toUpperCase() ?? '';
        if (status == 'CANCELLED' || status == 'CANCELED' || status == 'COMPLETED') {
          _dismissedOffers.add('ride:${request.id}');
          return;
        }
        if (status == 'SEARCHING' || status == 'REQUESTED' || status == 'PENDING' || status == 'MATCHING') {
          await _openRideOffer(data);
          return;
        }
        setState(() => _activeRide = data);
        await Navigator.push<void>(
          context,
          MaterialPageRoute(builder: (_) => ActiveRideScreen(ride: data)),
        );
      }
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && mounted) {
      GpsEnablePrompt.promptIfNeeded(context);
      final connectivity = ref.read(connectivityServiceProvider);
      connectivity.prepareReconnect();
      ref.read(apiClientProvider).checkHealth(resetFailures: true).then((_) {
        if (mounted) {
          ServiceAreaGps.sync(ref);
          _loadProfile(clearCache: true);
          _loadPendingCashRide();
        }
      });
    }
  }

  bool _readAvailability(Map<String, dynamic> data) {
    final value = data['isAvailable'];
    if (value == true || value == 1 || value == 'true' || value == '1') return true;
    return false;
  }

  Future<void> _bootstrap() async {
    final api = ref.read(apiClientProvider);
    final connectivity = ref.read(connectivityServiceProvider);
    connectivity.prepareReconnect();
    await api.loadToken();
    await api.checkHealth(resetFailures: true);
    await ServiceAreaGps.sync(ref);
    await Future.wait([
      _loadProfile(clearCache: true),
      _loadEarnings(),
      _loadActiveRide(),
      _loadPendingCashRide(),
      _loadActiveDelivery(),
      _loadAssignments(),
      _loadPublicites(),
    ]);
    await _connectDriverCashInbox();
    await DriverJobAlertService.init();
    await DriverPushService.init(ref.read(apiClientProvider));
    unawaited(ref.read(apiClientProvider).syncLanguageToProfile());
    unawaited(SosConfigCache.refresh(ref.read(apiClientProvider)));
    unawaited(refreshLanguageSettings(ref.read(apiClientProvider)));
    if (mounted) {
      setState(() => _bootstrapping = false);
      _startAssignmentsPolling();
      if (_available) {
        _startPolling();
        await DriverBackgroundService.start();
      }
    }
  }

  void _startAssignmentsPolling() {
    _assignmentsPollTimer?.cancel();
    _assignmentsPollTimer = Timer.periodic(const Duration(seconds: 15), (_) => _loadAssignments());
  }

  Future<void> _loadAssignments() async {
    final api = ref.read(apiClientProvider);
    final movingResult = await api.get('/moving/assignments', skipCache: true);
    final scheduledResult = await api.get('/rides/scheduled/assignments', skipCache: true);
    final scheduledOffersResult = await api.get('/rides/scheduled/offers', skipCache: true);
    final errandResult = await api.get('/deliveries/assignments', skipCache: true);
    final rentalResult = await api.get('/rental/assignments', skipCache: true);
    final movingOffersResult = await api.get('/moving/offers', skipCache: true);
    if (!mounted) return;
    final missions = <Map<String, dynamic>>[];
    if (movingResult case Success(:final data)) {
      final rows = (data['data'] as List? ?? []).cast<Map<String, dynamic>>();
      missions.addAll(rows);
    }
    if (scheduledResult case Success(:final data)) {
      final rows = (data['data'] as List? ?? []).cast<Map<String, dynamic>>();
      missions.addAll(rows);
    }
    var scheduledOffers = <Map<String, dynamic>>[];
    if (scheduledOffersResult case Success(:final data)) {
      scheduledOffers = (data['data'] as List? ?? []).cast<Map<String, dynamic>>();
    }
    if (errandResult case Success(:final data)) {
      final rows = (data['data'] as List? ?? []).cast<Map<String, dynamic>>();
      missions.addAll(rows);
    }
    if (rentalResult case Success(:final data)) {
      final rows = (data['data'] as List? ?? []).cast<Map<String, dynamic>>();
      missions.addAll(rows);
    }
    missions.sort((a, b) {
      final aDate = a['startDate']?.toString() ??
          a['scheduledAt']?.toString() ??
          a['createdAt']?.toString() ??
          '';
      final bDate = b['startDate']?.toString() ??
          b['scheduledAt']?.toString() ??
          b['createdAt']?.toString() ??
          '';
      return aDate.compareTo(bDate);
    });
    final newMissions = missions.where((m) {
      final key = DriverJobAlertService.missionKey(m);
      return key.length > 1 && !_knownMissionKeys.contains(key);
    }).toList();
    var movingOffers = <Map<String, dynamic>>[];
    if (movingOffersResult case Success(:final data)) {
      movingOffers = (data['data'] as List? ?? []).cast<Map<String, dynamic>>();
    }
    setState(() {
      _assignedMissions = missions;
      _scheduledOffers = scheduledOffers;
      _movingOffers = movingOffers;
    });
    _knownMissionKeys
      ..clear()
      ..addAll(missions.map(DriverJobAlertService.missionKey).where((k) => k.length > 1));
    if (_missionAlertsSeeded && newMissions.isNotEmpty && mounted) {
      final message = DriverJobAlertService.messageForMissions(newMissions);
      await DriverJobAlertService.notify(title: tr('Mission assignée'), body: message);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(message), duration: const Duration(seconds: 4)),
      );
    }
    _missionAlertsSeeded = true;
    await _loadActiveDelivery();
  }

  Future<void> _acceptMovingOffer(Map<String, dynamic> offer) async {
    final id = offer['id']?.toString();
    if (id == null || id.isEmpty || _acceptingMovingId != null) return;
    final volume = (offer['volumeM3'] as num?)?.ceil();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(tr('Accepter ce déménagement ?')),
        content: Text(
          trf('{v1} → {v2}{v3}\n\nVérifiez que tout tient dans votre véhicule avant d\'accepter.', {'v1': offer['pickupAddress'] ?? '', 'v2': offer['dropoffAddress'] ?? '', 'v3': volume != null ? trf('\n{volume} m³ à transporter.', {'volume': volume}) : ''}),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(tr('Annuler'))),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: Text(tr('Accepter'))),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() => _acceptingMovingId = id);
    final result = await ref.read(apiClientProvider).post('/moving/$id/accept', {});
    if (!mounted) return;
    setState(() => _acceptingMovingId = null);
    switch (result) {
      case Success(:final data):
        final moving = (data['moving'] as Map?)?.cast<String, dynamic>() ?? offer;
        await _loadAssignments();
        if (!mounted) return;
        _openAssignedMission({...moving, 'id': id, 'type': 'MOVING'});
      case Failure(:final error):
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(tr(error.message))));
        await _loadAssignments();
    }
  }

  String _missionStatusLabel(String? status) {
    return switch (status?.toUpperCase()) {
      'ASSIGNED' => tr('Assigné'),
      'CONFIRMED' => tr('Confirmé'),
      'IN_PROGRESS' => tr('En cours'),
      'COMPLETED' => tr('Terminé'),
      'SCHEDULED' => tr('Planifié'),
      'PENDING' => tr('En attente'),
      _ => status ?? '—',
    };
  }

  void _openAssignedMission(Map<String, dynamic> mission) {
    final id = mission['id']?.toString();
    if (id == null || id.isEmpty) return;
    final type = mission['type']?.toString();
    if (type == 'MOVING') {
      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => DriverMovingMissionScreen(movingId: id, initialMission: mission),
        ),
      ).then((_) => _loadAssignments());
      return;
    }
    if (type == 'SCHEDULED') {
      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => DriverScheduledMissionScreen(rideId: id, initialMission: mission),
        ),
      ).then((_) => _loadAssignments());
      return;
    }
    if (type == 'ERRAND') {
      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => ActiveDeliveryScreen(delivery: mission),
        ),
      ).then((_) => _loadAssignments());
      return;
    }
    if (type == 'RENTAL') {
      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => DriverRentalMissionScreen(
            inquiryId: id,
            initialMission: mission,
          ),
        ),
      ).then((_) => _loadAssignments());
    }
  }

  bool _missionIsActionable(Map<String, dynamic> mission) {
    final type = mission['type']?.toString();
    final status = mission['status']?.toString() ?? '';
    if (type == 'ERRAND') return status == 'ASSIGNED' || status == 'IN_PROGRESS';
    if (type == 'RENTAL') return status == 'CONFIRMED' || status == 'IN_PROGRESS';
    if (type != 'MOVING' && type != 'SCHEDULED') return false;
    if (type == 'MOVING') return status == 'ASSIGNED' || status == 'IN_PROGRESS';
    return status == 'SCHEDULED' || status == 'CONFIRMED' || status == 'IN_PROGRESS';
  }

  Future<void> _loadProfile({bool clearCache = false}) async {
    if (clearCache) await ProfileCache.clear();
    final api = ref.read(apiClientProvider);
    final previousKyc = _profile?['kycStatus']?.toString();
    final result = await api.getDriverProfile(forceRefresh: clearCache);
    if (!mounted) return;
    switch (result) {
      case Success(:final data):
        final vehicles = data['vehicles'] as List? ?? [];
        final activeVehicle = vehicles.cast<Map<String, dynamic>>().firstWhere(
              (v) => v['isActive'] == true,
              orElse: () => vehicles.isNotEmpty ? vehicles.first as Map<String, dynamic> : {},
            );
        final kycStatus = data['kycStatus']?.toString();
        setState(() {
          _profile = data;
          _available = _readAvailability(data);
          _vehicleId = activeVehicle['id']?.toString();
          _availabilityError = null;
          _profileError = null;
        });
        if (previousKyc != 'APPROVED' && kycStatus == 'APPROVED' && mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(tr('KYC approuvé — saisissez votre code PIN d\'activation si demandé.')),
              backgroundColor: MovaColors.green,
            ),
          );
        }
        if (_needsActivationPinPrompt(data)) {
          _maybeShowActivationPin();
        }
        _syncProfilePoll(kycStatus);
      case Failure(:final error):
        setState(() {
          _profileError = error.message;
          if (clearCache) _profile = null;
        });
    }
  }

  bool _isActivationPinVerified(Map<String, dynamic>? data) {
    if (data == null) return false;
    return data['activationPinVerified'] == true || data['activationPinVerifiedAt'] != null;
  }

  bool _needsActivationPinPrompt(Map<String, dynamic> data) {
    if (_isActivationPinVerified(data)) return false;
    return data['needsActivationPin'] == true;
  }

  void _maybeShowActivationPin({bool force = false}) {
    if (_isActivationPinVerified(_profile)) return;
    if (_profile?['needsActivationPin'] != true && !force) return;
    if (!mounted || _activationPinDialogOpen) return;
    _activationPinDialogOpen = true;
    final controller = TextEditingController();
    var submitting = false;
    showDialog<void>(
      context: context,
      barrierDismissible: !force,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          scrollable: true,
          title: Text(tr('Code PIN d\'activation')),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                tr('Entrez le code à 6 chiffres communiqué par SENGA après validation de votre dossier.'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: controller,
                keyboardType: TextInputType.number,
                maxLength: 6,
                enabled: !submitting,
                decoration: const InputDecoration(labelText: 'PIN'),
              ),
            ],
          ),
          actions: [
            if (!force)
              TextButton(
                onPressed: submitting ? null : () => Navigator.of(ctx, rootNavigator: true).pop(),
                child: Text(tr('Plus tard')),
              ),
            TextButton(
              onPressed: submitting
                  ? null
                  : () async {
                      setDialogState(() => submitting = true);
                      final api = ref.read(apiClientProvider);
                      final result = await api.post('/drivers/activation-pin', {'pin': controller.text.trim()});
                      if (!ctx.mounted) return;
                      switch (result) {
                        case Success(:final data):
                          if (mounted) {
                            setState(() {
                              _profile = {
                                ...?_profile,
                                ...data,
                                'activationPinVerified': true,
                                'needsActivationPin': false,
                              };
                              _profileError = null;
                            });
                          }
                          Navigator.of(ctx, rootNavigator: true).pop();
                          await _loadProfile(clearCache: true);
                          await _connectDriverCashInbox();
                          if (mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(content: Text(tr('Compte activé — vous pouvez passer en ligne.'))),
                            );
                          }
                        case Failure(:final error):
                          setDialogState(() => submitting = false);
                          ScaffoldMessenger.of(ctx).showSnackBar(SnackBar(content: Text(tr(error.message))));
                      }
                    },
              child: submitting
                  ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                  : Text(tr('Activer')),
            ),
          ],
        ),
      ),
    ).whenComplete(() {
      controller.dispose();
      _activationPinDialogOpen = false;
    });
  }

  void _syncProfilePoll(String? kycStatus) {
    _profilePollTimer?.cancel();
    if (kycStatus != 'APPROVED') {
      _profilePollTimer = Timer.periodic(const Duration(seconds: 5), (_) {
        if (mounted) _loadProfile(clearCache: true);
      });
    }
  }

  Future<void> _refreshAll() async {
    await Future.wait([
      _loadProfile(clearCache: true),
      _loadEarnings(),
      _loadActiveRide(),
      _loadPendingCashRide(),
      _loadActiveDelivery(),
      _loadPublicites(),
    ]);
  }

  Future<void> _loadPublicites() async {
    final api = ref.read(apiClientProvider);
    final result = await api.getPublicites(cible: 'DRIVER');
    if (!mounted) return;
    if (result case Success(:final data)) {
      setState(() => _publicites = data);
    }
  }

  Future<void> _loadEarnings() async {
    final api = ref.read(apiClientProvider);
    final result = await api.get('/drivers/earnings');
    if (result case Success(:final data)) {
      if (mounted) setState(() => _earnings = data);
    }
  }

  Future<void> _loadPendingCashRide() async {
    final api = ref.read(apiClientProvider);
    final result = await api.getDriverPendingCashRide();
    if (!mounted) return;
    switch (result) {
      case Success(:final data):
        if (data == null) {
          setState(() => _pendingCashRide = null);
          return;
        }
        final kind = data['_cashKind']?.toString().toUpperCase();
        if (kind == 'RIDE') {
          setState(() => _pendingCashRide = data);
          return;
        }
        if (kind == 'DELIVERY' || kind == 'ERRAND') {
          await _hydratePendingCashDelivery(data);
        }
      case Failure():
        setState(() => _pendingCashRide = null);
    }
  }

  Future<void> _hydratePendingCashDelivery(Map<String, dynamic> stub) async {
    final id = stub['id']?.toString();
    if (id == null || id.isEmpty || !mounted) return;
    final isErrand = stub['_cashKind']?.toString() == 'ERRAND' || stub['type']?.toString() == 'ERRAND';
    final api = ref.read(apiClientProvider);
    final detail = await api.get(isErrand ? '/errands/$id' : '/deliveries/$id');
    if (!mounted) return;
    if (detail case Success(:final data)) {
      final merged = mergeDeliveryApiPayload(Map<String, dynamic>.from(data));
      final cashPending = _deliveryCashPending(merged);
      setState(() {
        _pendingCashDelivery = cashPending ? merged : null;
        if (cashPending &&
            (_activeDelivery == null || _activeDelivery!['id']?.toString() == id)) {
          _activeDelivery = merged;
        }
      });
      if (!cashPending) return;
      await _connectDeliveryCashSocket(merged);
      _maybeAutoOpenDeliveryCash(merged);
    }
  }

  Future<void> _connectDriverCashInbox() async {
    final api = ref.read(apiClientProvider);
    if (api.isMockMode) return;
    final userId = _profile?['userId']?.toString();
    if (userId == null || userId.isEmpty || !mounted) return;
    final token = await api.authToken();
    if (!mounted) return;
    ref.read(rideSocketProvider).connectDriverInbox(
      userId: userId,
      token: token,
      onRideNew: (_) {
        if (!mounted || !_available) return;
        _pollOffers();
      },
      onRideCancelled: (payload) {
        final id = payload['rideId']?.toString();
        if (id == null || id.isEmpty || !mounted) return;
        final offerKey = DriverJobAlertService.offerKey('ride', id);
        // Stop immédiat + event UI (écran offre / fenêtre type appel).
        unawaited(
          DriverJobAlertService.handleJobStop(
            offerKey: offerKey,
            referenceId: id,
            kind: 'ride',
            reason: 'cancelled',
          ),
        );
        _dismissedOffers.add('ride:$id');
        final wasActive = _activeRide?['id']?.toString() == id;
        final onThisOffer =
            _showingOffer && _openOfferId == id && _openOfferKind == 'ride';
        setState(() {
          _rideOffers = _rideOffers.where((o) => o['id']?.toString() != id).toList();
          if (wasActive) _activeRide = null;
          _syncOfferSuppression();
        });
        // ActiveRideScreen affiche l’écran « passager a annulé » (poll + socket + JOB_STOP).
        // On ne force plus un popUntil ici : après accept via offre, _activeRide
        // n’était parfois pas renseigné et l’écran course restait bloqué / disparaissait
        // sans message. Snackbar seulement si aucun écran course/offre ouvert.
        if (!onThisOffer && !wasActive && mounted && !Navigator.of(context).canPop()) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(tr('Course annulée par le passager')),
              duration: Duration(seconds: 3),
            ),
          );
        }
      },
      onOfferTaken: (payload) {
        if (!mounted) return;
        final kind = payload['kind']?.toString();
        final rideId = payload['rideId']?.toString();
        final deliveryId = payload['deliveryId']?.toString();
        final id = kind == 'ride' ? rideId : deliveryId;
        if (id == null || id.isEmpty) return;
        final offerKind = kind == 'delivery' ? 'delivery' : 'ride';
        final offerKey = DriverJobAlertService.offerKey(offerKind, id);
        unawaited(
          DriverJobAlertService.handleJobStop(
            offerKey: offerKey,
            referenceId: id,
            kind: offerKind,
            reason: 'taken',
          ),
        );
        setState(() {
          if (kind == 'ride') {
            _rideOffers = _rideOffers.where((o) => o['id']?.toString() != id).toList();
          } else {
            _deliveryOffers = _deliveryOffers.where((o) => o['id']?.toString() != id).toList();
          }
        });
      },
      onCashPending: (payload) {
        final deliveryId = payload['deliveryId']?.toString();
        if (deliveryId == null || deliveryId.isEmpty) return;
        _loadPendingCashRide();
        _loadActiveDelivery();
        final target = _pendingCashDelivery ?? _activeDelivery;
        if (target != null && target['id']?.toString() == deliveryId) {
          _maybeAutoOpenDeliveryCash(target);
        } else {
          _hydratePendingCashDelivery({
            '_cashKind': payload['referenceType']?.toString() ?? 'DELIVERY',
            'id': deliveryId,
            'type': payload['referenceType']?.toString() ?? 'DELIVERY',
          });
        }
      },
    );
  }

  Future<void> _openPendingCashRide() async {
    final rideId = _pendingCashRide?['id']?.toString();
    if (rideId == null || !mounted) return;
    final api = ref.read(apiClientProvider);
    final result = await api.getRide(rideId);
    if (!mounted) return;
    switch (result) {
      case Success(:final data):
        await Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => ActiveRideScreen(ride: data)),
        );
        if (mounted) {
          await Future.wait([_loadPendingCashRide(), _loadActiveRide()]);
        }
      case Failure(:final error):
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(tr(error.message))));
    }
  }

  Future<void> _loadActiveRide() async {
    final api = ref.read(apiClientProvider);
    final result = await api.get('/rides/history?role=driver');
    if (!mounted) return;
    if (result case Success(:final data)) {
      final rides = (data['data'] as List? ?? data['rides'] as List? ?? [])
          .cast<Map<String, dynamic>>();
      final active = rides.where((r) {
        final s = r['status']?.toString().toUpperCase() ?? '';
        return s == 'DRIVER_ASSIGNED' ||
            s == 'ACCEPTED' ||
            s == 'ARRIVING' ||
            s == 'DRIVER_ARRIVED' ||
            s == 'IN_PROGRESS';
      }).toList();
      if (active.isNotEmpty) {
        setState(() {
          _activeRide = active.first;
          _syncOfferSuppression();
        });
        _startLocationUpdates();
      } else {
        setState(() {
          _activeRide = null;
          _syncOfferSuppression();
        });
        if (_available) _startLocationUpdates();
      }
    }
  }

  Future<void> _loadActiveDelivery() async {
    final api = ref.read(apiClientProvider);
    final result = await api.get('/deliveries/history?role=driver');
    if (!mounted) return;
    final List<Map<String, dynamic>> deliveries;
    switch (result) {
      case Success(:final data):
        deliveries = (data['data'] as List? ?? []).cast<Map<String, dynamic>>();
      case Failure():
        return;
    }
    Map<String, dynamic>? candidate;
    for (final raw in deliveries) {
      final map = Map<String, dynamic>.from(raw);
      if (_deliveryInProgress(map) || _deliveryAwaitingPayment(map)) {
        candidate = map;
        break;
      }
    }

    if (candidate == null) {
      setState(() {
        _activeDelivery = null;
        _pendingCashDelivery = null;
        _syncOfferSuppression();
      });
      return;
    }

    final id = candidate['id']?.toString();
    if (id == null || id.isEmpty) return;
    final isErrand = candidate['type']?.toString() == 'ERRAND';
    final detail = await api.get(isErrand ? '/errands/$id' : '/deliveries/$id');
    if (!mounted) return;
    if (detail case Success(:final data)) {
      final merged = mergeDeliveryApiPayload(Map<String, dynamic>.from(data));
      final inProgress = _deliveryInProgress(merged);
      final cashPending = _deliveryCashPending(merged);
      setState(() {
        _activeDelivery = inProgress || cashPending ? merged : null;
        _pendingCashDelivery = cashPending ? merged : null;
        _syncOfferSuppression();
      });
      if (_deliveryAwaitingPayment(merged)) {
        await _connectDeliveryCashSocket(merged);
      }
      if (cashPending) {
        _maybeAutoOpenDeliveryCash(merged);
      }
    }
  }

  bool _deliveryInProgress(Map<String, dynamic> delivery) {
    final status = delivery['status']?.toString().toUpperCase() ?? '';
    final type = delivery['type']?.toString().toUpperCase() ?? '';
    if (type == 'ERRAND') {
      return status == 'ASSIGNED' || status == 'IN_PROGRESS';
    }
    return status == 'READY_FOR_PICKUP' ||
        status == 'PICKED_UP' ||
        status == 'IN_TRANSIT';
  }

  bool _deliveryAwaitingPayment(Map<String, dynamic> delivery) {
    if (deliveryIsPaid(delivery)) return false;
    final status = delivery['status']?.toString().toUpperCase() ?? '';
    final type = delivery['type']?.toString().toUpperCase() ?? '';
    return type == 'ERRAND' ? status == 'COMPLETED' : status == 'DELIVERED';
  }

  bool _deliveryCashPending(Map<String, dynamic> delivery) {
    if (!_deliveryAwaitingPayment(delivery)) return false;
    return delivery['paymentStatus']?.toString().toUpperCase() == 'PENDING';
  }

  Future<void> _connectDeliveryCashSocket(Map<String, dynamic> delivery) async {
    final api = ref.read(apiClientProvider);
    if (api.isMockMode) return;
    final id = delivery['id']?.toString();
    if (id == null || id.isEmpty || !mounted) return;
    final token = await api.authToken();
    if (!mounted) return;
    final isErrand = delivery['type']?.toString() == 'ERRAND';
    final driverUserId = _profile?['userId']?.toString();
    ref.read(rideSocketProvider).connectDelivery(
      deliveryId: id,
      token: token,
      referenceType: isErrand ? 'ERRAND' : 'DELIVERY',
      driverUserId: driverUserId,
      onCashPending: (payload) {
        final deliveryId = payload['deliveryId']?.toString();
        if (deliveryId != null && deliveryId != id) return;
        final target = _pendingCashDelivery ?? _activeDelivery ?? delivery;
        _maybeAutoOpenDeliveryCash(target);
      },
    );
  }

  void _maybeAutoOpenDeliveryCash(Map<String, dynamic> delivery) {
    if (!mounted || _cashDeliveryPromptOpen || _showingOffer) return;
    if (!_deliveryCashPending(delivery)) return;
    _cashDeliveryPromptOpen = true;
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => ActiveDeliveryScreen(
          delivery: delivery,
          autoOpenCashPin: true,
        ),
      ),
    ).then((_) {
      _cashDeliveryPromptOpen = false;
      _loadActiveDelivery();
    });
  }

  Future<void> _openPendingCashDelivery() async {
    final delivery = _pendingCashDelivery ?? _activeDelivery;
    if (delivery == null || !mounted) return;
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => ActiveDeliveryScreen(
          delivery: delivery,
          autoOpenCashPin: deliveryCashPaymentPending(delivery),
        ),
      ),
    );
    if (mounted) await _loadActiveDelivery();
  }

  Future<bool> _ensureGpsPosition() async {
    if (!await Geolocator.isLocationServiceEnabled()) return false;
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await LocationPermissionGate.request();
    }
    if (permission == LocationPermission.denied || permission == LocationPermission.deniedForever) {
      return false;
    }
    return true;
  }

  Future<void> _pushLocation() async {
    if (!await _ensureGpsPosition()) return;
    final pos = await Geolocator.getCurrentPosition();
    final api = ref.read(apiClientProvider);
    await api.updateDriverLocation(pos.latitude, pos.longitude);
    // Keep passenger + admin maps live even if the driver is still on home
    // (active mission banner) rather than ActiveRideScreen.
    final rideId = _activeRide?['id']?.toString();
    final deliveryId = _activeDelivery?['id']?.toString();
    final userId = _profile?['userId']?.toString();
    if (userId != null && userId.isNotEmpty) {
      final socket = ref.read(rideSocketProvider);
      if (rideId != null && rideId.isNotEmpty) {
        socket.emitDriverLocation(
          userId: userId,
          lat: pos.latitude,
          lng: pos.longitude,
          rideId: rideId,
        );
        await api.recordTrackingPoint('ride', rideId, pos.latitude, pos.longitude);
      } else if (deliveryId != null && deliveryId.isNotEmpty) {
        socket.emitDriverLocation(
          userId: userId,
          lat: pos.latitude,
          lng: pos.longitude,
        );
        await api.recordTrackingPoint('delivery', deliveryId, pos.latitude, pos.longitude);
      }
    }
  }

  Future<bool> _pushLocationRequired() async {
    if (!await _ensureGpsPosition()) return false;
    final pos = await Geolocator.getCurrentPosition();
    final result = await ref.read(apiClientProvider).updateDriverLocation(pos.latitude, pos.longitude);
    return result is Success;
  }

  void _startLocationUpdates() {
    _locationTimer?.cancel();
    // Faster while a mission is active so passenger/admin maps stay smooth.
    final interval = (_activeRide != null || _activeDelivery != null)
        ? const Duration(seconds: 8)
        : const Duration(seconds: 20);
    _locationTimer = Timer.periodic(interval, (_) => _pushLocation());
    _pushLocation();
  }

  void _stopLocationUpdates() {
    _locationTimer?.cancel();
  }

  void _resetOfferTracking() {
    _knownOfferKeys.clear();
    _offerAlertsSeeded = false;
  }

  void _startPolling() {
    _offerPollTimer?.cancel();
    _cashPollTimer?.cancel();
    _resetOfferTracking();
    _pollOffers();
    _offerPollTimer = Timer.periodic(const Duration(seconds: 3), (_) => _pollOffers());
    _cashPollTimer = Timer.periodic(const Duration(seconds: 5), (_) {
      if (!_available || !mounted || _showingOffer) return;
      _loadPendingCashRide();
      if (_pendingCashDelivery != null ||
          (_activeDelivery != null && _deliveryAwaitingPayment(_activeDelivery!))) {
        _loadActiveDelivery();
      }
    });
    _startLocationUpdates();
  }

  void _stopPolling() {
    _offerPollTimer?.cancel();
    _cashPollTimer?.cancel();
    _stopLocationUpdates();
  }

  String? _vehicleIdForOffer(Map<String, dynamic> offer) {
    final rideType = MarketConfig.normalizeVehicleType(
      offer['vehicleType']?.toString() ?? 'STANDARD',
    );
    final eligible = MarketConfig.driverVehicleTypesForRide(rideType);
    final vehicles = (_profile?['vehicles'] as List?)?.cast<Map<String, dynamic>>() ?? [];
    for (final v in vehicles) {
      if (v['isActive'] == false) continue;
      final type = MarketConfig.normalizeVehicleType(v['type']?.toString() ?? '');
      if (eligible.contains(type)) {
        return v['id']?.toString();
      }
    }
    return _vehicleId;
  }

  Future<void> _openDeliveryOfferPopup(Map<String, dynamic> offer) async {
    final id = offer['id']?.toString() ?? '';
    if (id.isEmpty) return;
    if (_showingOffer) return;
    if (_isOfferHidden('delivery:$id')) return;
    final offerKey = DriverJobAlertService.offerKey('delivery', id);
    _showingOffer = true;
    _openOfferKind = 'delivery';
    _openOfferId = id;
    // Continuer / relancer la sonnerie pendant l’écran d’offre.
    unawaited(DriverJobAlertService.startRinging(offerKey: offerKey));
    final result = await Navigator.push<dynamic>(
      context,
      MaterialPageRoute(builder: (_) => DeliveryOfferScreen(offer: offer)),
    );
    _showingOffer = false;
    _openOfferKind = null;
    _openOfferId = null;
    await DriverJobAlertService.stopRinging(offerKey: offerKey);
    if (!mounted) return;
    if (result == 'taken' || result == 'cancelled') {
      _dismissedOffers.add('delivery:$id');
      await _refreshRideOffers();
      return;
    }
    if (result == 'timeout' || result == null) {
      _snoozedOffers['delivery:$id'] = DateTime.now();
    } else if (result == 'rejected') {
      _dismissedOffers.add('delivery:$id');
    } else if (result is Map<String, dynamic>) {
      _dismissedOffers.add('delivery:$id');
      setState(() => _activeDelivery = result);
      await Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => ActiveDeliveryScreen(
            delivery: result,
            autoOpenNavigation: true,
          ),
        ),
      );
      await _loadActiveDelivery();
    }
    await _refreshRideOffers();
  }

  Future<void> _rejectDeliveryOffer(Map<String, dynamic> offer) async {
    final id = offer['id']?.toString() ?? '';
    if (id.isEmpty) return;
    final offerKey = DriverJobAlertService.offerKey('delivery', id);
    final api = ref.read(apiClientProvider);
    final result = await api.rejectDelivery(id);
    await DriverJobAlertService.stopRinging(offerKey: offerKey);
    if (!mounted) return;
    if (result case Success()) {
      _dismissedOffers.add('delivery:$id');
      await _refreshRideOffers();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(tr('Livraison refusée'))),
        );
      }
    } else if (result case Failure(:final error)) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(tr(error.message))),
      );
    }
  }

  Future<void> _rejectRideOffer(Map<String, dynamic> offer) async {
    final id = offer['id']?.toString() ?? '';
    if (id.isEmpty) return;
    final offerKey = DriverJobAlertService.offerKey('ride', id);
    final api = ref.read(apiClientProvider);
    final result = await api.rejectRide(id);
    await DriverJobAlertService.stopRinging(offerKey: offerKey);
    if (!mounted) return;
    if (result case Success()) {
      _dismissedOffers.add('ride:$id');
      await _refreshRideOffers();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(tr('Course refusée'))),
        );
      }
    } else if (result case Failure(:final error)) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(tr(error.message))),
      );
    }
  }

  Future<void> _openRideOffer(Map<String, dynamic> offer) async {
    final id = offer['id']?.toString() ?? '';
    if (id.isEmpty) return;
    if (_showingOffer) return;
    if (_isOfferHidden('ride:$id')) return;
    final offerKey = DriverJobAlertService.offerKey('ride', id);
    _showingOffer = true;
    _openOfferKind = 'ride';
    _openOfferId = id;
    unawaited(DriverJobAlertService.startRinging(offerKey: offerKey));
    final result = await Navigator.push<dynamic>(
      context,
      MaterialPageRoute(
        builder: (_) => RideOfferScreen(
          offer: offer,
          vehicleId: _vehicleIdForOffer(offer),
        ),
      ),
    );
    _showingOffer = false;
    _openOfferKind = null;
    _openOfferId = null;
    await DriverJobAlertService.stopRinging(offerKey: offerKey);
    if (result is Map<String, dynamic>) {
      // Acceptation : renseigner _activeRide puis ouvrir l’écran course.
      _dismissedOffers.add('ride:$id');
      if (!mounted) return;
      setState(() {
        _activeRide = result;
        _syncOfferSuppression();
      });
      await Navigator.push<void>(
        context,
        MaterialPageRoute(
          builder: (_) => ActiveRideScreen(ride: result, autoOpenNavigation: true),
        ),
      );
      if (mounted) {
        await Future.wait([_loadActiveRide(), _refreshRideOffers()]);
      }
      return;
    }
    if (result == 'taken') {
      _dismissedOffers.add('ride:$id');
    } else if (result == 'cancelled') {
      _dismissedOffers.add('ride:$id');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(tr('Course annulée par le passager')),
            duration: Duration(seconds: 3),
          ),
        );
      }
    } else if (result == 'timeout') {
      // Pas de réponse : ne pas masquer définitivement, re-proposer plus tard.
      _snoozedOffers['ride:$id'] = DateTime.now();
    } else {
      // Refus explicite : masquer définitivement pour cette session.
      _dismissedOffers.add('ride:$id');
    }
    await _loadActiveRide();
    await _refreshRideOffers();
  }

  /// Une offre est-elle actuellement masquée (refus définitif ou veille temporaire) ?
  bool _isOfferHidden(String key) {
    if (_dismissedOffers.contains(key)) return true;
    final snoozedAt = _snoozedOffers[key];
    if (snoozedAt == null) return false;
    if (DateTime.now().difference(snoozedAt) < _offerSnoozeDuration) return true;
    _snoozedOffers.remove(key);
    return false;
  }

  Future<void> _syncKnownOfferKeys(Iterable<String> keys, {required List<Map<String, dynamic>> newOffers}) async {
    final keySet = keys.toSet();
    if (_offerAlertsSeeded && newOffers.isNotEmpty && mounted) {
      for (final offer in newOffers) {
        final isRide = offer.containsKey('vehicleType') && !offer.containsKey('deliveryType');
        final id = offer['id']?.toString() ?? '';
        final offerKey = DriverJobAlertService.offerKey(isRide ? 'ride' : 'delivery', id);
        final title = isRide ? tr('Nouvelle course') : tr('Nouvelle livraison');
        final body = isRide
            ? DriverJobAlertService.rideOfferMessage(offer)
            : DriverJobAlertService.deliveryOfferMessage(offer);
        await DriverJobAlertService.notify(
          title: title,
          body: body,
          payload: id.isEmpty
              ? null
              : NotificationTapRouter.encodeJobPayload(
                  kind: isRide ? 'ride' : 'delivery',
                  id: id,
                ),
          ringUntilStopped: true,
          offerKey: offerKey,
        );
      }
    }
    // Coupe la sonnerie si plus aucune offre ouverte (acceptée ailleurs / annulée).
    await DriverJobAlertService.syncActiveOffers(keySet);
    _knownOfferKeys
      ..clear()
      ..addAll(keySet);
    _offerAlertsSeeded = true;
  }

  Set<String> _collectOfferKeys(List<Map<String, dynamic>> rides, List<Map<String, dynamic>> deliveries) {
    final keys = <String>{};
    for (final o in rides) {
      final id = o['id']?.toString();
      if (id != null && id.isNotEmpty) keys.add(DriverJobAlertService.offerKey('ride', id));
    }
    for (final o in deliveries) {
      final id = o['id']?.toString();
      if (id != null && id.isNotEmpty) keys.add(DriverJobAlertService.offerKey('delivery', id));
    }
    return keys;
  }

  Future<void> _refreshRideOffers() async {
    if (!_available || _activeRide != null || _activeDelivery != null) {
      if (mounted) setState(() {
        _rideOffers = [];
        _deliveryOffers = [];
      });
      return;
    }
    final api = ref.read(apiClientProvider);
    final rideResult = await api.getDriverOffers();
    final deliveryResult = await api.getDeliveryOffers();
    if (!mounted) return;
    final rides = switch (rideResult) {
      Success(:final data) => data,
      Failure() => null,
    };
    if (rides == null) {
      if (rideResult case Failure(:final error)) {
        setState(() => _offersError = error.message);
      }
      return;
    }
    final deliveries = switch (deliveryResult) {
      Success(:final data) => data,
      Failure() => <Map<String, dynamic>>[],
    };
    final mode = _serviceModeLabel();
    final filteredRides =
        mode == _DriverServiceMode.deliveriesOnly ? <Map<String, dynamic>>[] : rides;
    final filteredDeliveries =
        mode == _DriverServiceMode.ridesOnly ? <Map<String, dynamic>>[] : deliveries;
    final keys = _collectOfferKeys(filteredRides, filteredDeliveries);
    final newOffers = <Map<String, dynamic>>[];
    for (final o in filteredRides) {
      final id = o['id']?.toString();
      if (id == null || id.isEmpty) continue;
      final key = DriverJobAlertService.offerKey('ride', id);
      if (!_knownOfferKeys.contains(key) && !_dismissedOffers.contains('ride:$id')) newOffers.add(o);
    }
    for (final o in filteredDeliveries) {
      final id = o['id']?.toString();
      if (id == null || id.isEmpty) continue;
      final key = DriverJobAlertService.offerKey('delivery', id);
      if (!_knownOfferKeys.contains(key) && !_dismissedOffers.contains('delivery:$id')) newOffers.add(o);
    }
    await _syncKnownOfferKeys(keys, newOffers: newOffers);
    setState(() {
      _rideOffers = filteredRides;
      _deliveryOffers = filteredDeliveries;
      _offersError = null;
    });
  }

  Future<void> _pollOffers() async {
    if (!_available || _activeRide != null || _activeDelivery != null || _showingOffer || !mounted) return;
    final api = ref.read(apiClientProvider);

    final rideResult = await api.getDriverOffersRaw();
    final deliveryResult = await api.getDeliveryOffersRaw();
    if (!mounted || _showingOffer) return;

    final ridePayload = switch (rideResult) {
      Success(:final data) => data,
      Failure() => null,
    };
    if (ridePayload == null) {
      if (rideResult case Failure(:final error)) {
        setState(() => _offersError = error.message);
      }
      return;
    }
    final rides = List<Map<String, dynamic>>.from(ridePayload['offers'] as List? ?? []);
    final deliveryPayload = switch (deliveryResult) {
      Success(:final data) => data,
      Failure() => <String, dynamic>{'offers': <Map<String, dynamic>>[]},
    };
    final deliveries = List<Map<String, dynamic>>.from(deliveryPayload['offers'] as List? ?? []);
    final mode = _serviceModeLabel();
    final filteredRides =
        mode == _DriverServiceMode.deliveriesOnly ? <Map<String, dynamic>>[] : rides;
    final filteredDeliveries =
        mode == _DriverServiceMode.ridesOnly ? <Map<String, dynamic>>[] : deliveries;
    final blockMessage = _offerBlockMessage(ridePayload, deliveryPayload);
    final keys = _collectOfferKeys(filteredRides, filteredDeliveries);
    final newOffers = <Map<String, dynamic>>[];
    for (final o in filteredRides) {
      final id = o['id']?.toString();
      if (id == null || id.isEmpty) continue;
      final key = DriverJobAlertService.offerKey('ride', id);
      if (!_knownOfferKeys.contains(key) && !_dismissedOffers.contains('ride:$id')) newOffers.add(o);
    }
    for (final o in filteredDeliveries) {
      final id = o['id']?.toString();
      if (id == null || id.isEmpty) continue;
      final key = DriverJobAlertService.offerKey('delivery', id);
      if (!_knownOfferKeys.contains(key) && !_dismissedOffers.contains('delivery:$id')) newOffers.add(o);
    }
    await _syncKnownOfferKeys(keys, newOffers: newOffers);

    setState(() {
      _rideOffers = filteredRides;
      _deliveryOffers = filteredDeliveries;
      _offersError = blockMessage;
    });

    for (final offer in filteredRides) {
      final id = offer['id']?.toString() ?? '';
      if (id.isEmpty || _isOfferHidden('ride:$id')) continue;
      await _openRideOffer(offer);
      return;
    }

    for (final offer in filteredDeliveries) {
      final id = offer['id']?.toString() ?? '';
      if (id.isEmpty || _isOfferHidden('delivery:$id')) continue;
      if (offer['alreadyAssigned'] == true) {
        if (mounted) setState(() => _activeDelivery = offer);
        continue;
      }
      await _openDeliveryOfferPopup(offer);
      return;
    }
  }

  Future<void> _toggleAvailability(bool value) async {
    setState(() => _availabilityError = null);
    String? locationWarning;
    if (value) {
      final gpsReady = await _ensureGpsPosition();
      if (!gpsReady) {
        setState(() => _availabilityError =
            tr('Activez le GPS pour recevoir des courses près de vous.'));
        return;
      }
      final located = await _pushLocationRequired();
      if (!located) {
        locationWarning =
            tr('Position non synchronisée — les offres peuvent être limitées tant que le réseau est instable.');
      }
    }
    final api = ref.read(apiClientProvider);
    final result = await api.patch('/drivers/availability', {'isAvailable': value});
    if (!mounted) return;
    switch (result) {
      case Success():
        await ProfileCache.patchAvailability(value);
        setState(() {
          _available = value;
          if (_profile != null) {
            _profile = Map<String, dynamic>.from(_profile!)..['isAvailable'] = value;
          }
          _availabilityError = locationWarning;
        });
        if (value) {
          _startPolling();
          await DriverBackgroundService.start();
        } else {
          await DriverJobAlertService.stopRinging();
          _stopPolling();
          await DriverBackgroundService.stop();
        }
      case Failure(:final error):
        setState(() => _availabilityError = error.message);
    }
  }

  String? _offerBlockMessage(Map<String, dynamic> ridePayload, Map<String, dynamic> deliveryPayload) {
    if (ridePayload['walletBlocked'] == true || deliveryPayload['walletBlocked'] == true) {
      return tr('Solde portefeuille (virtuel) insuffisant. Rechargez dans Revenus pour recevoir des courses.');
    }
    if (ridePayload['debtBlocked'] == true || deliveryPayload['debtBlocked'] == true) {
      final debt = ridePayload['openDebtCdf'] ?? deliveryPayload['openDebtCdf'];
      final threshold = ridePayload['debtThresholdCdf'] ?? deliveryPayload['debtThresholdCdf'];
      return trf('Dette espèces ({debt} FC) au-dessus du seuil ({threshold} FC). Réglez votre dette pour recevoir des missions.', {'debt': debt, 'threshold': threshold});
    }
    if (ridePayload['documentsBlocked'] == true || deliveryPayload['documentsBlocked'] == true) {
      return _documentsBlockReason ??
          tr('Documents expirés ou incomplets — mettez à jour votre enregistrement.');
    }
    return null;
  }

  String? get _kycStatus => _profile?['kycStatus']?.toString();

  String? get _vehicleTypeApprovalStatus {
    final top = _profile?['vehicleTypeApprovalStatus']?.toString();
    if (top != null && top.isNotEmpty) return top.toUpperCase();
    final vehicles = _profile?['vehicles'];
    if (vehicles is! List || vehicles.isEmpty) return null;
    final maps = vehicles.whereType<Map>().map((v) => Map<String, dynamic>.from(v)).toList();
    final active = maps.cast<Map<String, dynamic>>().firstWhere(
          (v) => v['isActive'] == true,
          orElse: () => maps.first,
        );
    final status = active['typeApprovalStatus']?.toString();
    return status?.toUpperCase();
  }

  _DriverServiceMode _serviceModeLabel() {
    final mode = _profile?['serviceMode']?.toString().toUpperCase();
    if (mode == 'RIDES_ONLY') return _DriverServiceMode.ridesOnly;
    if (mode == 'DELIVERIES_ONLY') return _DriverServiceMode.deliveriesOnly;
    if (mode == 'BOTH') return _DriverServiceMode.both;
    if (_profile?['acceptsRides'] == false) return _DriverServiceMode.deliveriesOnly;
    if (_profile?['acceptsDeliveries'] == false) return _DriverServiceMode.ridesOnly;
    return _DriverServiceMode.both;
  }

  String _waitingOffersHint() {
    final mode = _serviceModeLabel();
    if (mode == _DriverServiceMode.ridesOnly) {
      return tr('En attente de courses à proximité…\n'
          'Vérifiez : En ligne, GPS activé, KYC approuvé.');
    }
    if (mode == _DriverServiceMode.deliveriesOnly) {
      return tr('En attente de livraisons à proximité…\n'
          'Vérifiez : En ligne, GPS activé, KYC approuvé.');
    }
    return tr('En attente de courses ou livraisons à proximité…\n'
        'Vérifiez : En ligne, GPS activé, KYC approuvé.');
  }

  Map<String, dynamic>? get _documentsStatus =>
      _profile?['documentsStatus'] as Map<String, dynamic>?;

  bool get _documentsCanOperate => _documentsStatus?['canOperate'] == true;

  bool get _documentsRenewalPending => _profile?['documentsRenewalPending'] == true;

  String? get _documentsBlockReason => _documentsStatus?['blockReason']?.toString();

  Map<String, dynamic>? get _documentsReminder {
    final fromStatus = _documentsStatus?['documentsReminder'];
    if (fromStatus is Map<String, dynamic>) return fromStatus;
    final top = _profile?['documentsReminder'];
    if (top is Map<String, dynamic>) return top;
    return null;
  }

  String? get _documentsReminderMessage {
    final r = _documentsReminder;
    if (r == null || r['active'] != true) return null;
    return r['message']?.toString();
  }

  @override
  Widget build(BuildContext context) {
    if (_bootstrapping) {
      return const MovaScreen(
        title: 'SENGA Driver',
        child: Center(child: CircularProgressIndicator()),
      );
    }

    return MovaScreen(
      title: 'SENGA Driver',
      scrollable: false,
      actions: [
        const NotificationsBellButton(),
        sosAppBarButton(
          icon: Icons.sos,
          onPressed: ([bool skip = false]) => triggerSosAlert(
            skipConfirm: skip,
            ref,
            context,
            description: 'SOS chauffeur — accueil',
          ),
        ),
        IconButton(
          icon: const Icon(Icons.account_balance_wallet_outlined),
          tooltip: tr('Revenus'),
          onPressed: () => Navigator.push(
            context,
            MaterialPageRoute(builder: (_) => const EarningsScreen()),
          ),
        ),
        PopupMenuButton<_DriverMenuAction>(
          tooltip: tr('Menu'),
          onSelected: (action) async {
            switch (action) {
              case _DriverMenuAction.earnings:
                await Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const EarningsScreen()),
                );
              case _DriverMenuAction.history:
                await Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const DriverRideHistoryScreen()),
                );
              case _DriverMenuAction.carpool:
                await Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const CarpoolScreen(forDriver: true)),
                );
              case _DriverMenuAction.dossier:
                await Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const DriverOnboardingScreen(canSkipToHome: true)),
                );
                if (mounted) await _loadProfile(clearCache: true);
              case _DriverMenuAction.inbox:
                await Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const NotificationsInboxScreen()),
                );
              case _DriverMenuAction.notifications:
                await Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const DriverNotificationSettingsScreen()),
                );
              case _DriverMenuAction.profile:
                await Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => ProfileScreen(title: tr('Compte et connexion')),
                  ),
                );
              case _DriverMenuAction.help:
                await Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const DriverHelpScreen()),
                );
              case _DriverMenuAction.incident:
                await Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const IncidentScreen()),
                );
              case _DriverMenuAction.logout:
                final confirm = await showDialog<bool>(
                  context: context,
                  builder: (ctx) => AlertDialog(
                    title: Text(tr('Déconnexion')),
                    content: Text(tr('Voulez-vous vous déconnecter ?')),
                    actions: [
                      TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(tr('Annuler'))),
                      TextButton(onPressed: () => Navigator.pop(ctx, true), child: Text(tr('Déconnexion'))),
                    ],
                  ),
                );
                if (confirm == true && context.mounted) {
                  await logoutDriver(context, ref);
                }
            }
          },
          itemBuilder: (context) => [
            PopupMenuItem(
              value: _DriverMenuAction.earnings,
              child: ListTile(
                leading: Icon(Icons.account_balance_wallet_outlined),
                title: Text(tr('Revenus')),
                contentPadding: EdgeInsets.zero,
                visualDensity: VisualDensity.compact,
              ),
            ),
            PopupMenuItem(
              value: _DriverMenuAction.history,
              child: ListTile(
                leading: Icon(Icons.history),
                title: Text(tr('Historique')),
                contentPadding: EdgeInsets.zero,
                visualDensity: VisualDensity.compact,
              ),
            ),
            PopupMenuItem(
              value: _DriverMenuAction.carpool,
              child: ListTile(
                leading: Icon(Icons.people_alt_outlined),
                title: Text(tr('Covoiturage')),
                contentPadding: EdgeInsets.zero,
                visualDensity: VisualDensity.compact,
              ),
            ),
            PopupMenuItem(
              value: _DriverMenuAction.dossier,
              child: ListTile(
                leading: Icon(Icons.badge_outlined),
                title: Text(tr('Mon dossier')),
                contentPadding: EdgeInsets.zero,
                visualDensity: VisualDensity.compact,
              ),
            ),
            PopupMenuItem(
              value: _DriverMenuAction.inbox,
              child: ListTile(
                leading: Icon(Icons.inbox_outlined),
                title: Text(tr('Boîte de réception')),
                contentPadding: EdgeInsets.zero,
                visualDensity: VisualDensity.compact,
              ),
            ),
            PopupMenuItem(
              value: _DriverMenuAction.notifications,
              child: ListTile(
                leading: Icon(Icons.notifications_outlined),
                title: Text(tr('Sons notifications')),
                contentPadding: EdgeInsets.zero,
                visualDensity: VisualDensity.compact,
              ),
            ),
            PopupMenuItem(
              value: _DriverMenuAction.profile,
              child: ListTile(
                leading: Icon(Icons.person_outline),
                title: Text(tr('Compte et connexion')),
                contentPadding: EdgeInsets.zero,
                visualDensity: VisualDensity.compact,
              ),
            ),
            PopupMenuItem(
              value: _DriverMenuAction.help,
              child: ListTile(
                leading: Icon(Icons.help_outline),
                title: Text(tr('Aide')),
                contentPadding: EdgeInsets.zero,
                visualDensity: VisualDensity.compact,
              ),
            ),
            PopupMenuItem(
              value: _DriverMenuAction.incident,
              child: ListTile(
                leading: Icon(Icons.report_problem_outlined),
                title: Text(tr('Signaler un incident')),
                contentPadding: EdgeInsets.zero,
                visualDensity: VisualDensity.compact,
              ),
            ),
            PopupMenuDivider(),
            PopupMenuItem(
              value: _DriverMenuAction.logout,
              child: ListTile(
                leading: Icon(Icons.logout),
                title: Text(tr('Déconnexion')),
                contentPadding: EdgeInsets.zero,
                visualDensity: VisualDensity.compact,
              ),
            ),
          ],
        ),
      ],
      child: RefreshIndicator(
        onRefresh: _refreshAll,
        child: SingleChildScrollView(
          physics: kMovaScrollPhysics,
          child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (_profileError != null) ...[
            MovaErrorBanner(message: _profileError!, onRetry: () => _loadProfile(clearCache: true)),
            const SizedBox(height: _sectionGap),
          ],
          if (_publicites.isNotEmpty) ...[
            PubliciteCarousel(items: _publicites),
            const SizedBox(height: _sectionGap),
          ],
          if (_kycStatus != null && _kycStatus != 'APPROVED') ...[
            MovaCard(
              child: Row(
                children: [
                  Icon(
                    _kycStatus == 'REJECTED' ? Icons.error_outline : Icons.warning_amber,
                    color: _kycStatus == 'REJECTED' ? MovaColors.orange : MovaColors.orange,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      _kycStatus == 'PENDING'
                          ? tr('KYC en cours de validation — vous ne pouvez pas passer en ligne.')
                          : _kycStatus == 'REJECTED'
                              ? tr('KYC refusé — renvoyez vos documents via l\'icône KYC.')
                              : tr('Documents KYC requis pour accepter des courses.'),
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: _sectionGap),
          ],
          if (_kycStatus == 'APPROVED' && (_documentsRenewalPending || !_documentsCanOperate)) ...[
            MovaCard(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(Icons.description_outlined, color: MovaColors.orange),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      _documentsRenewalPending
                          ? tr('Renouvellement de documents en cours de validation SENGA. Mettez à jour vos justificatifs dans Enregistrement si nécessaire.')
                          : (_documentsBlockReason ??
                              tr('Permis, assurance ou visite technique expiré(s) ou incomplet(s). '
                                  'Mettez à jour vos dates dans Enregistrement avant de recevoir des missions.')),
                      maxLines: 4,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: _sectionGap),
          ],
          if (_kycStatus == 'APPROVED' &&
              _documentsCanOperate &&
              _documentsReminderMessage != null) ...[
            MovaCard(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(Icons.notification_important_outlined, color: MovaColors.violet),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      _documentsReminderMessage!,
                      maxLines: 5,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: _sectionGap),
          ],
          if (_kycStatus == 'APPROVED' &&
              _documentsCanOperate &&
              (_documentsStatus?['expiringSoon'] as List?)?.isNotEmpty == true) ...[
            MovaCard(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(Icons.schedule, color: MovaColors.violet),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      tr('Attention : certains documents expirent bientôt. Pensez à les renouveler.'),
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
          ],
          MovaCard(
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(tr('Disponibilité')),
                      const SizedBox(height: 6),
                      Text(
                        _available ? tr('En ligne') : tr('Hors ligne'),
                        style: TextStyle(
                          color: _available ? MovaColors.green : MovaColors.textSecondary,
                          fontWeight: FontWeight.bold,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
                Switch(
                  value: _available,
                  activeColor: MovaColors.green,
                  onChanged: (value) {
                    if (value && _kycStatus != 'APPROVED') {
                      setState(() => _availabilityError =
                          tr('Documents KYC approuvés requis pour passer en ligne.'));
                      return;
                    }
                    final typeStatus = _vehicleTypeApprovalStatus;
                    if (value && typeStatus != null && typeStatus != 'APPROVED') {
                      setState(() => _availabilityError = typeStatus == 'REJECTED'
                          ? tr('Type d\'engin refusé — corrigez le type ou la photo dans Enregistrement.')
                          : tr('Type d\'engin en attente de validation SENGA — pas encore de courses.'));
                      return;
                    }
                    if (value && !_documentsCanOperate) {
                      setState(() => _availabilityError =
                          _documentsBlockReason ??
                              tr('Documents expirés ou incomplets — mettez à jour vos dates d\'expiration.'));
                      return;
                    }
                    _toggleAvailability(value);
                  },
                ),
              ],
            ),
          ),
          if (_availabilityError != null) ...[
            const SizedBox(height: 12),
            MovaErrorBanner(message: _availabilityError!),
          ],
          if (_available) ...[
            const SizedBox(height: 12),
            Builder(
              builder: (context) {
                final mode = _serviceModeLabel();
                final isRidesOnly = mode == _DriverServiceMode.ridesOnly;
                final isDeliveriesOnly = mode == _DriverServiceMode.deliveriesOnly;
                final accent = isRidesOnly
                    ? MovaColors.orange
                    : isDeliveriesOnly
                        ? MovaColors.midnight
                        : MovaColors.violet;
                final title = isRidesOnly
                    ? tr('Chauffeur SENGA — courses uniquement')
                    : isDeliveriesOnly
                        ? tr('Livreur SENGA — livraisons uniquement')
                        : tr('Livreur SENGA — courses et livraisons');
                final subtitle = isRidesOnly
                    ? tr('En ligne — courses près de votre position GPS.')
                    : isDeliveriesOnly
                        ? tr('En ligne — livraisons près de votre position GPS.')
                        : tr('En ligne — courses et livraisons près de votre position GPS.');
                return Column(
                  children: [
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      decoration: BoxDecoration(
                        color: accent.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: accent.withValues(alpha: 0.35)),
                      ),
                      child: Text(
                        title,
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: accent,
                        ),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      subtitle,
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 12,
                        color: MovaColors.textSecondary.withValues(alpha: 0.9),
                      ),
                    ),
                  ],
                );
              },
            ),
          ],
          if (_movingOffers.isNotEmpty) ...[
            const SizedBox(height: _sectionGap),
            MovaCard(
              key: const Key('movingOffersCard'),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      Icon(Icons.local_shipping_outlined, size: 18, color: MovaColors.orange),
                      SizedBox(width: 8),
                      Text(tr('Déménagements proposés'), style: TextStyle(fontWeight: FontWeight.w600)),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    tr('Ces déménagements tiennent dans votre véhicule. Le premier chauffeur qui accepte l\'obtient.'),
                    style: TextStyle(fontSize: 12, color: MovaColors.textSecondary),
                  ),
                  ..._movingOffers.map((offer) {
                    final id = offer['id']?.toString() ?? '';
                    final volume = (offer['volumeM3'] as num?)?.ceil();
                    final net = (offer['driverNetCdf'] as num?)?.round();
                    final items = offer['itemsNotes']?.toString() ?? '';
                    return Padding(
                      padding: const EdgeInsets.only(top: _listItemGap),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '${offer['pickupAddress'] ?? ''} → ${offer['dropoffAddress'] ?? ''}',
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontWeight: FontWeight.w500, fontSize: 13),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            [
                              if (volume != null) '$volume m³',
                              if (offer['vehicleLabel'] != null) offer['vehicleLabel'].toString(),
                              if (offer['distanceKm'] is num) '${(offer['distanceKm'] as num).toStringAsFixed(1)} km',
                            ].join(' · '),
                            style: const TextStyle(fontSize: 12, color: MovaColors.textSecondary),
                          ),
                          if (items.isNotEmpty) ...[
                            const SizedBox(height: 2),
                            Text(
                              items,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(fontSize: 12, color: MovaColors.textSecondary),
                            ),
                          ],
                          Row(
                            children: [
                              if (net != null)
                                Expanded(
                                  child: Text(
                                    trf('Gain net ~{v1}', {'v1': MarketConfig.formatCdf(net)}),
                                    style: const TextStyle(fontSize: 12, color: MovaColors.green),
                                  ),
                                )
                              else
                                const Spacer(),
                              FilledButton(
                                key: Key('acceptMoving_$id'),
                                onPressed: _acceptingMovingId != null ? null : () => _acceptMovingOffer(offer),
                                child: _acceptingMovingId == id
                                    ? const SizedBox(
                                        width: 16,
                                        height: 16,
                                        child: CircularProgressIndicator(strokeWidth: 2),
                                      )
                                    : Text(tr('Accepter')),
                              ),
                            ],
                          ),
                        ],
                      ),
                    );
                  }),
                ],
              ),
            ),
          ],
          if (_scheduledOffers.isNotEmpty) ...[
            const SizedBox(height: _sectionGap),
            MovaCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      Icon(Icons.event_available, size: 18, color: MovaColors.orange),
                      SizedBox(width: 8),
                      Text(tr('Créneaux planifiés'), style: TextStyle(fontWeight: FontWeight.w600)),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Text(
                    tr('Candidature volontaire — SENGA assigne avant le départ.'),
                    style: TextStyle(fontSize: 12, color: MovaColors.textSecondary),
                  ),
                  const SizedBox(height: 12),
                  ..._scheduledOffers.map((offer) {
                    final when = offer['scheduledAt']?.toString();
                    final whenLabel = when != null
                        ? (DateTime.tryParse(when)?.toLocal().toString().substring(0, 16) ?? when)
                        : '';
                    return Padding(
                      padding: const EdgeInsets.only(top: _listItemGap),
                      child: InkWell(
                        onTap: () => Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => DriverScheduledMissionScreen(
                              rideId: offer['id']?.toString() ?? '',
                              initialMission: offer,
                            ),
                          ),
                        ),
                        child: Row(
                          children: [
                            const Icon(Icons.schedule, size: 18, color: MovaColors.orange),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    '${offer['pickupAddress'] ?? ''} → ${offer['dropoffAddress'] ?? ''}',
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(fontWeight: FontWeight.w500, fontSize: 13),
                                  ),
                                  if (whenLabel.isNotEmpty) ...[
                                    const SizedBox(height: 4),
                                    Text(whenLabel, style: const TextStyle(fontSize: 11, color: MovaColors.textSecondary)),
                                  ],
                                  if (offer['driverNetCdf'] != null) ...[
                                    const SizedBox(height: 4),
                                    Text(
                                      trf('Gain net ~{v1}', {'v1': MarketConfig.formatCdf(offer['driverNetCdf'] as int)}),
                                      style: const TextStyle(fontSize: 11, color: MovaColors.green),
                                    ),
                                  ],
                                ],
                              ),
                            ),
                            if (offer['volunteered'] == true)
                              const Icon(Icons.how_to_reg, color: MovaColors.green, size: 20),
                          ],
                        ),
                      ),
                    );
                  }),
                ],
              ),
            ),
          ],
          if (_assignedMissions.isNotEmpty) ...[
            const SizedBox(height: _sectionGap),
            MovaCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      Icon(Icons.assignment_ind, size: 18, color: MovaColors.violet),
                      SizedBox(width: 8),
                      Text(tr('Missions assignées'), style: TextStyle(fontWeight: FontWeight.w600)),
                    ],
                  ),
                  const SizedBox(height: 12),
                  ..._assignedMissions.map((m) {
                    final icon = switch (m['type']?.toString()) {
                      'MOVING' => Icons.local_shipping,
                      'ERRAND' => Icons.shopping_bag_outlined,
                      'RENTAL' => Icons.directions_car_filled_outlined,
                      _ => Icons.event,
                    };
                    final subtitle = m['type']?.toString() == 'RENTAL'
                        ? '${m['vehicleName'] ?? m['label'] ?? tr('Location')} · ${m['pickupAddress'] ?? m['pickupCity'] ?? ''}'
                        : '${m['pickupAddress'] ?? ''} → ${m['dropoffAddress'] ?? m['deliveryAddress'] ?? ''}';
                    final extra = m['startDate'] != null
                        ? '\n${DateTime.tryParse(m['startDate'].toString())?.toLocal().toString().substring(0, 16) ?? ''}'
                        : m['scheduledAt'] != null
                            ? '\n${DateTime.tryParse(m['scheduledAt'].toString())?.toLocal().toString().substring(0, 16) ?? ''}'
                            : '';
                    return Padding(
                      padding: const EdgeInsets.only(top: _listItemGap),
                      child: InkWell(
                        onTap: _missionIsActionable(m) ? () => _openAssignedMission(m) : null,
                        borderRadius: BorderRadius.circular(8),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(vertical: 10),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Icon(icon, size: 20, color: MovaColors.violet),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      m['label']?.toString() ?? tr('Mission'),
                                      style: const TextStyle(fontWeight: FontWeight.w600),
                                    ),
                                    const SizedBox(height: 4),
                                    Text(
                                      '$subtitle$extra',
                                      style: const TextStyle(fontSize: 12, color: MovaColors.textSecondary),
                                      maxLines: 3,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                    const SizedBox(height: 4),
                                    Text(
                                      _missionStatusLabel(m['status']?.toString()),
                                      style: const TextStyle(fontSize: 11, color: MovaColors.violet, fontWeight: FontWeight.w600),
                                    ),
                                    if (_missionIsActionable(m)) ...[
                                      const SizedBox(height: 4),
                                      Text(
                                        tr('Appuyer pour gérer la mission'),
                                        style: TextStyle(fontSize: 11, color: MovaColors.green),
                                      ),
                                    ],
                                  ],
                                ),
                              ),
                              if (_missionIsActionable(m))
                                const Icon(Icons.chevron_right, size: 20, color: MovaColors.textSecondary),
                            ],
                          ),
                        ),
                      ),
                    );
                  }),
                ],
              ),
            ),
          ],
          if (_earnings != null) ...[
            const SizedBox(height: _sectionGap),
            MovaCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(tr('Revenus du jour')),
                  const SizedBox(height: _cardLineGap),
                  Text(
                    MarketConfig.formatCdf(_earnings!['todayCdf'] as int? ?? 0),
                    style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: MovaColors.green),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  if (_earnings!['withdrawableCdf'] != null) ...[
                    const SizedBox(height: _cardLineGap),
                    Text(
                      trf('Solde retrait : {v1}', {'v1': MarketConfig.formatCdf(_earnings!['withdrawableCdf'] as int? ?? 0)}),
                      style: const TextStyle(color: MovaColors.green, fontWeight: FontWeight.w600, fontSize: 13),
                    ),
                  ],
                  if (_earnings!['rideCount'] != null || _earnings!['deliveryCount'] != null) ...[
                    const SizedBox(height: _cardLineGap),
                    Text(
                      '${_earnings!['rideCount'] ?? 0} courses · ${_earnings!['deliveryCount'] ?? 0} livraisons',
                      style: const TextStyle(color: MovaColors.textSecondary, fontSize: 13),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ],
              ),
            ),
          ],
          if (_pendingCashRide != null) ...[
            const SizedBox(height: _sectionGap),
            MovaCard(
              onTap: _openPendingCashRide,
              child: Row(
                children: [
                  const Icon(Icons.payments_outlined, color: MovaColors.orange),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          tr('Paiement espèces en attente'),
                          style: TextStyle(fontWeight: FontWeight.bold, color: MovaColors.orange),
                        ),
                        const SizedBox(height: _cardLineGap),
                        Text(
                          _pendingCashRide!['pickupAddress']?.toString() ?? tr('Course terminée'),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        if ((_pendingCashRide!['finalFareCdf'] ?? _pendingCashRide!['estimatedFareCdf'] ?? _pendingCashRide!['amountCdf']) != null) ...[
                          const SizedBox(height: 4),
                          Text(
                            trf('À encaisser : {v1}', {'v1': MarketConfig.formatCdf(((_pendingCashRide!['finalFareCdf'] ?? _pendingCashRide!['estimatedFareCdf'] ?? _pendingCashRide!['amountCdf']) as num).round())}),
                            style: const TextStyle(fontWeight: FontWeight.w700, color: MovaColors.orange),
                          ),
                        ],
                        const SizedBox(height: 4),
                        Text(
                          tr('Appuyez pour saisir le code PIN du passager'),
                          style: TextStyle(color: MovaColors.textSecondary, fontSize: 12),
                        ),
                      ],
                    ),
                  ),
                  const Icon(Icons.chevron_right),
                ],
              ),
            ),
          ],
          if (_pendingCashDelivery != null) ...[
            const SizedBox(height: _sectionGap),
            MovaCard(
              onTap: _openPendingCashDelivery,
              child: Row(
                children: [
                  const Icon(Icons.payments_outlined, color: MovaColors.orange),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          tr('Paiement livraison espèces'),
                          style: TextStyle(fontWeight: FontWeight.bold, color: MovaColors.orange),
                        ),
                        const SizedBox(height: _cardLineGap),
                        Text(
                          _pendingCashDelivery!['pickupAddress']?.toString() ??
                              _pendingCashDelivery!['dropoffAddress']?.toString() ??
                              tr('Livraison terminée'),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 4),
                        Text(
                          tr('Appuyez pour saisir le code PIN du client'),
                          style: TextStyle(color: MovaColors.textSecondary, fontSize: 12),
                        ),
                      ],
                    ),
                  ),
                  const Icon(Icons.chevron_right),
                ],
              ),
            ),
          ],
          if (_activeRide != null) ...[
            const SizedBox(height: _sectionGap),
            MovaCard(
              onTap: () => Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => ActiveRideScreen(ride: _activeRide!)),
              ).then((_) {
                _loadActiveRide();
                _loadPendingCashRide();
              }),
              child: Row(
                children: [
                  const Icon(Icons.local_taxi, color: MovaColors.violet),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(tr('Course active'), style: TextStyle(fontWeight: FontWeight.bold)),
                        const SizedBox(height: _cardLineGap),
                        Text(
                          _activeRide!['pickupAddress']?.toString() ?? '',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ),
                  const Icon(Icons.chevron_right),
                ],
              ),
            ),
          ],
          if (_activeDelivery != null) ...[
            const SizedBox(height: _sectionGap),
            MovaCard(
              onTap: () => Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => ActiveDeliveryScreen(delivery: _activeDelivery!)),
              ).then((_) => _loadActiveDelivery()),
              child: Row(
                children: [
                  const Icon(Icons.delivery_dining, color: MovaColors.green),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(tr('Livraison active'), style: TextStyle(fontWeight: FontWeight.bold)),
                        const SizedBox(height: _cardLineGap),
                        Text(
                          _activeDelivery!['pickupAddress']?.toString() ?? '',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ),
                  const Icon(Icons.chevron_right),
                ],
              ),
            ),
          ],
          const SizedBox(height: _sectionGap),
          if (_available && _activeRide == null && _activeDelivery == null) ...[
            if (_offersError != null) ...[
              MovaErrorBanner(message: _offersError!, onRetry: _refreshRideOffers),
              const SizedBox(height: 12),
            ],
            if (_rideOffers.isNotEmpty) ...[
              MovaCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        const Icon(Icons.local_taxi, color: MovaColors.green, size: 20),
                        const SizedBox(width: 8),
                        Text(
                          trf('Courses disponibles ({length})', {'length': _rideOffers.length}),
                          style: const TextStyle(fontWeight: FontWeight.bold),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    ..._rideOffers.take(5).map((offer) {
                      final driverNet = DriverEarningsDisplay.netFromMap(offer);
                      final pickupKm = (offer['distanceToPickupKm'] as num?)?.toDouble();
                      final tripKm = (offer['tripDistanceKm'] as num?)?.toDouble() ??
                          (offer['distanceKm'] as num?)?.toDouble();
                      final distParts = <String>[
                        if (pickupKm != null) 'Vous → client ${GeoUtils.formatDistanceKm(pickupKm)}',
                        if (tripKm != null) 'Trajet ${GeoUtils.formatDistanceKm(tripKm)}',
                      ];
                      return ListTile(
                        contentPadding: const EdgeInsets.symmetric(vertical: 12, horizontal: 0),
                        minVerticalPadding: 12,
                        title: Text(
                          offer['pickupAddress']?.toString() ?? tr('Course'),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        subtitle: Text(
                          distParts.isNotEmpty
                              ? '${distParts.join(' · ')}\n→ ${offer['dropoffAddress']?.toString() ?? ''}'
                              : '→ ${offer['dropoffAddress']?.toString() ?? ''}',
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            if (driverNet != null)
                              Padding(
                                padding: const EdgeInsets.only(right: 4),
                                child: Text(
                                  MarketConfig.formatCdf(driverNet),
                                  style: const TextStyle(
                                    fontWeight: FontWeight.bold,
                                    color: MovaColors.green,
                                  ),
                                ),
                              ),
                            IconButton(
                              icon: const Icon(Icons.close, color: MovaColors.error, size: 20),
                              tooltip: tr('Refuser'),
                              onPressed: () => _rejectRideOffer(offer),
                            ),
                            const Icon(Icons.chevron_right, size: 20),
                          ],
                        ),
                        onTap: () => _openRideOffer(offer),
                      );
                    }),
                  ],
                ),
              ),
              const SizedBox(height: _sectionGap),
            ] else if (_rideOffers.isEmpty && _deliveryOffers.isEmpty)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Text(
                  _waitingOffersHint(),
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: MovaColors.textSecondary),
                ),
              ),
            if (_deliveryOffers.isNotEmpty) ...[
              MovaCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        const Icon(Icons.delivery_dining, color: MovaColors.violet, size: 20),
                        const SizedBox(width: 8),
                        Text(
                          trf('Livraisons disponibles ({length})', {'length': _deliveryOffers.length}),
                          style: const TextStyle(fontWeight: FontWeight.bold),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    ..._deliveryOffers
                        .where((offer) {
                          final id = offer['id']?.toString() ?? '';
                          return id.isEmpty || !_dismissedOffers.contains('delivery:$id');
                        })
                        .take(5)
                        .map((offer) {
                      final driverNet = DriverEarningsDisplay.netFromMap(offer);
                      final pickupKm = (offer['distanceToPickupKm'] as num?)?.toDouble();
                      final tripKm = (offer['tripDistanceKm'] as num?)?.toDouble() ??
                          (offer['distanceKm'] as num?)?.toDouble();
                      final type = offer['type']?.toString() ?? 'PARCEL';
                      final typeLabel = type == 'ERRAND' ? tr('Courses') : type;
                      final assigned = offer['alreadyAssigned'] == true;
                      final distParts = <String>[
                        if (pickupKm != null) 'Vous → colis ${GeoUtils.formatDistanceKm(pickupKm)}',
                        if (tripKm != null) 'Livraison ${GeoUtils.formatDistanceKm(tripKm)}',
                      ];
                      final photoUrl = (type == 'PARCEL' || type == 'EXPRESS')
                          ? offer['photoUrl']?.toString()
                          : null;
                      final hasPhoto = photoUrl != null && photoUrl.isNotEmpty;
                      return ListTile(
                        contentPadding: const EdgeInsets.symmetric(vertical: 12, horizontal: 0),
                        minVerticalPadding: 12,
                        leading: hasPhoto
                            ? ClipRRect(
                                borderRadius: BorderRadius.circular(8),
                                child: Image.network(
                                  MarketConfig.resolveMediaUrl(photoUrl),
                                  width: 48,
                                  height: 48,
                                  fit: BoxFit.cover,
                                  errorBuilder: (_, __, ___) => Container(
                                    width: 48,
                                    height: 48,
                                    color: Colors.grey.shade200,
                                    child: const Icon(Icons.inventory_2_outlined, size: 22),
                                  ),
                                ),
                              )
                            : null,
                        title: Text(
                          assigned
                              ? trf('Mission assignée — {v1}', {'v1': type == 'ERRAND' ? (offer['description']?.toString() ?? tr('Courses & commissions')) : (offer['pickupAddress']?.toString() ?? trf('Livraison {typeLabel}', {'typeLabel': typeLabel}))})
                              : type == 'ERRAND'
                                  ? (offer['description']?.toString() ?? tr('Courses & commissions'))
                                  : (offer['pickupAddress']?.toString() ?? trf('Livraison {typeLabel}', {'typeLabel': typeLabel})),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        subtitle: Text(
                          distParts.isNotEmpty
                              ? '${distParts.join(' · ')}\n→ ${offer['dropoffAddress']?.toString() ?? offer['deliveryAddress']?.toString() ?? ''}'
                              : '→ ${offer['dropoffAddress']?.toString() ?? offer['deliveryAddress']?.toString() ?? ''}',
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            if (driverNet != null)
                              Padding(
                                padding: const EdgeInsets.only(right: 4),
                                child: Text(
                                  MarketConfig.formatCdf(driverNet),
                                  style: const TextStyle(
                                    fontWeight: FontWeight.bold,
                                    color: MovaColors.violet,
                                  ),
                                ),
                              ),
                            if (!assigned)
                              IconButton(
                                icon: const Icon(Icons.close, color: MovaColors.error, size: 20),
                                tooltip: tr('Refuser'),
                                onPressed: () => _rejectDeliveryOffer(offer),
                              ),
                            const Icon(Icons.chevron_right, size: 20),
                          ],
                        ),
                        onTap: () async {
                          final id = offer['id']?.toString() ?? '';
                          if (id.isEmpty) return;
                          if (offer['alreadyAssigned'] == true) {
                            setState(() => _activeDelivery = offer);
                            await Navigator.push(
                              context,
                              MaterialPageRoute(builder: (_) => ActiveDeliveryScreen(delivery: offer)),
                            );
                            await _loadActiveDelivery();
                            await _refreshRideOffers();
                            return;
                          }
                          _openDeliveryOfferPopup(offer);
                        },
                      );
                    }),
                  ],
                ),
              ),
              const SizedBox(height: 12),
            ],
          ],
          SizedBox(height: MediaQuery.paddingOf(context).bottom + 24),
        ],
          ),
        ),
      ),
    );
  }
}

enum _DriverServiceMode { both, ridesOnly, deliveriesOnly }

import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import '../../core/config/market_config.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/cache/profile_cache.dart';
import '../../core/api/api_client.dart';
import '../../core/auth/session.dart';
import '../../core/offline/connectivity_service.dart';
import '../../core/location/service_area_gps.dart';
import '../../core/error/result.dart';
import '../../core/widgets/service_area_selector.dart';
import '../help/driver_help_screen.dart';
import '../carpool/carpool_screen.dart';
import 'active_delivery_screen.dart';
import 'active_ride_screen.dart';
import 'driver_onboarding_screen.dart';
import 'kyc_screen.dart';
import 'driver_ride_history_screen.dart';
import 'ride_offer_screen.dart';
import 'delivery_offer_screen.dart';
import 'driver_background_service.dart';
import 'driver_job_alert_service.dart';
import 'driver_moving_mission_screen.dart';
import 'driver_push_service.dart';
import 'driver_rental_mission_screen.dart';
import 'driver_scheduled_mission_screen.dart';

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
  Map<String, dynamic>? _activeDelivery;
  String? _availabilityError;
  String? _vehicleId;
  Timer? _offerPollTimer;
  Timer? _locationTimer;
  Timer? _profilePollTimer;
  Timer? _assignmentsPollTimer;
  final Set<String> _dismissedOffers = {};
  String? _profileError;
  bool _showingOffer = false;
  List<Map<String, dynamic>> _rideOffers = [];
  List<Map<String, dynamic>> _deliveryOffers = [];
  List<Map<String, dynamic>> _assignedMissions = [];
  final Set<String> _knownMissionKeys = {};
  final Set<String> _knownOfferKeys = {};
  bool _missionAlertsSeeded = false;
  bool _offerAlertsSeeded = false;
  String? _offersError;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _bootstrap();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _offerPollTimer?.cancel();
    _locationTimer?.cancel();
    _profilePollTimer?.cancel();
    _assignmentsPollTimer?.cancel();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && mounted) {
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
    ]);
    await DriverJobAlertService.init();
    await DriverPushService.init(ref.read(apiClientProvider));
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
    final errandResult = await api.get('/deliveries/assignments', skipCache: true);
    final rentalResult = await api.get('/rental/assignments', skipCache: true);
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
    setState(() => _assignedMissions = missions);
    _knownMissionKeys
      ..clear()
      ..addAll(missions.map(DriverJobAlertService.missionKey).where((k) => k.length > 1));
    if (_missionAlertsSeeded && newMissions.isNotEmpty && mounted) {
      final message = DriverJobAlertService.messageForMissions(newMissions);
      await DriverJobAlertService.notify(title: 'Mission assignée', body: message);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(message), duration: const Duration(seconds: 4)),
      );
    }
    _missionAlertsSeeded = true;
    await _loadActiveDelivery();
  }

  String _missionStatusLabel(String? status) {
    return switch (status?.toUpperCase()) {
      'ASSIGNED' => 'Assigné',
      'CONFIRMED' => 'Confirmé',
      'IN_PROGRESS' => 'En cours',
      'COMPLETED' => 'Terminé',
      'SCHEDULED' => 'Planifié',
      'PENDING' => 'En attente',
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
            const SnackBar(
              content: Text('KYC approuvé — saisissez votre code PIN d\'activation si demandé.'),
              backgroundColor: MovaColors.green,
            ),
          );
        }
        if (data['needsActivationPin'] == true && data['activationPinVerified'] != true) {
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

  void _maybeShowActivationPin({bool force = false}) {
    if (_profile?['activationPinVerified'] == true) return;
    if (_profile?['needsActivationPin'] != true && !force) return;
    if (!mounted) return;
    final controller = TextEditingController();
    showDialog<void>(
      context: context,
      barrierDismissible: !force,
      builder: (ctx) => AlertDialog(
        title: const Text('Code PIN d\'activation'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'Entrez le code à 6 chiffres communiqué par MOVA après validation de votre dossier.',
            ),
            const SizedBox(height: 12),
            TextField(
              controller: controller,
              keyboardType: TextInputType.number,
              maxLength: 6,
              decoration: const InputDecoration(labelText: 'PIN'),
            ),
          ],
        ),
        actions: [
          if (!force)
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Plus tard')),
          TextButton(
            onPressed: () async {
              final api = ref.read(apiClientProvider);
              final result = await api.post('/drivers/activation-pin', {'pin': controller.text.trim()});
              if (!ctx.mounted) return;
              switch (result) {
                case Success():
                  Navigator.pop(ctx);
                  await _loadProfile(clearCache: true);
                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Compte activé — vous pouvez passer en ligne.')),
                    );
                  }
                case Failure(:final error):
                  ScaffoldMessenger.of(ctx).showSnackBar(SnackBar(content: Text(error.message)));
              }
            },
            child: const Text('Activer'),
          ),
        ],
      ),
    );
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
    ]);
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
        setState(() => _pendingCashRide = data);
      case Failure():
        setState(() => _pendingCashRide = null);
    }
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
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.message)));
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
        final s = r['status']?.toString() ?? '';
        return s == 'DRIVER_ASSIGNED' || s == 'ARRIVING' || s == 'IN_PROGRESS';
      }).toList();
      if (active.isNotEmpty) {
        setState(() => _activeRide = active.first);
      } else {
        setState(() => _activeRide = null);
      }
    }
  }

  Future<void> _loadActiveDelivery() async {
    final api = ref.read(apiClientProvider);
    final result = await api.get('/deliveries/history?role=driver');
    if (!mounted) return;
    if (result case Success(:final data)) {
      final deliveries = (data['data'] as List? ?? []).cast<Map<String, dynamic>>();
      final active = deliveries.where((d) {
        final s = d['status']?.toString() ?? '';
        final type = d['type']?.toString() ?? '';
        if (type == 'ERRAND') {
          return s == 'ASSIGNED' || s == 'IN_PROGRESS';
        }
        return s == 'PICKED_UP' || s == 'IN_TRANSIT';
      }).toList();
      if (active.isNotEmpty) {
        setState(() => _activeDelivery = active.first);
      } else {
        setState(() => _activeDelivery = null);
      }
    }
  }

  Future<bool> _ensureGpsPosition() async {
    if (!await Geolocator.isLocationServiceEnabled()) return false;
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied || permission == LocationPermission.deniedForever) {
      return false;
    }
    return true;
  }

  Future<void> _pushLocation() async {
    if (!await _ensureGpsPosition()) return;
    final pos = await Geolocator.getCurrentPosition();
    await ref.read(apiClientProvider).updateDriverLocation(pos.latitude, pos.longitude);
  }

  Future<bool> _pushLocationRequired() async {
    if (!await _ensureGpsPosition()) return false;
    final pos = await Geolocator.getCurrentPosition();
    final result = await ref.read(apiClientProvider).updateDriverLocation(pos.latitude, pos.longitude);
    return result is Success;
  }

  void _startLocationUpdates() {
    _locationTimer?.cancel();
    _locationTimer = Timer.periodic(const Duration(seconds: 20), (_) => _pushLocation());
    _pushLocation();
  }

  void _stopLocationUpdates() {
    _locationTimer?.cancel();
  }

  void _startPolling() {
    _offerPollTimer?.cancel();
    _pollOffers();
    _offerPollTimer = Timer.periodic(const Duration(seconds: 3), (_) => _pollOffers());
    _startLocationUpdates();
    _refreshRideOffers();
  }

  void _stopPolling() {
    _offerPollTimer?.cancel();
    _stopLocationUpdates();
  }

  String? _vehicleIdForOffer(Map<String, dynamic> offer) {
    final rideType = (offer['vehicleType']?.toString() ?? 'STANDARD').toUpperCase();
    final normalized = rideType == 'MOTO' ? 'MOTO_TAXI' : rideType;
    final vehicles = (_profile?['vehicles'] as List?)?.cast<Map<String, dynamic>>() ?? [];
    for (final v in vehicles) {
      if (v['isActive'] == false) continue;
      if ((v['type']?.toString() ?? '').toUpperCase() == normalized) {
        return v['id']?.toString();
      }
    }
    return _vehicleId;
  }

  Future<void> _rejectRideOffer(Map<String, dynamic> offer) async {
    final id = offer['id']?.toString() ?? '';
    if (id.isEmpty) return;
    final api = ref.read(apiClientProvider);
    final result = await api.rejectRide(id);
    if (!mounted) return;
    if (result case Success()) {
      _dismissedOffers.add('ride:$id');
      await _refreshRideOffers();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Course refusée')),
        );
      }
    } else if (result case Failure(:final error)) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error.message)),
      );
    }
  }

  Future<void> _openRideOffer(Map<String, dynamic> offer) async {
    final id = offer['id']?.toString() ?? '';
    if (id.isEmpty) return;
    _showingOffer = true;
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => RideOfferScreen(
          offer: offer,
          vehicleId: _vehicleIdForOffer(offer),
        ),
      ),
    );
    _dismissedOffers.add('ride:$id');
    _showingOffer = false;
    await _loadActiveRide();
    await _refreshRideOffers();
  }

  Future<void> _syncKnownOfferKeys(Iterable<String> keys, {required List<Map<String, dynamic>> newOffers}) async {
    if (_offerAlertsSeeded && newOffers.isNotEmpty && mounted) {
      for (final offer in newOffers) {
        final isRide = offer.containsKey('vehicleType') && !offer.containsKey('deliveryType');
        final title = isRide ? 'Nouvelle course' : 'Nouvelle livraison';
        final body = isRide
            ? DriverJobAlertService.rideOfferMessage(offer)
            : DriverJobAlertService.deliveryOfferMessage(offer);
        await DriverJobAlertService.notify(title: title, body: body);
      }
    }
    _knownOfferKeys
      ..clear()
      ..addAll(keys);
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
    final keys = _collectOfferKeys(rides, deliveries);
    final newOffers = <Map<String, dynamic>>[];
    for (final o in rides) {
      final id = o['id']?.toString();
      if (id == null || id.isEmpty) continue;
      final key = DriverJobAlertService.offerKey('ride', id);
      if (!_knownOfferKeys.contains(key) && !_dismissedOffers.contains('ride:$id')) newOffers.add(o);
    }
    for (final o in deliveries) {
      final id = o['id']?.toString();
      if (id == null || id.isEmpty) continue;
      final key = DriverJobAlertService.offerKey('delivery', id);
      if (!_knownOfferKeys.contains(key) && !_dismissedOffers.contains('delivery:$id')) newOffers.add(o);
    }
    await _syncKnownOfferKeys(keys, newOffers: newOffers);
    setState(() {
      _rideOffers = rides;
      _deliveryOffers = deliveries;
      _offersError = null;
    });
  }

  Future<void> _pollOffers() async {
    if (!_available || _activeRide != null || _activeDelivery != null || _showingOffer || !mounted) return;
    final api = ref.read(apiClientProvider);

    final rideResult = await api.getDriverOffers();
    final deliveryResult = await api.getDeliveryOffers();
    if (!mounted || _showingOffer) return;

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
    final keys = _collectOfferKeys(rides, deliveries);
    final newOffers = <Map<String, dynamic>>[];
    for (final o in rides) {
      final id = o['id']?.toString();
      if (id == null || id.isEmpty) continue;
      final key = DriverJobAlertService.offerKey('ride', id);
      if (!_knownOfferKeys.contains(key) && !_dismissedOffers.contains('ride:$id')) newOffers.add(o);
    }
    for (final o in deliveries) {
      final id = o['id']?.toString();
      if (id == null || id.isEmpty) continue;
      final key = DriverJobAlertService.offerKey('delivery', id);
      if (!_knownOfferKeys.contains(key) && !_dismissedOffers.contains('delivery:$id')) newOffers.add(o);
    }
    await _syncKnownOfferKeys(keys, newOffers: newOffers);

    setState(() {
      _rideOffers = rides;
      _deliveryOffers = deliveries;
      _offersError = null;
    });

    for (final offer in rides) {
      final id = offer['id']?.toString() ?? '';
      if (id.isEmpty || _dismissedOffers.contains('ride:$id')) continue;
      await _openRideOffer(offer);
      return;
    }

    for (final offer in deliveries) {
      final id = offer['id']?.toString() ?? '';
      if (id.isEmpty || _dismissedOffers.contains('delivery:$id')) continue;
      if (offer['alreadyAssigned'] == true) {
        if (mounted) setState(() => _activeDelivery = offer);
        continue;
      }
      _showingOffer = true;
      if (!mounted) return;
      final accepted = await Navigator.push<Map<String, dynamic>?>(
        context,
        MaterialPageRoute(builder: (_) => DeliveryOfferScreen(offer: offer)),
      );
      _dismissedOffers.add('delivery:$id');
      _showingOffer = false;
      if (accepted != null && mounted) {
        setState(() => _activeDelivery = accepted);
        await Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => ActiveDeliveryScreen(delivery: accepted)),
        );
        await _loadActiveDelivery();
      }
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
            'Activez le GPS pour recevoir des courses près de vous.');
        return;
      }
      final located = await _pushLocationRequired();
      if (!located) {
        locationWarning =
            'Position non synchronisée — les offres peuvent être limitées tant que le réseau est instable.';
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
          _stopPolling();
          await DriverBackgroundService.stop();
        }
      case Failure(:final error):
        setState(() => _availabilityError = error.message);
    }
  }

  String? get _kycStatus => _profile?['kycStatus']?.toString();

  Map<String, dynamic>? get _documentsStatus =>
      _profile?['documentsStatus'] as Map<String, dynamic>?;

  bool get _documentsCanOperate => _documentsStatus?['canOperate'] == true;

  bool get _documentsRenewalPending => _profile?['documentsRenewalPending'] == true;

  String? get _documentsBlockReason => _documentsStatus?['blockReason']?.toString();

  @override
  Widget build(BuildContext context) {
    if (_bootstrapping) {
      return const MovaScreen(
        title: 'MOVA Chauffeur',
        child: Center(child: CircularProgressIndicator()),
      );
    }

    return MovaScreen(
      title: 'MOVA Chauffeur',
      scrollable: false,
      actions: [
        IconButton(
          icon: const Icon(Icons.account_balance_wallet_outlined),
          tooltip: 'Revenus',
          onPressed: () => Navigator.push(
            context,
            MaterialPageRoute(builder: (_) => const EarningsScreen()),
          ),
        ),
        IconButton(
          icon: const Icon(Icons.help_outline),
          tooltip: 'Aide',
          onPressed: () => Navigator.push(
            context,
            MaterialPageRoute(builder: (_) => const DriverHelpScreen()),
          ),
        ),
        IconButton(
          icon: const Icon(Icons.badge_outlined),
          tooltip: 'Mon dossier',
          onPressed: () async {
            await Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const DriverOnboardingScreen(canSkipToHome: true)),
            );
            if (mounted) await _loadProfile(clearCache: true);
          },
        ),
        IconButton(
          icon: const Icon(Icons.logout),
          tooltip: 'Déconnexion',
          onPressed: () async {
            final confirm = await showDialog<bool>(
              context: context,
              builder: (ctx) => AlertDialog(
                title: const Text('Déconnexion'),
                content: const Text('Voulez-vous vous déconnecter ?'),
                actions: [
                  TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Annuler')),
                  TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Déconnexion')),
                ],
              ),
            );
            if (confirm == true) {
              if (!context.mounted) return;
              await logoutDriver(context, ref);
            }
          },
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
            const SizedBox(height: 12),
          ],
          const Align(
            alignment: Alignment.centerLeft,
            child: ServiceAreaSelector(compact: true),
          ),
          const SizedBox(height: 12),
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
                          ? 'KYC en cours de validation — vous ne pouvez pas passer en ligne.'
                          : _kycStatus == 'REJECTED'
                              ? 'KYC refusé — renvoyez vos documents via l\'icône KYC.'
                              : 'Documents KYC requis pour accepter des courses.',
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
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
                          ? 'Renouvellement de documents en cours de validation MOVA. Mettez à jour vos justificatifs dans Enregistrement si nécessaire.'
                          : (_documentsBlockReason ??
                              'Permis, assurance ou visite technique expiré(s) ou incomplet(s). '
                                  'Mettez à jour vos dates dans Enregistrement avant de recevoir des missions.'),
                      maxLines: 4,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
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
                      'Attention : certains documents expirent bientôt. Pensez à les renouveler.',
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
                      const Text('Disponibilité'),
                      Text(
                        _available ? 'En ligne' : 'Hors ligne',
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
                          'Documents KYC approuvés requis pour passer en ligne.');
                      return;
                    }
                    if (value && !_documentsCanOperate) {
                      setState(() => _availabilityError =
                          _documentsBlockReason ??
                              'Documents expirés ou incomplets — mettez à jour vos dates d\'expiration.');
                      return;
                    }
                    _toggleAvailability(value);
                  },
                ),
              ],
            ),
          ),
          if (_availabilityError != null) ...[
            const SizedBox(height: 8),
            MovaErrorBanner(message: _availabilityError!),
          ],
          const SizedBox(height: 12),
          MovaCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Row(
                  children: [
                    Icon(Icons.info_outline, size: 18, color: MovaColors.violet),
                    SizedBox(width: 8),
                    Text('Offres reçues en ligne', style: TextStyle(fontWeight: FontWeight.w600)),
                  ],
                ),
                const SizedBox(height: 8),
                const Text(
                  '• Courses taxi : proches de votre GPS, dans le rayon de recherche, véhicule compatible.\n'
                  '• Livraisons & courses/commissions : colis, repas, express et achats en attente, dans un rayon de 15 km.\n'
                  '• Réservations planifiées, déménagements et locations logistiques : assignés par l’admin — ouvrez une mission pour démarrer / terminer.\n'
                  '• Covoiturage : publiez votre trajet via le bouton ci-dessous.',
                  style: TextStyle(fontSize: 12, color: MovaColors.textSecondary, height: 1.4),
                ),
              ],
            ),
          ),
          if (_assignedMissions.isNotEmpty) ...[
            const SizedBox(height: 16),
            MovaCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Row(
                    children: [
                      Icon(Icons.assignment_ind, size: 18, color: MovaColors.violet),
                      SizedBox(width: 8),
                      Text('Missions assignées', style: TextStyle(fontWeight: FontWeight.w600)),
                    ],
                  ),
                  const SizedBox(height: 8),
                  ..._assignedMissions.map((m) {
                    final icon = switch (m['type']?.toString()) {
                      'MOVING' => Icons.local_shipping,
                      'ERRAND' => Icons.shopping_bag_outlined,
                      'RENTAL' => Icons.directions_car_filled_outlined,
                      _ => Icons.event,
                    };
                    final subtitle = m['type']?.toString() == 'RENTAL'
                        ? '${m['vehicleName'] ?? m['label'] ?? 'Location'} · ${m['pickupAddress'] ?? m['pickupCity'] ?? ''}'
                        : '${m['pickupAddress'] ?? ''} → ${m['dropoffAddress'] ?? m['deliveryAddress'] ?? ''}';
                    final extra = m['startDate'] != null
                        ? '\n${DateTime.tryParse(m['startDate'].toString())?.toLocal().toString().substring(0, 16) ?? ''}'
                        : m['scheduledAt'] != null
                            ? '\n${DateTime.tryParse(m['scheduledAt'].toString())?.toLocal().toString().substring(0, 16) ?? ''}'
                            : '';
                    return Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: InkWell(
                        onTap: _missionIsActionable(m) ? () => _openAssignedMission(m) : null,
                        borderRadius: BorderRadius.circular(8),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(vertical: 4),
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
                                      m['label']?.toString() ?? 'Mission',
                                      style: const TextStyle(fontWeight: FontWeight.w600),
                                    ),
                                    Text(
                                      '$subtitle$extra',
                                      style: const TextStyle(fontSize: 12, color: MovaColors.textSecondary),
                                      maxLines: 3,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                    Text(
                                      _missionStatusLabel(m['status']?.toString()),
                                      style: const TextStyle(fontSize: 11, color: MovaColors.violet, fontWeight: FontWeight.w600),
                                    ),
                                    if (_missionIsActionable(m))
                                      const Text(
                                        'Appuyer pour gérer la mission',
                                        style: TextStyle(fontSize: 11, color: MovaColors.green),
                                      ),
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
            const SizedBox(height: 16),
            MovaCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Revenus du jour'),
                  Text(
                    MarketConfig.formatCdf(_earnings!['todayCdf'] as int? ?? 0),
                    style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: MovaColors.green),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  if (_earnings!['withdrawableCdf'] != null)
                    Text(
                      'Solde retrait : ${MarketConfig.formatCdf(_earnings!['withdrawableCdf'] as int? ?? 0)}',
                      style: const TextStyle(color: MovaColors.green, fontWeight: FontWeight.w600, fontSize: 13),
                    ),
                  if (_earnings!['rideCount'] != null || _earnings!['deliveryCount'] != null)
                    Text(
                      '${_earnings!['rideCount'] ?? 0} courses · ${_earnings!['deliveryCount'] ?? 0} livraisons',
                      style: const TextStyle(color: MovaColors.textSecondary, fontSize: 13),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                ],
              ),
            ),
          ],
          if (_pendingCashRide != null) ...[
            const SizedBox(height: 16),
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
                        const Text(
                          'Paiement espèces en attente',
                          style: TextStyle(fontWeight: FontWeight.bold, color: MovaColors.orange),
                        ),
                        Text(
                          _pendingCashRide!['pickupAddress']?.toString() ?? 'Course terminée',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const Text(
                          'Appuyez pour saisir le code PIN du passager',
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
            const SizedBox(height: 16),
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
                        const Text('Course active', style: TextStyle(fontWeight: FontWeight.bold)),
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
            const SizedBox(height: 16),
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
                        const Text('Livraison active', style: TextStyle(fontWeight: FontWeight.bold)),
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
          const SizedBox(height: 16),
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
                          'Courses disponibles (${_rideOffers.length})',
                          style: const TextStyle(fontWeight: FontWeight.bold),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    ..._rideOffers.take(5).map((offer) {
                      final fare = (offer['estimatedFareCdf'] ?? offer['priceCdf']) as num?;
                      return ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text(
                          offer['pickupAddress']?.toString() ?? 'Course',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        subtitle: Text(
                          '→ ${offer['dropoffAddress']?.toString() ?? ''}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            if (fare != null)
                              Padding(
                                padding: const EdgeInsets.only(right: 4),
                                child: Text(
                                  MarketConfig.formatCdf(fare.toInt()),
                                  style: const TextStyle(
                                    fontWeight: FontWeight.bold,
                                    color: MovaColors.green,
                                  ),
                                ),
                              ),
                            IconButton(
                              icon: const Icon(Icons.close, color: MovaColors.error, size: 20),
                              tooltip: 'Refuser',
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
              const SizedBox(height: 12),
            ] else if (_rideOffers.isEmpty && _deliveryOffers.isEmpty)
              const Padding(
                padding: EdgeInsets.only(bottom: 12),
                child: Text(
                  'En attente de courses ou livraisons à proximité…\n'
                  'Vérifiez : En ligne, GPS activé, KYC approuvé.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: MovaColors.textSecondary),
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
                          'Livraisons disponibles (${_deliveryOffers.length})',
                          style: const TextStyle(fontWeight: FontWeight.bold),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    ..._deliveryOffers.take(5).map((offer) {
                      final fare = (offer['estimatedPriceCdf'] ?? offer['priceCdf']) as num?;
                      final type = offer['type']?.toString() ?? 'PARCEL';
                      final typeLabel = type == 'ERRAND' ? 'Courses' : type;
                      final assigned = offer['alreadyAssigned'] == true;
                      return ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text(
                          assigned
                              ? 'Mission assignée — ${type == 'ERRAND' ? (offer['description']?.toString() ?? 'Courses & commissions') : (offer['pickupAddress']?.toString() ?? 'Livraison $typeLabel')}'
                              : type == 'ERRAND'
                                  ? (offer['description']?.toString() ?? 'Courses & commissions')
                                  : (offer['pickupAddress']?.toString() ?? 'Livraison $typeLabel'),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        subtitle: Text(
                          '→ ${offer['dropoffAddress']?.toString() ?? offer['deliveryAddress']?.toString() ?? ''}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        trailing: fare != null
                            ? Text(
                                MarketConfig.formatCdf(fare.toInt()),
                                style: const TextStyle(
                                  fontWeight: FontWeight.bold,
                                  color: MovaColors.violet,
                                ),
                              )
                            : const Icon(Icons.chevron_right),
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
                          _showingOffer = true;
                          final accepted = await Navigator.push<Map<String, dynamic>?>(
                            context,
                            MaterialPageRoute(builder: (_) => DeliveryOfferScreen(offer: offer)),
                          );
                          _dismissedOffers.add('delivery:$id');
                          _showingOffer = false;
                          if (accepted != null && mounted) {
                            setState(() => _activeDelivery = accepted);
                            await Navigator.push(
                              context,
                              MaterialPageRoute(builder: (_) => ActiveDeliveryScreen(delivery: accepted)),
                            );
                            await _loadActiveDelivery();
                          }
                          await _refreshRideOffers();
                        },
                      );
                    }),
                  ],
                ),
              ),
              const SizedBox(height: 12),
            ],
          ],
          MovaButton(
            label: 'Publier un covoiturage',
            isSecondary: true,
            icon: Icons.people_alt_outlined,
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => const CarpoolScreen(forDriver: true),
              ),
            ),
          ),
          const SizedBox(height: 8),
          if (kDebugMode) ...[
            MovaButton(
              label: 'Tester son & vibration',
              isSecondary: true,
              icon: Icons.notifications_active_outlined,
              onPressed: () async {
                await DriverJobAlertService.notify(
                  title: 'MOVA Chauffeur',
                  body: 'Test alerte — course disponible · Gombe · 8500 FC',
                  payload: 'debug:alert',
                );
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Alerte envoyée (sans Firebase)')),
                  );
                }
              },
            ),
            const SizedBox(height: 8),
            MovaButton(
              label: 'Simulation (debug)',
              isSecondary: true,
              icon: Icons.bug_report_outlined,
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => RideOfferScreen(
                    offer: {
                      'id': 'debug-offer',
                      'pickupAddress': 'Gombe',
                      'dropoffAddress': 'Limete',
                      'pickupLat': -4.32,
                      'pickupLng': 15.31,
                      'estimatedFareCdf': 8500,
                      'distanceKm': 3.2,
                    },
                    vehicleId: _vehicleId,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 8),
          ],
          MovaButton(
            label: 'Mes courses',
            isSecondary: true,
            icon: Icons.history,
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const DriverRideHistoryScreen()),
            ),
          ),
          const SizedBox(height: 8),
          MovaButton(
            label: 'Mes revenus',
            isSecondary: true,
            icon: Icons.account_balance_wallet,
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const EarningsScreen()),
            ),
          ),
          const SizedBox(height: 8),
          MovaButton(
            label: 'Documents KYC',
            isSecondary: true,
            icon: Icons.upload_file,
            onPressed: () async {
              await Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const DriverOnboardingScreen(canSkipToHome: true)),
              );
              if (mounted) await _loadProfile(clearCache: true);
            },
          ),
          const SizedBox(height: 8),
          MovaButton(
            label: 'Signaler un incident',
            isSecondary: true,
            icon: Icons.report_problem,
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const IncidentScreen()),
            ),
          ),
          SizedBox(height: MediaQuery.paddingOf(context).bottom + 16),
        ],
          ),
        ),
      ),
    );
  }
}

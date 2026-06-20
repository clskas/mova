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
import '../../core/error/result.dart';
import '../help/driver_help_screen.dart';
import '../carpool/carpool_screen.dart';
import 'active_delivery_screen.dart';
import 'active_ride_screen.dart';
import 'driver_onboarding_screen.dart';
import 'kyc_screen.dart';
import 'driver_ride_history_screen.dart';
import 'ride_offer_screen.dart';
import 'delivery_offer_screen.dart';

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
      ref.read(apiClientProvider).checkHealth().then((_) {
        if (mounted) _loadProfile(clearCache: true);
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
    await api.loadToken();
    await api.checkHealth();
    await Future.wait([
      _loadProfile(clearCache: true),
      _loadEarnings(),
      _loadActiveRide(),
      _loadActiveDelivery(),
      _loadAssignments(),
    ]);
    if (mounted) {
      setState(() => _bootstrapping = false);
      _startAssignmentsPolling();
      if (_available) _startPolling();
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
    missions.sort((a, b) {
      final aDate = a['scheduledAt']?.toString() ?? a['createdAt']?.toString() ?? '';
      final bDate = b['scheduledAt']?.toString() ?? b['createdAt']?.toString() ?? '';
      return aDate.compareTo(bDate);
    });
    setState(() => _assignedMissions = missions);
  }

  String _missionStatusLabel(String? status) {
    return switch (status?.toUpperCase()) {
      'ASSIGNED' => 'Assigné',
      'CONFIRMED' => 'Confirmé',
      'IN_PROGRESS' => 'En cours',
      'SCHEDULED' => 'Planifié',
      'PENDING' => 'En attente',
      _ => status ?? '—',
    };
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
      Failure(:final error) => null,
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
    if (!mounted || _showingOffer) return;
    if (rideResult case Success(:final data)) {
      setState(() {
        _rideOffers = data;
        _offersError = null;
      });
      for (final offer in data) {
        final id = offer['id']?.toString() ?? '';
        if (id.isEmpty || _dismissedOffers.contains('ride:$id')) continue;
        await _openRideOffer(offer);
        return;
      }
    } else if (rideResult case Failure(:final error)) {
      setState(() => _offersError = error.message);
    }

    final deliveryResult = await api.getDeliveryOffers();
    if (!mounted || _showingOffer) return;
    if (deliveryResult case Success(:final data)) {
      setState(() => _deliveryOffers = data);
      for (final offer in data) {
        final id = offer['id']?.toString() ?? '';
        if (id.isEmpty || _dismissedOffers.contains('delivery:$id')) continue;
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
          return;
        }
        break;
      }
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
        } else {
          _stopPolling();
        }
      case Failure(:final error):
        setState(() => _availabilityError = error.message);
    }
  }

  String? get _kycStatus => _profile?['kycStatus']?.toString();

  @override
  Widget build(BuildContext context) {
    if (_bootstrapping) {
      return const MovaScreen(
        title: 'MOVA Chauffeur',
        child: Center(child: CircularProgressIndicator()),
      );
    }

    final api = ref.read(apiClientProvider);
    final mockBanner = api.isMockMode;

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
          if (mockBanner)
            const Padding(
              padding: EdgeInsets.only(bottom: 12),
              child: MovaCard(
                child: Text(
                  'Mode démo — passerelle indisponible',
                  style: TextStyle(color: MovaColors.orange, fontWeight: FontWeight.w600),
                ),
              ),
            ),
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
                  '• Livraisons : colis/repas/express en attente, dans un rayon de 15 km.\n'
                  '• Réservations planifiées et déménagements : assignés par l’admin — consultez la section « Missions assignées » ci-dessous.\n'
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
                    final icon = m['type'] == 'MOVING' ? Icons.local_shipping : Icons.event;
                    final subtitle = m['type'] == 'MOVING'
                        ? '${m['pickupAddress'] ?? ''} → ${m['dropoffAddress'] ?? ''}'
                        : '${m['pickupAddress'] ?? 'Départ'} → ${m['dropoffAddress'] ?? ''}';
                    final extra = m['scheduledAt'] != null
                        ? '\n${DateTime.tryParse(m['scheduledAt'].toString())?.toLocal().toString().substring(0, 16) ?? ''}'
                        : '';
                    return Padding(
                      padding: const EdgeInsets.only(top: 8),
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
                              ],
                            ),
                          ),
                        ],
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
          if (_activeRide != null) ...[
            const SizedBox(height: 16),
            MovaCard(
              onTap: () => Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => ActiveRideScreen(ride: _activeRide!)),
              ).then((_) => _loadActiveRide()),
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
                      return ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text(
                          offer['pickupAddress']?.toString() ?? 'Livraison $type',
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

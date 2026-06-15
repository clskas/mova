import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import '../../core/config/market_config.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/api/api_client.dart';
import '../../core/error/result.dart';
import '../help/driver_help_screen.dart';
import 'active_ride_screen.dart';
import 'kyc_screen.dart';
import 'ride_offer_screen.dart';

class DriverHomeScreen extends ConsumerStatefulWidget {
  const DriverHomeScreen({super.key});

  @override
  ConsumerState<DriverHomeScreen> createState() => _DriverHomeScreenState();
}

class _DriverHomeScreenState extends ConsumerState<DriverHomeScreen> {
  bool _available = false;
  bool _bootstrapping = true;
  Map<String, dynamic>? _earnings;
  Map<String, dynamic>? _profile;
  Map<String, dynamic>? _activeRide;
  String? _availabilityError;
  String? _vehicleId;
  Timer? _offerPollTimer;
  Timer? _locationTimer;
  final Set<String> _dismissedOffers = {};
  bool _showingOffer = false;

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  @override
  void dispose() {
    _offerPollTimer?.cancel();
    _locationTimer?.cancel();
    super.dispose();
  }

  Future<void> _bootstrap() async {
    final api = ref.read(apiClientProvider);
    await api.loadToken();
    await api.checkHealth();
    await Future.wait([_loadProfile(), _loadEarnings(), _loadActiveRide()]);
    if (mounted) {
      setState(() => _bootstrapping = false);
      if (_available) _startPolling();
    }
  }

  Future<void> _loadProfile() async {
    final api = ref.read(apiClientProvider);
    final result = await api.getDriverProfile();
    if (!mounted) return;
    if (result case Success(:final data)) {
      final vehicles = data['vehicles'] as List? ?? [];
      final activeVehicle = vehicles.cast<Map<String, dynamic>>().firstWhere(
            (v) => v['isActive'] == true,
            orElse: () => vehicles.isNotEmpty ? vehicles.first as Map<String, dynamic> : {},
          );
      setState(() {
        _profile = data;
        _available = data['isAvailable'] == true;
        _vehicleId = activeVehicle['id']?.toString();
      });
    }
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
      final rides = (data['data'] as List? ?? []).cast<Map<String, dynamic>>();
      final active = rides.where((r) {
        final s = r['status']?.toString() ?? '';
        return s == 'DRIVER_ASSIGNED' || s == 'ARRIVING' || s == 'IN_PROGRESS';
      }).toList();
      if (active.isNotEmpty) {
        setState(() => _activeRide = active.first);
      }
    }
  }

  Future<void> _pushLocation() async {
    if (!await Geolocator.isLocationServiceEnabled()) return;
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied || permission == LocationPermission.deniedForever) {
      return;
    }
    final pos = await Geolocator.getCurrentPosition();
    await ref.read(apiClientProvider).updateDriverLocation(pos.latitude, pos.longitude);
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
    _offerPollTimer = Timer.periodic(const Duration(seconds: 5), (_) => _pollOffers());
    _startLocationUpdates();
  }

  void _stopPolling() {
    _offerPollTimer?.cancel();
    _stopLocationUpdates();
  }

  Future<void> _pollOffers() async {
    if (!_available || _activeRide != null || _showingOffer || !mounted) return;
    final api = ref.read(apiClientProvider);
    final result = await api.getDriverOffers();
    if (!mounted || _showingOffer) return;
    if (result case Success(:final data)) {
      final offers = data;
      for (final offer in offers) {
        final id = offer['id']?.toString() ?? '';
        if (id.isEmpty || _dismissedOffers.contains(id)) continue;
        _showingOffer = true;
        await Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => RideOfferScreen(offer: offer, vehicleId: _vehicleId),
          ),
        );
        _dismissedOffers.add(id);
        _showingOffer = false;
        await _loadActiveRide();
        break;
      }
    }
  }

  Future<void> _toggleAvailability(bool value) async {
    setState(() => _availabilityError = null);
    if (value) {
      await _pushLocation();
    }
    final api = ref.read(apiClientProvider);
    final result = await api.patch('/drivers/availability', {'isAvailable': value});
    if (!mounted) return;
    switch (result) {
      case Success():
        setState(() => _available = value);
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
          icon: const Icon(Icons.upload_file),
          tooltip: 'KYC',
          onPressed: () => Navigator.push(
            context,
            MaterialPageRoute(builder: (_) => const KycScreen()),
          ),
        ),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
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
                  const Icon(Icons.warning_amber, color: MovaColors.orange),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      _kycStatus == 'PENDING'
                          ? 'KYC en cours de validation — vous ne pouvez pas passer en ligne.'
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
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Disponibilité'),
                    Text(
                      _available ? 'En ligne' : 'Hors ligne',
                      style: TextStyle(
                        color: _available ? MovaColors.green : MovaColors.textSecondary,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ),
                Switch(
                  value: _available,
                  activeColor: MovaColors.green,
                  onChanged: _kycStatus == 'APPROVED' ? _toggleAvailability : null,
                ),
              ],
            ),
          ),
          if (_availabilityError != null) ...[
            const SizedBox(height: 8),
            MovaErrorBanner(message: _availabilityError!),
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
                  ),
                  if (_earnings!['rideCount'] != null)
                    Text(
                      '${_earnings!['rideCount']} courses terminées',
                      style: const TextStyle(color: MovaColors.textSecondary, fontSize: 13),
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
          const SizedBox(height: 16),
          if (_available && _activeRide == null)
            const Padding(
              padding: EdgeInsets.only(bottom: 12),
              child: Text(
                'En attente de courses…',
                textAlign: TextAlign.center,
                style: TextStyle(color: MovaColors.textSecondary),
              ),
            ),
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
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const KycScreen()),
            ),
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
        ],
      ),
    );
  }
}

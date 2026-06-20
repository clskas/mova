import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import '../../core/api/api_client.dart';
import '../../core/api/ride_socket.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/geo/maps_launcher.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import '../chat/ride_chat_screen.dart';

class ActiveRideScreen extends ConsumerStatefulWidget {
  const ActiveRideScreen({super.key, required this.ride});

  final Map<String, dynamic> ride;

  @override
  ConsumerState<ActiveRideScreen> createState() => _ActiveRideScreenState();
}

class _ActiveRideScreenState extends ConsumerState<ActiveRideScreen> {
  late Map<String, dynamic> _ride;
  bool _loading = false;
  String? _error;
  Timer? _locationTimer;
  String? _userId;
  double? _currentLat;
  double? _currentLng;

  String get _rideId => _ride['id']?.toString() ?? '';
  String get _status => _ride['status']?.toString() ?? 'DRIVER_ASSIGNED';

  @override
  void initState() {
    super.initState();
    _ride = Map<String, dynamic>.from(widget.ride);
    _bootstrap();
  }

  @override
  void dispose() {
    _locationTimer?.cancel();
    ref.read(rideSocketProvider).dispose();
    super.dispose();
  }

  Future<void> _bootstrap() async {
    final api = ref.read(apiClientProvider);
    final profile = await api.getDriverProfile();
    if (profile case Success(:final data)) {
      _userId = data['userId']?.toString();
    }
    await _refreshRide();
    await _connectTrackingSocket();
    _startLocationUpdates();
  }

  Future<void> _connectTrackingSocket() async {
    final api = ref.read(apiClientProvider);
    if (api.isMockMode) return;
    final token = await api.authToken();
    if (!mounted) return;
    final socket = ref.read(rideSocketProvider);
    socket.connect(
      rideId: _rideId,
      token: token,
    );
  }

  Future<void> _refreshRide() async {
    final api = ref.read(apiClientProvider);
    final result = await api.getRide(_rideId);
    if (!mounted) return;
    if (result case Success(:final data)) {
      setState(() => _ride = data);
    }
  }

  void _startLocationUpdates() {
    _locationTimer?.cancel();
    _locationTimer = Timer.periodic(const Duration(seconds: 12), (_) => _pushLocation());
    _pushLocation();
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
    _currentLat = pos.latitude;
    _currentLng = pos.longitude;
    final api = ref.read(apiClientProvider);
    await api.updateDriverLocation(pos.latitude, pos.longitude);

    final socket = ref.read(rideSocketProvider);
    if (!socket.isConnected && !api.isMockMode) {
      await _connectTrackingSocket();
    }
    socket.emitDriverLocation(
      userId: _userId ?? '',
      lat: pos.latitude,
      lng: pos.longitude,
      rideId: _rideId,
    );
    if (!api.isMockMode) {
      await api.recordTrackingPoint('ride', _rideId, pos.latitude, pos.longitude);
    }
  }

  Future<void> _openNavigation({required bool toPickup}) async {
    final lat = (toPickup ? _ride['pickupLat'] : _ride['dropoffLat']) as num?;
    final lng = (toPickup ? _ride['pickupLng'] : _ride['dropoffLng']) as num?;
    if (lat == null || lng == null) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Coordonnées GPS indisponibles pour la navigation')),
        );
      }
      return;
    }
    final opened = await MapsLauncher.openDirections(
      destinationLat: lat.toDouble(),
      destinationLng: lng.toDouble(),
      originLat: _currentLat,
      originLng: _currentLng,
    );
    if (!opened && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Impossible d\'ouvrir Google Maps')),
      );
    }
  }

  Future<void> _openPickup() => _openNavigation(toPickup: true);

  Future<void> _openDropoff() => _openNavigation(toPickup: false);

  Future<void> _advanceStatus(String nextStatus) async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final api = ref.read(apiClientProvider);
    final result = await api.updateRideStatus(_rideId, nextStatus);
    if (!mounted) return;
    setState(() => _loading = false);
    switch (result) {
      case Success(:final data):
        setState(() => _ride = data);
        if (nextStatus == 'COMPLETED') {
          _locationTimer?.cancel();
          ref.read(rideSocketProvider).dispose();
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text('Course terminée — ${MarketConfig.formatCdf(_ride['priceCdf'] as int? ?? 0)}')),
            );
            Navigator.popUntil(context, (r) => r.isFirst);
          }
        }
      case Failure(:final error):
        setState(() => _error = error.message);
    }
  }

  String? _nextActionLabel() => switch (_status) {
        'DRIVER_ASSIGNED' => 'Je suis arrivé',
        'ARRIVING' => 'Démarrer la course',
        'IN_PROGRESS' => 'Terminer la course',
        _ => null,
      };

  String? _nextStatus() => switch (_status) {
        'DRIVER_ASSIGNED' => 'ARRIVING',
        'ARRIVING' => 'IN_PROGRESS',
        'IN_PROGRESS' => 'COMPLETED',
        _ => null,
      };

  @override
  Widget build(BuildContext context) {
    final fare = _ride['priceCdf'] as int? ?? _ride['estimatedFareCdf'] as int? ?? 0;
    final nextLabel = _nextActionLabel();
    final nextStatus = _nextStatus();
    final headingToPickup = _status == 'DRIVER_ASSIGNED' || _status == 'ACCEPTED';

    return MovaScreen(
      title: 'Course en cours',
      actions: [
        IconButton(
          icon: const Icon(Icons.chat_bubble_outline),
          tooltip: 'Chat passager',
          onPressed: () {
            Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => RideChatScreen(
                  rideId: _rideId,
                  myRole: 'driver',
                  peerLabel: 'Passager',
                ),
              ),
            );
          },
        ),
        IconButton(icon: const Icon(Icons.refresh), onPressed: _refreshRide),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (headingToPickup)
            Container(
              decoration: BoxDecoration(
                color: MovaColors.violet.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: MovaColors.violet.withValues(alpha: 0.2)),
              ),
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.navigation, color: MovaColors.violet),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Rendez-vous passager',
                          style: const TextStyle(fontWeight: FontWeight.bold),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    _ride['pickupAddress']?.toString() ?? 'Point de prise en charge',
                    style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600),
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 12),
                  MovaButton(
                    label: 'Navigation vers le passager',
                    icon: Icons.directions,
                    onPressed: _openPickup,
                  ),
                ],
              ),
            ),
          if (headingToPickup) const SizedBox(height: 12),
          MovaCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (!headingToPickup)
                  Text(
                    _ride['pickupAddress']?.toString() ?? 'Départ',
                    style: const TextStyle(fontWeight: FontWeight.bold),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                Text(
                  headingToPickup
                      ? 'Destination : ${_ride['dropoffAddress']?.toString() ?? 'Arrivée'}'
                      : '→ ${_ride['dropoffAddress']?.toString() ?? 'Arrivée'}',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 8),
                Text(
                  MarketConfig.formatCdf(fare),
                  style: const TextStyle(color: MovaColors.green, fontWeight: FontWeight.bold, fontSize: 20),
                ),
                const SizedBox(height: 4),
                Text(
                  _statusLabel(_status),
                  style: const TextStyle(color: MovaColors.violet, fontWeight: FontWeight.w600),
                ),
              ],
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            MovaErrorBanner(message: _error!),
          ],
          const SizedBox(height: 16),
          if (!headingToPickup)
            MovaButton(
              label: 'Navigation destination',
              isSecondary: true,
              icon: Icons.navigation_outlined,
              onPressed: _openDropoff,
            ),
          if (!headingToPickup) const SizedBox(height: 12),
          if (nextLabel != null && nextStatus != null) ...[
            const SizedBox(height: 12),
            MovaButton(
              label: nextLabel,
              icon: Icons.arrow_forward,
              isLoading: _loading,
              onPressed: _loading ? null : () => _advanceStatus(nextStatus),
            ),
          ],
          if (_status == 'COMPLETED') ...[
            const SizedBox(height: 12),
            MovaButton(
              label: 'Confirmer paiement espèces',
              isSecondary: true,
              icon: Icons.payments_outlined,
              onPressed: _confirmCash,
            ),
          ],
        ],
      ),
    );
  }

  Future<void> _confirmCash() async {
    final pinController = TextEditingController();
    final pin = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Confirmer espèces'),
        content: TextField(
          controller: pinController,
          keyboardType: TextInputType.number,
          maxLength: 4,
          decoration: const InputDecoration(labelText: 'Code PIN passager'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Annuler')),
          TextButton(onPressed: () => Navigator.pop(ctx, pinController.text.trim()), child: const Text('Valider')),
        ],
      ),
    );
    pinController.dispose();
    if (pin == null || pin.isEmpty || !mounted) return;
    setState(() => _loading = true);
    final api = ref.read(apiClientProvider);
    final result = await api.confirmCashRide(_rideId, pin);
    if (!mounted) return;
    setState(() => _loading = false);
    switch (result) {
      case Success():
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Paiement espèces confirmé')),
        );
      case Failure(:final error):
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.message)));
    }
  }

  String _statusLabel(String status) => switch (status) {
        'DRIVER_ASSIGNED' => 'En route vers le passager',
        'ARRIVING' => 'Arrivé — en attente du passager',
        'IN_PROGRESS' => 'Course en cours',
        'COMPLETED' => 'Terminée',
        _ => status,
      };
}

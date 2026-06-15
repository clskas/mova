import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/api/api_client.dart';
import '../../core/api/ride_socket.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';

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
    _startLocationUpdates();
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
    final api = ref.read(apiClientProvider);
    await api.updateDriverLocation(pos.latitude, pos.longitude);

    final token = await api.authToken();
    final socket = ref.read(rideSocketProvider);
    socket.connect(
      rideId: _rideId,
      token: token,
      onConnected: () {
        socket.emitDriverLocation(
          userId: _userId ?? '',
          lat: pos.latitude,
          lng: pos.longitude,
          rideId: _rideId,
        );
      },
    );
    socket.emitDriverLocation(
      userId: _userId ?? '',
      lat: pos.latitude,
      lng: pos.longitude,
      rideId: _rideId,
    );
  }

  Future<void> _advanceStatus(String nextStatus, {String? buttonLabel}) async {
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

  Future<void> _openDropoff() async {
    final lat = _ride['dropoffLat'] as num?;
    final lng = _ride['dropoffLng'] as num?;
    if (lat == null || lng == null) return;
    final url = 'https://www.google.com/maps/dir/?api=1&destination=$lat,$lng';
    if (await canLaunchUrl(Uri.parse(url))) {
      await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
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

    return MovaScreen(
      title: 'Course en cours',
      actions: [
        IconButton(icon: const Icon(Icons.refresh), onPressed: _refreshRide),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          MovaCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _ride['pickupAddress']?.toString() ?? 'Départ',
                  style: const TextStyle(fontWeight: FontWeight.bold),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                Text(
                  '→ ${_ride['dropoffAddress']?.toString() ?? 'Arrivée'}',
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
          MovaButton(
            label: 'Navigation destination',
            isSecondary: true,
            icon: Icons.navigation_outlined,
            onPressed: _openDropoff,
          ),
          if (nextLabel != null && nextStatus != null) ...[
            const SizedBox(height: 12),
            MovaButton(
              label: nextLabel,
              icon: Icons.arrow_forward,
              isLoading: _loading,
              onPressed: _loading ? null : () => _advanceStatus(nextStatus),
            ),
          ],
        ],
      ),
    );
  }

  String _statusLabel(String status) => switch (status) {
        'DRIVER_ASSIGNED' => 'En route vers le passager',
        'ARRIVING' => 'Arrivé — en attente du passager',
        'IN_PROGRESS' => 'Course en cours',
        'COMPLETED' => 'Terminée',
        _ => status,
      };
}

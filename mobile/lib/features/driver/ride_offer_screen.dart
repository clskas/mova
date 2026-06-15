import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/api/api_client.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import 'active_ride_screen.dart';

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

  String get _rideId => widget.offer['id']?.toString() ?? '';

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      if (_countdown <= 0) {
        _timer?.cancel();
        Navigator.pop(context);
        return;
      }
      setState(() => _countdown--);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
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
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(builder: (_) => ActiveRideScreen(ride: data)),
        );
      case Failure(:final error):
        setState(() => _error = error.message);
    }
  }

  Future<void> _reject() async {
    final api = ref.read(apiClientProvider);
    await api.rejectRide(_rideId);
    if (mounted) Navigator.pop(context);
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
    final fare = widget.offer['estimatedFareCdf'] as int? ??
        widget.offer['priceCdf'] as int? ??
        0;
    final distance = widget.offer['distanceKm'] as num?;
    final pickup = widget.offer['pickupAddress']?.toString() ?? 'Point de départ';
    final dropoff = widget.offer['dropoffAddress']?.toString() ?? 'Destination';

    return MovaScreen(
      title: 'Nouvelle course',
      child: Column(
        children: [
          MovaCard(
            child: Column(
              children: [
                const Icon(Icons.local_taxi, size: 48, color: MovaColors.violet),
                const SizedBox(height: 12),
                Text(
                  pickup,
                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 4),
                Text(
                  '→ $dropoff',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 8),
                Text(
                  '${MarketConfig.formatCdf(fare)}${distance != null ? ' • ${distance.toStringAsFixed(1)} km' : ''}',
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 16),
                Text('$_countdown s', style: const TextStyle(fontSize: 32, color: MovaColors.orange)),
              ],
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            MovaErrorBanner(message: _error!),
          ],
          const SizedBox(height: 24),
          MovaButton(
            label: 'Accepter',
            icon: Icons.check,
            isLoading: _loading,
            onPressed: _loading ? null : _accept,
          ),
          const SizedBox(height: 8),
          MovaButton(
            label: 'Navigation',
            isSecondary: true,
            icon: Icons.navigation_outlined,
            onPressed: _openNavigation,
          ),
          const SizedBox(height: 8),
          MovaButton(
            label: 'Refuser',
            isSecondary: true,
            icon: Icons.close,
            onPressed: _loading ? null : _reject,
          ),
        ],
      ),
    );
  }
}

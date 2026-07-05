import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/api/api_client.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/geo/geo_utils.dart';
import '../../core/billing/driver_earnings_display.dart';
import '../../core/theme/mova_colors.dart';
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
  double? _pickupDistanceKm;
  int? _pickupEtaMin;

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
  }

  Future<void> _expireOffer() async {
    if (_rideId.isNotEmpty) {
      await ref.read(apiClientProvider).rejectRide(_rideId);
    }
    if (mounted) Navigator.pop(context);

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
        permission = await Geolocator.requestPermission();
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
        Navigator.pop(context);
      case Failure(:final error):
        setState(() => _error = error.message);
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
    final gross = DriverEarningsDisplay.grossFromMap(widget.offer) ?? 0;
    final driverNet = DriverEarningsDisplay.netFromMap(widget.offer);
    final distance = widget.offer['tripDistanceKm'] as num? ?? widget.offer['distanceKm'] as num?;
    final pickup = widget.offer['pickupAddress']?.toString() ?? 'Point de départ';
    final dropoff = widget.offer['dropoffAddress']?.toString() ?? 'Destination';
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
                  const Expanded(
                    child: Text(
                      'Nouvelle course',
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
                      DriverEarningsDisplay.netLabel(net: driverNet, gross: gross > 0 ? gross : null),
                      style: TextStyle(color: Colors.white.withValues(alpha: 0.55), fontSize: 13),
                    ),
                    if (distance != null) ...[
                      const SizedBox(height: 4),
                      Wrap(
                        alignment: WrapAlignment.center,
                        spacing: 4,
                        runSpacing: 4,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          Text(
                            'Trajet ${GeoUtils.formatDistanceKm(distance.toDouble())}',
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
                                'Client à ${GeoUtils.formatDistanceKm(_pickupDistanceKm!)}'
                                '${_pickupEtaMin != null ? ' · ~$_pickupEtaMin min' : ''}',
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
                  SizedBox(
                    width: double.infinity,
                    child: MovaButton(
                      label: 'Accepter la course',
                      icon: Icons.check_circle_outline,
                      isLoading: _loading,
                      onPressed: _loading ? null : _accept,
                    ),
                  ),
                  const SizedBox(height: 10),
                  SizedBox(
                    width: double.infinity,
                    child: MovaButton(
                      label: 'Refuser',
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
                      label: 'Navigation vers le passager',
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

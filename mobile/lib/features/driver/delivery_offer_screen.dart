import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';
import '../../core/api/api_client.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/geo/geo_utils.dart';
import '../../core/billing/driver_earnings_display.dart';
import '../../core/billing/service_price_display.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import '../booking/widgets/mova_ride_map.dart';

class DeliveryOfferScreen extends ConsumerStatefulWidget {
  const DeliveryOfferScreen({super.key, required this.offer});

  final Map<String, dynamic> offer;

  @override
  ConsumerState<DeliveryOfferScreen> createState() => _DeliveryOfferScreenState();
}

class _DeliveryOfferScreenState extends ConsumerState<DeliveryOfferScreen> {
  int _countdown = 30;
  bool _loading = false;
  String? _error;
  Timer? _timer;
  double? _pickupDistanceKm;
  int? _pickupEtaMin;
  LatLng? _driverPosition;

  String get _deliveryId => widget.offer['id']?.toString() ?? '';

  String get _typeLabel {
    return switch (widget.offer['type']?.toString()) {
      'FOOD' => 'Livraison repas',
      'PARCEL' => 'Colis',
      'EXPRESS' => 'Express',
      'ERRAND' => 'Courses & commissions',
      _ => 'Livraison',
    };
  }

  LatLng? get _pickupPoint {
    final lat = (widget.offer['pickupLat'] as num?)?.toDouble();
    final lng = (widget.offer['pickupLng'] as num?)?.toDouble();
    if (lat == null || lng == null) return null;
    return LatLng(lat, lng);
  }

  LatLng? get _dropoffPoint {
    final lat = (widget.offer['dropoffLat'] as num?)?.toDouble() ??
        (widget.offer['deliveryLat'] as num?)?.toDouble();
    final lng = (widget.offer['dropoffLng'] as num?)?.toDouble() ??
        (widget.offer['deliveryLng'] as num?)?.toDouble();
    if (lat == null || lng == null) return null;
    return LatLng(lat, lng);
  }

  @override
  void initState() {
    super.initState();
    _resolvePickupProximity();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      if (_countdown <= 0) {
        _timer?.cancel();
        _reject();
        return;
      }
      setState(() => _countdown--);
    });
  }

  Future<void> _resolvePickupProximity() async {
    final backendKm = (widget.offer['distanceToPickupKm'] as num?)?.toDouble();
    if (backendKm != null && backendKm >= 0) {
      setState(() {
        _pickupDistanceKm = backendKm;
        _pickupEtaMin = GeoUtils.etaMinutesFromDistanceKm(backendKm);
      });
    }

    final pickup = _pickupPoint;
    if (pickup == null) return;
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
      final km = GeoUtils.haversineKm(pos.latitude, pos.longitude, pickup.latitude, pickup.longitude);
      setState(() {
        _driverPosition = LatLng(pos.latitude, pos.longitude);
        if (_pickupDistanceKm == null) {
          _pickupDistanceKm = km;
          _pickupEtaMin = GeoUtils.etaMinutesFromDistanceKm(km);
        }
      });
    } catch (_) {
      /* GPS indisponible */
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _reject() async {
    _timer?.cancel();
    if (_deliveryId.isNotEmpty) {
      await ref.read(apiClientProvider).rejectDelivery(_deliveryId);
    }
    if (mounted) Navigator.pop(context);
  }

  Future<void> _accept() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final api = ref.read(apiClientProvider);
    final result = await api.acceptDelivery(_deliveryId);
    if (!mounted) return;
    setState(() => _loading = false);
    switch (result) {
      case Success():
        _timer?.cancel();
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Livraison acceptée')),
          );
          Navigator.pop(context, result.data);
        }
      case Failure(:final error):
        setState(() => _error = error.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final driverNet = DriverEarningsDisplay.netFromMap(widget.offer);
    final tripKm = (widget.offer['tripDistanceKm'] as num?)?.toDouble() ??
        (widget.offer['distanceKm'] as num?)?.toDouble();
    final pickup = _pickupPoint;
    final dropoff = _dropoffPoint;

    return MovaScreen(
      title: 'Nouvelle livraison',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (pickup != null && dropoff != null) ...[
            ClipRRect(
              borderRadius: BorderRadius.circular(16),
              child: MovaRideMap(
                height: 200,
                pickup: pickup,
                dropoff: dropoff,
                driver: _driverPosition,
                approachTarget: pickup,
                pickupLabel: MovaRideMap.mapLabel(
                  widget.offer['pickupAddress']?.toString(),
                  fallback: 'Prise en charge',
                ),
                dropoffLabel: MovaRideMap.mapLabel(
                  widget.offer['dropoffAddress']?.toString() ??
                      widget.offer['deliveryAddress']?.toString(),
                  fallback: 'Livraison',
                ),
              ),
            ),
            const SizedBox(height: 12),
          ],
          MovaCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _typeLabel,
                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                if (widget.offer['restaurantName'] != null && widget.offer['type']?.toString() != 'ERRAND')
                  Text(
                    widget.offer['restaurantName']?.toString() ?? '',
                    style: const TextStyle(color: MovaColors.textSecondary),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                if (widget.offer['description'] != null)
                  Text(
                    widget.offer['description']?.toString() ?? '',
                    style: const TextStyle(color: MovaColors.textSecondary),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                const SizedBox(height: 12),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(Icons.trip_origin, color: MovaColors.green, size: 18),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        widget.offer['pickupAddress']?.toString() ?? '—',
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(Icons.location_on, color: MovaColors.violet, size: 18),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        widget.offer['dropoffAddress']?.toString() ??
                            widget.offer['deliveryAddress']?.toString() ??
                            '—',
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Text(
                  driverNet != null ? MarketConfig.formatCdf(driverNet) : '—',
                  style: const TextStyle(
                    fontWeight: FontWeight.bold,
                    color: MovaColors.green,
                    fontSize: 22,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                Text(
                  driverNet != null
                      ? DriverEarningsDisplay.deliveryNetLabel(
                          data: widget.offer,
                          type: widget.offer['type']?.toString(),
                          passengerTotal: ServicePriceDisplay.totalForPassenger(widget.offer),
                        )
                      : 'Revenu net indisponible',
                  style: TextStyle(color: MovaColors.textSecondary.withValues(alpha: 0.9), fontSize: 12),
                ),
                const SizedBox(height: 10),
                if (_pickupDistanceKm != null)
                  _distanceRow(
                    Icons.near_me,
                    'Vous → prise en charge',
                    GeoUtils.formatDistanceKm(_pickupDistanceKm!),
                    _pickupEtaMin,
                  ),
                if (tripKm != null) ...[
                  const SizedBox(height: 6),
                  _distanceRow(
                    Icons.route,
                    'Trajet livraison',
                    GeoUtils.formatDistanceKm(tripKm),
                    GeoUtils.etaMinutesFromDistanceKm(tripKm),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 16),
          Text(
            'Expire dans $_countdown s',
            textAlign: TextAlign.center,
            style: const TextStyle(color: MovaColors.orange, fontWeight: FontWeight.w600),
          ),
          if (_error != null) ...[
            const SizedBox(height: 16),
            MovaErrorBanner(message: _error!),
          ],
          const SizedBox(height: 24),
          MovaButton(
            label: 'Accepter la livraison',
            isLoading: _loading,
            icon: Icons.delivery_dining,
            onPressed: _loading ? null : _accept,
          ),
          const SizedBox(height: 12),
          MovaButton(
            label: 'Refuser',
            isSecondary: true,
            onPressed: _loading ? null : _reject,
          ),
        ],
      ),
    );
  }

  Widget _distanceRow(IconData icon, String label, String distance, int? etaMin) {
    return Row(
      children: [
        Icon(icon, size: 18, color: MovaColors.orange),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            '$label : $distance${etaMin != null ? ' · ~$etaMin min' : ''}',
            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
          ),
        ),
      ],
    );
  }
}

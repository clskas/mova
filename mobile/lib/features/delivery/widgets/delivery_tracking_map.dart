import 'package:flutter/material.dart';
import 'package:latlong2/latlong.dart';
import '../../../core/geo/geo_utils.dart';
import '../../../core/theme/mova_colors.dart';
import '../../../core/widgets/mova_widgets.dart';
import '../../booking/widgets/mova_ride_map.dart';

/// Carte + ETA + PIN pour suivi livraison (Glovo-style).
class DeliveryTrackingMap extends StatelessWidget {
  const DeliveryTrackingMap({
    super.key,
    required this.pickup,
    this.dropoff,
    this.courier,
    this.etaMinutes,
    this.deliveryPin,
    this.courierName,
    this.courierRating,
  });

  final LatLng pickup;
  final LatLng? dropoff;
  final LatLng? courier;
  final int? etaMinutes;
  final String? deliveryPin;
  final String? courierName;
  final double? courierRating;

  static LatLng? parseLocation(Map<String, dynamic>? raw) {
    if (raw == null) return null;
    final lat = (raw['lat'] as num?)?.toDouble();
    final lng = (raw['lng'] as num?)?.toDouble();
    if (lat == null || lng == null) return null;
    return LatLng(lat, lng);
  }

  static int? etaFromDelivery(Map<String, dynamic>? delivery) {
    final apiEta = (delivery?['etaMinutes'] as num?)?.toInt();
    if (apiEta != null && apiEta > 0) return apiEta;
    final courier = parseLocation(delivery?['courierLocation'] as Map<String, dynamic>?);
    final dropLat = (delivery?['dropoffLat'] ?? delivery?['deliveryLat']) as num?;
    final dropLng = (delivery?['dropoffLng'] ?? delivery?['deliveryLng']) as num?;
    if (courier != null && dropLat != null && dropLng != null) {
      return GeoUtils.driverEtaMinutes(
        courier.latitude,
        courier.longitude,
        dropLat.toDouble(),
        dropLng.toDouble(),
      );
    }
    final duration = (delivery?['durationMin'] as num?)?.toDouble();
    if (duration != null) return (duration + 10).ceil();
    return null;
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        MovaRideMap(
          pickup: pickup,
          dropoff: dropoff,
          driver: courier,
          height: 180,
          driverIcon: Icons.delivery_dining,
        ),
        if (etaMinutes != null || deliveryPin != null || courierName != null) ...[
          const SizedBox(height: 12),
          Row(
            children: [
              if (etaMinutes != null)
                Expanded(
                  child: MovaCard(
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(Icons.schedule, color: MovaColors.violet, size: 20),
                        const SizedBox(width: 6),
                        Text(
                          'Livraison ~$etaMinutes min',
                          style: const TextStyle(fontWeight: FontWeight.w600),
                        ),
                      ],
                    ),
                  ),
                ),
              if (deliveryPin != null) ...[
                if (etaMinutes != null) const SizedBox(width: 8),
                Expanded(
                  child: MovaCard(
                    child: Column(
                      children: [
                        const Text(
                          'Code PIN',
                          style: TextStyle(fontSize: 11, color: MovaColors.textSecondary),
                        ),
                        Text(
                          deliveryPin!,
                          style: const TextStyle(
                            fontSize: 22,
                            fontWeight: FontWeight.bold,
                            letterSpacing: 4,
                            color: MovaColors.violet,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ],
          ),
        ],
        if (courierName != null) ...[
          const SizedBox(height: 8),
          MovaCard(
            child: Row(
              children: [
                CircleAvatar(
                  radius: 20,
                  backgroundColor: MovaColors.orange.withValues(alpha: 0.15),
                  child: Text(
                    courierName!.isNotEmpty ? courierName![0].toUpperCase() : 'L',
                    style: const TextStyle(fontWeight: FontWeight.bold, color: MovaColors.orange),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(courierName!, style: const TextStyle(fontWeight: FontWeight.w600)),
                      if (courierRating != null)
                        Row(
                          children: [
                            const Icon(Icons.star, color: Colors.amber, size: 14),
                            const SizedBox(width: 4),
                            Text(courierRating!.toStringAsFixed(1)),
                          ],
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}

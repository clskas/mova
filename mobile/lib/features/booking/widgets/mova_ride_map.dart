import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import '../../../core/config/market_config.dart';
import '../../../core/theme/mova_colors.dart';

class MovaRideMap extends StatelessWidget {
  const MovaRideMap({
    super.key,
    required this.pickup,
    this.dropoff,
    this.driver,
    this.height = 220,
  });

  final LatLng pickup;
  final LatLng? dropoff;
  final LatLng? driver;
  final double height;

  @override
  Widget build(BuildContext context) {
    final points = [pickup, if (dropoff != null) dropoff!, if (driver != null) driver!];
    final bounds = LatLngBounds.fromPoints(points);

    return SizedBox(
      height: height,
      width: double.infinity,
      child: ClipRRect(
        borderRadius: const BorderRadius.vertical(bottom: Radius.circular(16)),
        child: FlutterMap(
          options: MapOptions(
            initialCenter: pickup,
            initialZoom: 13,
            initialCameraFit: points.length > 1
                ? CameraFit.bounds(bounds: bounds, padding: const EdgeInsets.all(48))
                : null,
            interactionOptions: const InteractionOptions(
              flags: InteractiveFlag.pinchZoom | InteractiveFlag.drag,
            ),
          ),
          children: [
            TileLayer(
              urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
              userAgentPackageName: 'com.mova.passenger',
            ),
            MarkerLayer(
              markers: [
                Marker(
                  point: pickup,
                  width: 36,
                  height: 36,
                  child: const _PinIcon(color: MovaColors.green, icon: Icons.trip_origin),
                ),
                if (dropoff != null)
                  Marker(
                    point: dropoff!,
                    width: 36,
                    height: 36,
                    child: const _PinIcon(color: MovaColors.violet, icon: Icons.place),
                  ),
                if (driver != null)
                  Marker(
                    point: driver!,
                    width: 40,
                    height: 40,
                    child: Container(
                      decoration: BoxDecoration(
                        color: MovaColors.midnight,
                        shape: BoxShape.circle,
                        border: Border.all(color: MovaColors.white, width: 2),
                      ),
                      child: const Icon(Icons.two_wheeler, color: MovaColors.white, size: 20),
                    ),
                  ),
              ],
            ),
            if (dropoff != null)
              PolylineLayer(
                polylines: [
                  Polyline(
                    points: [pickup, dropoff!],
                    color: MovaColors.violet.withValues(alpha: 0.6),
                    strokeWidth: 3,
                  ),
                ],
              ),
          ],
        ),
      ),
    );
  }

  static LatLng mapDefaultCenter() =>
      LatLng(MarketConfig.mapCenterLat, MarketConfig.mapCenterLng);

  /// @deprecated Utiliser [mapDefaultCenter]
  static LatLng kinshasaDefault() => mapDefaultCenter();
}

class _PinIcon extends StatelessWidget {
  const _PinIcon({required this.color, required this.icon});

  final Color color;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(
          padding: const EdgeInsets.all(6),
          decoration: BoxDecoration(
            color: color,
            shape: BoxShape.circle,
            boxShadow: [
              BoxShadow(
                color: color.withValues(alpha: 0.4),
                blurRadius: 6,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: Icon(icon, color: MovaColors.white, size: 16),
        ),
        Container(width: 2, height: 6, color: color),
      ],
    );
  }
}

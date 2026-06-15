import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import '../../../core/config/market_config.dart';
import '../../../core/theme/mova_colors.dart';

class MovaRideMap extends StatefulWidget {
  const MovaRideMap({
    super.key,
    required this.pickup,
    this.dropoff,
    this.driver,
    this.height = 220,
    this.driverIcon = Icons.two_wheeler,
  });

  final LatLng pickup;
  final LatLng? dropoff;
  final LatLng? driver;
  final double height;
  final IconData driverIcon;

  @override
  State<MovaRideMap> createState() => _MovaRideMapState();
}

class _MovaRideMapState extends State<MovaRideMap> {
  LatLng? _prevDriver;
  double _driverBearing = 0;

  @override
  void didUpdateWidget(covariant MovaRideMap oldWidget) {
    super.didUpdateWidget(oldWidget);
    final driver = widget.driver;
    if (driver != null && _prevDriver != null) {
      final moved = (driver.latitude - _prevDriver!.latitude).abs() > 0.00001 ||
          (driver.longitude - _prevDriver!.longitude).abs() > 0.00001;
      if (moved) {
        _driverBearing = _bearing(_prevDriver!, driver);
      }
    }
    if (driver != null) _prevDriver = driver;
  }

  static double _bearing(LatLng from, LatLng to) {
    final lat1 = from.latitude * math.pi / 180;
    final lat2 = to.latitude * math.pi / 180;
    final dLng = (to.longitude - from.longitude) * math.pi / 180;
    final y = math.sin(dLng) * math.cos(lat2);
    final x = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dLng);
    return (math.atan2(y, x) * 180 / math.pi + 360) % 360;
  }

  @override
  Widget build(BuildContext context) {
    final pickup = widget.pickup;
    final dropoff = widget.dropoff;
    final driver = widget.driver;
    final points = [pickup, if (dropoff != null) dropoff, if (driver != null) driver];
    final bounds = LatLngBounds.fromPoints(points);

    return SizedBox(
      height: widget.height,
      width: double.infinity,
      child: ClipRRect(
        borderRadius: const BorderRadius.vertical(bottom: Radius.circular(16)),
        child: FlutterMap(
          options: MapOptions(
            initialCenter: driver ?? pickup,
            initialZoom: 14,
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
            if (dropoff != null)
              PolylineLayer(
                polylines: [
                  Polyline(
                    points: [pickup, dropoff],
                    color: MovaColors.violet.withValues(alpha: 0.6),
                    strokeWidth: 3,
                  ),
                ],
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
                    point: dropoff,
                    width: 36,
                    height: 36,
                    child: const _PinIcon(color: MovaColors.violet, icon: Icons.place),
                  ),
                if (driver != null)
                  Marker(
                    point: driver,
                    width: 44,
                    height: 44,
                    child: Transform.rotate(
                      angle: _driverBearing * math.pi / 180,
                      child: Container(
                        decoration: BoxDecoration(
                          color: MovaColors.midnight,
                          shape: BoxShape.circle,
                          border: Border.all(color: MovaColors.white, width: 2),
                          boxShadow: [
                            BoxShadow(
                              color: MovaColors.midnight.withValues(alpha: 0.35),
                              blurRadius: 6,
                              offset: const Offset(0, 2),
                            ),
                          ],
                        ),
                        child: Icon(widget.driverIcon, color: MovaColors.white, size: 22),
                      ),
                    ),
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

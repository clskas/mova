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
    this.onDropoffTap,
    this.dropoffEditable = false,
  });

  final LatLng pickup;
  final LatLng? dropoff;
  final LatLng? driver;
  final double height;
  final IconData driverIcon;
  /// Tap sur la carte pour placer la destination (pin violet).
  final ValueChanged<LatLng>? onDropoffTap;
  final bool dropoffEditable;

  static LatLng mapDefaultCenter() =>
      LatLng(MarketConfig.mapCenterLat, MarketConfig.mapCenterLng);

  /// @deprecated Utiliser [mapDefaultCenter]
  static LatLng kinshasaDefault() => mapDefaultCenter();

  @override
  State<MovaRideMap> createState() => _MovaRideMapState();
}

class _MovaRideMapState extends State<MovaRideMap> {
  final MapController _mapController = MapController();
  LatLng? _prevDriver;
  double _driverBearing = 0;

  @override
  void dispose() {
    _mapController.dispose();
    super.dispose();
  }

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

    final pickupMoved = oldWidget.pickup.latitude != widget.pickup.latitude ||
        oldWidget.pickup.longitude != widget.pickup.longitude;
    final dropoffMoved = oldWidget.dropoff?.latitude != widget.dropoff?.latitude ||
        oldWidget.dropoff?.longitude != widget.dropoff?.longitude;
    if (pickupMoved || dropoffMoved) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _recenterCamera();
      });
    }
  }

  void _recenterCamera() {
    final pickup = widget.pickup;
    final dropoff = widget.dropoff;
    final driver = widget.driver;
    if (dropoff != null) {
      final points = [pickup, dropoff, if (driver != null) driver];
      _mapController.fitCamera(
        CameraFit.bounds(bounds: LatLngBounds.fromPoints(points), padding: const EdgeInsets.all(48)),
      );
    } else {
      _mapController.move(pickup, 15);
    }
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
      child: Stack(
        children: [
          ClipRRect(
            borderRadius: const BorderRadius.vertical(bottom: Radius.circular(16)),
            child: FlutterMap(
              mapController: _mapController,
              options: MapOptions(
                initialCenter: driver ?? pickup,
                initialZoom: 14,
                initialCameraFit: points.length > 1
                    ? CameraFit.bounds(bounds: bounds, padding: const EdgeInsets.all(48))
                    : null,
                onMapReady: _recenterCamera,
                onTap: widget.onDropoffTap != null
                    ? (_, point) => widget.onDropoffTap!(point)
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
          if (widget.dropoffEditable)
            Positioned(
              left: 8,
              bottom: 8,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: MovaColors.midnight.withValues(alpha: 0.75),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  child: Text(
                    'Appuyez sur la carte pour la destination',
                    style: TextStyle(color: MovaColors.white, fontSize: 11),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
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

import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import '../../../core/config/test_runtime_config.dart';
import '../../../core/config/market_config.dart';
import '../../../core/theme/mova_colors.dart';
import '../../../core/widgets/map_pin_confirm_bar.dart';

class MovaRideMap extends StatefulWidget {
  const MovaRideMap({
    super.key,
    required this.pickup,
    this.dropoff,
    this.driver,
    this.routeTrace,
    this.approachTarget,
    this.followDriver = false,
    this.height = 220,
    this.driverIcon = Icons.two_wheeler,
    this.onDropoffTap,
    this.onNamePlace,
    this.dropoffEditable = false,
    this.pickupLabel,
    this.dropoffLabel,
    this.places,
    this.placesCategoryFilter,
    this.nearbyVehicles,
  });

  final LatLng pickup;
  final LatLng? dropoff;
  final LatLng? driver;
  final List<LatLng>? routeTrace;
  /// POI affichés sur la carte (marchés, hôpitaux, etc.).
  final List<Map<String, dynamic>>? places;
  /// Filtre catégorie POI (`MARKET`, `HOSPITAL`, …) — null = toutes.
  final String? placesCategoryFilter;
  /// Chauffeurs à proximité filtrés par type (Taxi / Moto) — pins carte.
  final List<Map<String, dynamic>>? nearbyVehicles;
  /// Cible d'approche (pickup puis dropoff) — ligne pointillée chauffeur → cible.
  final LatLng? approachTarget;
  /// Recentre la caméra quand le chauffeur se déplace (suivi temps réel).
  final bool followDriver;
  final double height;
  final IconData driverIcon;
  /// Libellé affiché près du marqueur départ (ex. Gombe, Avenue …).
  final String? pickupLabel;
  /// Libellé affiché près du marqueur arrivée.
  final String? dropoffLabel;
  /// Confirmation « Utiliser cet emplacement » après tap / appui long.
  final ValueChanged<LatLng>? onDropoffTap;
  /// « Nommer ce lieu » depuis le pin (catalogue SENGA).
  final ValueChanged<LatLng>? onNamePlace;
  final bool dropoffEditable;

  static LatLng mapDefaultCenter() =>
      LatLng(MarketConfig.mapCenterLat, MarketConfig.mapCenterLng);

  /// @deprecated Utiliser [mapDefaultCenter]
  static LatLng kinshasaDefault() => mapDefaultCenter();

  /// Raccourcit une adresse pour l'affichage sur la carte.
  static String mapLabel(String? address, {required String fallback, int maxLen = 32}) {
    final t = address?.trim() ?? '';
    if (t.isEmpty) return fallback;
    if (t.length <= maxLen) return t;
    return '${t.substring(0, maxLen - 1)}…';
  }

  static List<LatLng> parseGpsTrace(dynamic raw) {
    if (raw is! List) return const [];
    final out = <LatLng>[];
    for (final item in raw) {
      if (item is! Map) continue;
      final lat = (item['lat'] as num?)?.toDouble();
      final lng = (item['lng'] as num?)?.toDouble();
      if (lat == null || lng == null) continue;
      if (!_isFiniteCoord(lat, lng)) continue;
      out.add(LatLng(lat, lng));
    }
    return out;
  }

  static bool isFiniteCoord(double lat, double lng) => _isFiniteCoord(lat, lng);

  static bool _isFiniteCoord(double lat, double lng) =>
      lat.isFinite && lng.isFinite && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

  static LatLngBounds safeBounds(List<LatLng> points) {
    final valid = points.where((p) => _isFiniteCoord(p.latitude, p.longitude)).toList();
    if (valid.isEmpty) {
      final c = mapDefaultCenter();
      return LatLngBounds(LatLng(c.latitude - 0.01, c.longitude - 0.01), LatLng(c.latitude + 0.01, c.longitude + 0.01));
    }
    if (valid.length == 1) {
      final p = valid.first;
      const pad = 0.012;
      return LatLngBounds(
        LatLng(p.latitude - pad, p.longitude - pad),
        LatLng(p.latitude + pad, p.longitude + pad),
      );
    }
    var bounds = LatLngBounds.fromPoints(valid);
    final spanLat = (bounds.north - bounds.south).abs();
    final spanLng = (bounds.east - bounds.west).abs();
    if (spanLat < 0.0005 || spanLng < 0.0005) {
      final mid = valid.first;
      const pad = 0.012;
      bounds = LatLngBounds(
        LatLng(mid.latitude - pad, mid.longitude - pad),
        LatLng(mid.latitude + pad, mid.longitude + pad),
      );
    }
    return bounds;
  }

  @override
  State<MovaRideMap> createState() => _MovaRideMapState();
}

class _MovaRideMapState extends State<MovaRideMap> {
  final MapController _mapController = MapController();
  LatLng? _prevDriver;
  LatLng? _pendingPin;
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
    var driverMoved = false;
    if (driver != null && _prevDriver != null) {
      driverMoved = (driver.latitude - _prevDriver!.latitude).abs() > 0.00001 ||
          (driver.longitude - _prevDriver!.longitude).abs() > 0.00001;
      if (driverMoved) {
        _driverBearing = _bearing(_prevDriver!, driver);
      }
    }
    if (driver != null) _prevDriver = driver;

    if (widget.followDriver && driver != null && (driverMoved || oldWidget.driver == null)) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _followDriverCamera(driver);
      });
    }

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

  void _dropPendingPin(LatLng point) {
    if (!MovaRideMap.isFiniteCoord(point.latitude, point.longitude)) return;
    setState(() => _pendingPin = point);
  }

  void _recenterCamera() {
    final pickup = widget.pickup;
    final dropoff = widget.dropoff;
    final driver = widget.driver;
    if (!MovaRideMap.isFiniteCoord(pickup.latitude, pickup.longitude)) return;
    if (driver != null && widget.followDriver) {
      _followDriverCamera(driver);
      return;
    }
    if (dropoff != null && MovaRideMap.isFiniteCoord(dropoff.latitude, dropoff.longitude)) {
      final points = [pickup, dropoff, if (driver != null) driver];
      _mapController.fitCamera(
        CameraFit.bounds(bounds: MovaRideMap.safeBounds(points), padding: const EdgeInsets.all(48)),
      );
    } else {
      _mapController.move(pickup, 15);
    }
  }

  void _followDriverCamera(LatLng driver) {
    if (!MovaRideMap.isFiniteCoord(driver.latitude, driver.longitude)) return;
    final points = <LatLng>[
      driver,
      widget.approachTarget ?? widget.pickup,
      if (widget.dropoff != null) widget.dropoff!,
      widget.pickup,
    ];
    _mapController.fitCamera(
      CameraFit.bounds(
        bounds: MovaRideMap.safeBounds(points),
        padding: const EdgeInsets.all(52),
      ),
    );
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
    final points = [
      pickup,
      if (dropoff != null) dropoff,
      if (driver != null) driver,
    ].where((p) => MovaRideMap.isFiniteCoord(p.latitude, p.longitude)).toList();
    final bounds = MovaRideMap.safeBounds(points.isEmpty ? [MovaRideMap.mapDefaultCenter()] : points);
    final initialCenter = points.isNotEmpty ? points.first : MovaRideMap.mapDefaultCenter();

    return SizedBox(
      height: widget.height,
      width: double.infinity,
      child: Stack(
        children: [
          if (!movaMapTilesEnabled)
            const ColoredBox(color: Color(0xFFE8EEF2)),
          ClipRRect(
            borderRadius: const BorderRadius.vertical(bottom: Radius.circular(16)),
            child: FlutterMap(
              mapController: _mapController,
              options: MapOptions(
                initialCenter: driver ?? initialCenter,
                initialZoom: 14,
                initialCameraFit: points.length > 1
                    ? CameraFit.bounds(bounds: bounds, padding: const EdgeInsets.all(48))
                    : null,
                onMapReady: _recenterCamera,
                onTap: widget.dropoffEditable ? (_, point) => _dropPendingPin(point) : null,
                onLongPress: widget.dropoffEditable ? (_, point) => _dropPendingPin(point) : null,
                interactionOptions: const InteractionOptions(
                  flags: InteractiveFlag.pinchZoom | InteractiveFlag.drag,
                ),
              ),
              children: [
            if (movaMapTilesEnabled)
              TileLayer(
                urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                userAgentPackageName: 'com.mova.passenger',
              ),
            PolylineLayer(
              polylines: [
                if (widget.routeTrace != null && widget.routeTrace!.length >= 2)
                  Polyline(
                    points: widget.routeTrace!,
                    color: MovaColors.violet,
                    strokeWidth: 4,
                  ),
                if (driver != null && widget.approachTarget != null)
                  Polyline(
                    points: [driver, widget.approachTarget!],
                    color: MovaColors.green.withValues(alpha: 0.75),
                    strokeWidth: 3,
                  ),
                if (dropoff != null &&
                    (widget.routeTrace == null || widget.routeTrace!.length < 2))
                  Polyline(
                    points: [pickup, dropoff],
                    color: MovaColors.violet.withValues(alpha: 0.45),
                    strokeWidth: 2.5,
                  ),
              ],
            ),
            MarkerLayer(
              markers: [
                Marker(
                  point: pickup,
                  width: 140,
                  height: 72,
                  alignment: Alignment.topCenter,
                  child: _LabeledPin(
                    color: MovaColors.green,
                    icon: Icons.trip_origin,
                    label: MovaRideMap.mapLabel(widget.pickupLabel, fallback: 'Départ'),
                  ),
                ),
                if (dropoff != null)
                  Marker(
                    point: dropoff,
                    width: 140,
                    height: 72,
                    alignment: Alignment.topCenter,
                    child: _LabeledPin(
                      color: MovaColors.violet,
                      icon: Icons.place,
                      label: MovaRideMap.mapLabel(widget.dropoffLabel, fallback: 'Arrivée'),
                    ),
                  ),
                if (_pendingPin != null)
                  Marker(
                    point: _pendingPin!,
                    width: 140,
                    height: 72,
                    alignment: Alignment.topCenter,
                    child: const _LabeledPin(
                      color: Color(0xFFE67E22),
                      icon: Icons.push_pin,
                      label: 'Pin',
                    ),
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
                ..._poiMarkers(),
                ..._nearbyVehicleMarkers(),
              ],
            ),
          ],
            ),
          ),
          if (widget.dropoffEditable && _pendingPin != null)
            Positioned(
              left: 8,
              right: 8,
              bottom: 8,
              child: MapPinConfirmBar(
                coords: _pendingPin!,
                onUseLocation: () {
                  final pin = _pendingPin!;
                  setState(() => _pendingPin = null);
                  widget.onDropoffTap?.call(pin);
                },
                onNamePlace: widget.onNamePlace == null
                    ? null
                    : () {
                        final pin = _pendingPin!;
                        setState(() => _pendingPin = null);
                        widget.onNamePlace!(pin);
                      },
                onCancel: () => setState(() => _pendingPin = null),
              ),
            )
          else if (widget.dropoffEditable)
            Positioned(
              left: 8,
              right: 8,
              bottom: 8,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: MovaColors.midnight.withValues(alpha: 0.75),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  child: Text(
                    'Appui long ou tap : pin, puis « Utiliser cet emplacement »',
                    style: TextStyle(color: MovaColors.white, fontSize: 11),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    textAlign: TextAlign.center,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  List<Marker> _nearbyVehicleMarkers() {
    final vehicles = widget.nearbyVehicles;
    if (vehicles == null || vehicles.isEmpty) return const [];
    final out = <Marker>[];
    for (final v in vehicles) {
      final lat = (v['lat'] as num?)?.toDouble();
      final lng = (v['lng'] as num?)?.toDouble();
      if (lat == null || lng == null) continue;
      if (!MovaRideMap.isFiniteCoord(lat, lng)) continue;
      final moto = MarketConfig.isMotoType(v['vehicleType']?.toString() ?? '');
      out.add(
        Marker(
          point: LatLng(lat, lng),
          width: 28,
          height: 28,
          child: Container(
            decoration: BoxDecoration(
              color: moto ? MovaColors.green : MovaColors.violet,
              shape: BoxShape.circle,
              border: Border.all(color: MovaColors.white, width: 1.5),
              boxShadow: [
                BoxShadow(
                  color: MovaColors.midnight.withValues(alpha: 0.2),
                  blurRadius: 3,
                  offset: const Offset(0, 1),
                ),
              ],
            ),
            child: Icon(
              moto ? Icons.two_wheeler : Icons.local_taxi,
              color: MovaColors.white,
              size: 14,
            ),
          ),
        ),
      );
    }
    return out;
  }

  List<Marker> _poiMarkers() {
    final places = widget.places;
    if (places == null || places.isEmpty) return const [];
    final filter = widget.placesCategoryFilter;
    final out = <Marker>[];
    for (final p in places) {
      if (filter != null && p['category']?.toString() != filter) continue;
      final lat = (p['lat'] as num?)?.toDouble();
      final lng = (p['lng'] as num?)?.toDouble();
      if (lat == null || lng == null) continue;
      out.add(
        Marker(
          point: LatLng(lat, lng),
          width: 30,
          height: 30,
          child: Icon(_poiIcon(p['category']?.toString()), color: const Color(0xFFE67E22), size: 22),
        ),
      );
    }
    return out;
  }

  static IconData _poiIcon(String? category) {
    return switch (category) {
      'MARKET' => Icons.store_mall_directory_outlined,
      'HOSPITAL' => Icons.local_hospital_outlined,
      'UNIVERSITY' => Icons.school_outlined,
      'PHARMACY' => Icons.local_pharmacy_outlined,
      'SCHOOL' => Icons.menu_book_outlined,
      'GOVERNMENT' => Icons.account_balance_outlined,
      'TRANSPORT' => Icons.directions_bus_outlined,
      _ => Icons.place_outlined,
    };
  }
}

class _LabeledPin extends StatelessWidget {
  const _LabeledPin({
    required this.color,
    required this.icon,
    required this.label,
  });

  final Color color;
  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          constraints: const BoxConstraints(maxWidth: 132),
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
          decoration: BoxDecoration(
            color: MovaColors.white,
            borderRadius: BorderRadius.circular(6),
            border: Border.all(color: color.withValues(alpha: 0.5)),
            boxShadow: [
              BoxShadow(
                color: MovaColors.midnight.withValues(alpha: 0.12),
                blurRadius: 4,
                offset: const Offset(0, 1),
              ),
            ],
          ),
          child: Text(
            label,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w600,
              color: MovaColors.midnight,
              height: 1.15,
            ),
          ),
        ),
        const SizedBox(height: 2),
        _PinIcon(color: color, icon: icon),
      ],
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

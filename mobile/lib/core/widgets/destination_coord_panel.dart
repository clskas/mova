import 'package:flutter/material.dart';
import 'package:latlong2/latlong.dart';
import '../location/destination_coords.dart';
import '../location/location_service.dart';
import '../location/service_area_location.dart';
import '../theme/mova_colors.dart';

typedef DropoffCoordsCallback = void Function(LatLng coords, String label);

/// Panneau repliable : saisie manuelle lat/lng + bouton appliquer.
class DestinationCoordPanel extends StatefulWidget {
  const DestinationCoordPanel({
    super.key,
    required this.onApply,
    this.initialLat,
    this.initialLng,
  });

  final DropoffCoordsCallback onApply;
  final double? initialLat;
  final double? initialLng;

  @override
  State<DestinationCoordPanel> createState() => _DestinationCoordPanelState();
}

class _DestinationCoordPanelState extends State<DestinationCoordPanel> {
  late final TextEditingController _latController;
  late final TextEditingController _lngController;
  String? _error;

  @override
  void initState() {
    super.initState();
    _latController = TextEditingController(
      text: widget.initialLat?.toStringAsFixed(5) ?? '',
    );
    _lngController = TextEditingController(
      text: widget.initialLng?.toStringAsFixed(5) ?? '',
    );
  }

  @override
  void dispose() {
    _latController.dispose();
    _lngController.dispose();
    super.dispose();
  }

  void _apply() {
    final coords = DestinationCoords.fromFields(_latController.text, _lngController.text);
    if (coords == null) {
      setState(() => _error = 'Coordonnées invalides.');
      return;
    }
    if (!ServiceAreaLocation.isInBounds(coords)) {
      setState(() => _error = ServiceAreaLocation.outOfAreaMessage());
      return;
    }
    setState(() => _error = null);
    widget.onApply(coords, LocationService.coordsLabel(coords));
  }

  @override
  Widget build(BuildContext context) {
    return ExpansionTile(
      tilePadding: EdgeInsets.zero,
      title: const Text(
        'Coordonnées GPS (avancé)',
        style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
      ),
      subtitle: const Text(
        'Ex. -4.32170, 15.31250',
        style: TextStyle(fontSize: 12, color: MovaColors.textSecondary),
      ),
      children: [
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _latController,
                keyboardType: const TextInputType.numberWithOptions(decimal: true, signed: true),
                decoration: const InputDecoration(
                  labelText: 'Latitude',
                  isDense: true,
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: TextField(
                controller: _lngController,
                keyboardType: const TextInputType.numberWithOptions(decimal: true, signed: true),
                decoration: const InputDecoration(
                  labelText: 'Longitude',
                  isDense: true,
                ),
              ),
            ),
          ],
        ),
        if (_error != null) ...[
          const SizedBox(height: 8),
          Text(_error!, style: const TextStyle(color: MovaColors.error, fontSize: 12)),
        ],
        const SizedBox(height: 8),
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: _apply,
            icon: const Icon(Icons.check, size: 18),
            label: const Text('Appliquer les coordonnées'),
          ),
        ),
      ],
    );
  }
}

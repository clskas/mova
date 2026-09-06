import 'package:flutter/material.dart';
import 'package:latlong2/latlong.dart';

import '../location/location_service.dart';
import '../theme/mova_colors.dart';

/// Confirmation après pin carte : destination acceptée sans nom de POI.
class MapPinConfirmBar extends StatelessWidget {
  const MapPinConfirmBar({
    super.key,
    required this.coords,
    this.onUseLocation,
    this.onNamePlace,
    this.onCancel,
  });

  final LatLng coords;
  final VoidCallback? onUseLocation;
  final VoidCallback? onNamePlace;
  final VoidCallback? onCancel;

  static String coordsLabel(LatLng coords) => LocationService.coordsLabel(coords);

  /// Un pin GPS est une destination valide même sans nom de lieu.
  static bool isPinDestinationAccepted({
    required double lat,
    required double lng,
    String? name,
  }) {
    if (!lat.isFinite || !lng.isFinite) return false;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
    return true;
  }

  @override
  Widget build(BuildContext context) {
    return Material(
      color: MovaColors.white,
      elevation: 4,
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 10, 8, 10),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                const Icon(Icons.push_pin, color: MovaColors.violet, size: 18),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    coordsLabel(coords),
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: MovaColors.midnight,
                    ),
                  ),
                ),
                if (onCancel != null)
                  IconButton(
                    visualDensity: VisualDensity.compact,
                    tooltip: 'Annuler',
                    onPressed: onCancel,
                    icon: const Icon(Icons.close, size: 18),
                  ),
              ],
            ),
            const SizedBox(height: 4),
            Wrap(
              spacing: 8,
              runSpacing: 4,
              children: [
                FilledButton.icon(
                  onPressed: onUseLocation,
                  icon: const Icon(Icons.check, size: 16),
                  label: const Text('Utiliser cet emplacement'),
                ),
                if (onNamePlace != null)
                  OutlinedButton.icon(
                    onPressed: onNamePlace,
                    icon: const Icon(Icons.edit_location_alt_outlined, size: 16),
                    label: const Text('Nommer ce lieu'),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

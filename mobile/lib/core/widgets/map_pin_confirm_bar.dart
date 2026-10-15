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
      color: MovaColors.white.withValues(alpha: 0.82),
      elevation: 0,
      shadowColor: Colors.transparent,
      borderRadius: BorderRadius.circular(10),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(8, 6, 4, 6),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Icon(Icons.push_pin, color: MovaColors.violet.withValues(alpha: 0.9), size: 14),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    coordsLabel(coords),
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: MovaColors.midnight.withValues(alpha: 0.85),
                    ),
                  ),
                ),
                if (onCancel != null)
                  IconButton(
                    visualDensity: VisualDensity.compact,
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(minWidth: 28, minHeight: 28),
                    tooltip: 'Annuler',
                    onPressed: onCancel,
                    icon: Icon(Icons.close, size: 16, color: MovaColors.midnight.withValues(alpha: 0.7)),
                  ),
              ],
            ),
            const SizedBox(height: 2),
            Wrap(
              spacing: 6,
              runSpacing: 2,
              children: [
                FilledButton.icon(
                  style: FilledButton.styleFrom(
                    visualDensity: VisualDensity.compact,
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    minimumSize: const Size(0, 32),
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    textStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                  ),
                  onPressed: onUseLocation,
                  icon: const Icon(Icons.check, size: 14),
                  label: const Text('Utiliser cet emplacement'),
                ),
                if (onNamePlace != null)
                  OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(
                      visualDensity: VisualDensity.compact,
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                      minimumSize: const Size(0, 32),
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      backgroundColor: MovaColors.white.withValues(alpha: 0.55),
                      textStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                    ),
                    onPressed: onNamePlace,
                    icon: const Icon(Icons.edit_location_alt_outlined, size: 14),
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

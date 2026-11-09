import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../../../core/config/market_config.dart';
import '../../../core/i18n/i18n.dart';
import '../../../core/theme/mova_colors.dart';

/// What the passenger needs to recognise the driver and the vehicle once a ride is accepted:
/// driver photo, name, rating, the plate in large type, model and colour, and the real photo
/// of the vehicle validated by SENGA (tap to enlarge).
class DriverIdentityCard extends ConsumerStatefulWidget {
  const DriverIdentityCard({super.key, required this.driver, this.fallbackVehicleType});

  /// Normalised driver map (name, rating, totalRides, photoUrl, plateNumber, vehicleModel,
  /// vehicleColor, vehicleType, vehiclePhotoUrl).
  final Map<String, dynamic>? driver;
  final String? fallbackVehicleType;

  @override
  ConsumerState<DriverIdentityCard> createState() => _DriverIdentityCardState();
}

class _DriverIdentityCardState extends ConsumerState<DriverIdentityCard> {
  String? _token;

  @override
  void initState() {
    super.initState();
    // The driver photo is served only to the people on the ride: it needs the session.
    ref.read(apiClientProvider).authToken().then((t) {
      if (mounted) setState(() => _token = t);
    });
  }

  Map<String, String>? get _authHeaders =>
      _token == null || _token!.isEmpty ? null : {'Authorization': 'Bearer $_token'};

  static String vehicleTypeLabel(String? raw) {
    if (raw == null || raw.trim().isEmpty) return '';
    final normalized = MarketConfig.normalizeVehicleType(raw);
    for (final v in MarketConfig.vehicleTypes) {
      if (v.id == normalized) return v.label;
    }
    return raw;
  }

  String _text(String key) {
    final v = widget.driver?[key]?.toString().trim() ?? '';
    return v == 'null' ? '' : v;
  }

  void _openVehiclePhoto(String url) {
    showDialog<void>(
      context: context,
      builder: (ctx) => Dialog(
        insetPadding: const EdgeInsets.all(16),
        clipBehavior: Clip.antiAlias,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            InteractiveViewer(
              child: Image.network(
                url,
                fit: BoxFit.contain,
                errorBuilder: (_, __, ___) => Padding(
                  padding: const EdgeInsets.all(24),
                  child: Text(tr('Photo indisponible')),
                ),
              ),
            ),
            TextButton(onPressed: () => Navigator.pop(ctx), child: Text(tr('Fermer'))),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final name = _text('name').isEmpty ? tr('Chauffeur') : _text('name');
    final rating = (widget.driver?['rating'] as num?)?.toDouble();
    final totalRides = (widget.driver?['totalRides'] as num?)?.toInt();
    final plate = _text('plateNumber');
    final model = _text('vehicleModel');
    final color = _text('vehicleColor');
    final typeLabel = vehicleTypeLabel(
      _text('vehicleType').isNotEmpty ? _text('vehicleType') : widget.fallbackVehicleType,
    );
    final photo = _text('photoUrl');
    final vehiclePhoto = _text('vehiclePhotoUrl');
    final photoUrl = photo.isEmpty ? '' : MarketConfig.resolveMediaUrl(photo);
    final vehiclePhotoUrl = vehiclePhoto.isEmpty ? '' : MarketConfig.resolveMediaUrl(vehiclePhoto);
    final vehicleLine = [
      if (model.isNotEmpty) model else if (typeLabel.isNotEmpty) typeLabel,
      if (color.isNotEmpty) color,
    ].join(' · ');
    final initial = name.isNotEmpty ? name[0].toUpperCase() : '?';

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        CircleAvatar(
          key: const Key('driverPhoto'),
          radius: 30,
          backgroundColor: MovaColors.violet.withValues(alpha: 0.15),
          child: ClipOval(
            child: photoUrl.isEmpty || (photo.contains('/driver-photo') && _authHeaders == null)
                ? _initial(initial)
                : Image.network(
                    photoUrl,
                    headers: photo.contains('/driver-photo') ? _authHeaders : null,
                    width: 60,
                    height: 60,
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => _initial(initial),
                  ),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
              ),
              if (rating != null || (totalRides != null && totalRides > 0))
                Row(
                  children: [
                    if (rating != null) ...[
                      const Icon(Icons.star, color: Colors.amber, size: 16),
                      const SizedBox(width: 4),
                      Text(rating.toStringAsFixed(1)),
                    ],
                    if (totalRides != null && totalRides > 0) ...[
                      const SizedBox(width: 8),
                      Flexible(
                        child: Text(
                          trf('{count} courses', {'count': totalRides}),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(color: MovaColors.textSecondary, fontSize: 13),
                        ),
                      ),
                    ],
                  ],
                ),
              const SizedBox(height: 6),
              if (plate.isNotEmpty)
                Container(
                  key: const Key('driverPlate'),
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: MovaColors.cloud,
                    borderRadius: BorderRadius.circular(6),
                    border: Border.all(color: MovaColors.border),
                  ),
                  child: Text(
                    plate.toUpperCase(),
                    style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 18,
                      letterSpacing: 1.5,
                    ),
                  ),
                ),
              if (vehicleLine.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(
                  vehicleLine,
                  key: const Key('driverVehicleLine'),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: MovaColors.textSecondary, fontSize: 13),
                ),
              ],
            ],
          ),
        ),
        if (vehiclePhotoUrl.isNotEmpty) ...[
          const SizedBox(width: 8),
          GestureDetector(
            key: const Key('driverVehiclePhoto'),
            onTap: () => _openVehiclePhoto(vehiclePhotoUrl),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: Image.network(
                vehiclePhotoUrl,
                width: 72,
                height: 56,
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => const SizedBox.shrink(),
              ),
            ),
          ),
        ],
      ],
    );
  }

  Widget _initial(String initial) => SizedBox(
        width: 60,
        height: 60,
        child: Center(
          child: Text(
            initial,
            style: const TextStyle(fontWeight: FontWeight.bold, color: MovaColors.violet, fontSize: 22),
          ),
        ),
      );
}

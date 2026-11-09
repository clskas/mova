import 'package:flutter/material.dart';

import '../../../core/i18n/i18n.dart';
import '../../../core/theme/mova_colors.dart';

/// Passenger note given by drivers (« ★ 4.7 · 12 notes »), or « Nouveau passager ».
class PassengerRatingBadge extends StatelessWidget {
  const PassengerRatingBadge({
    super.key,
    required this.rating,
    required this.count,
    this.name,
    this.onDark = false,
  });

  final double? rating;
  final int count;
  final String? name;
  final bool onDark;

  static double? ratingFrom(Map<String, dynamic>? data) => (data?['passengerRating'] as num?)?.toDouble();

  static int countFrom(Map<String, dynamic>? data) => (data?['passengerRatingCount'] as num?)?.toInt() ?? 0;

  @override
  Widget build(BuildContext context) {
    final textColor = onDark ? Colors.white : MovaColors.midnight;
    final muted = onDark ? Colors.white.withValues(alpha: 0.7) : MovaColors.textSecondary;
    final rated = rating != null && count > 0;
    final low = rated && rating! < 3.5;
    final label = rated
        ? (count == 1
            ? trf('{rating} · 1 note', {'rating': rating!.toStringAsFixed(1)})
            : trf('{rating} · {count} notes', {'rating': rating!.toStringAsFixed(1), 'count': count}))
        : tr('Nouveau passager');
    final trimmedName = name?.trim() ?? '';
    return Row(
      key: const Key('passengerRatingBadge'),
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(Icons.person_outline, size: 16, color: muted),
        const SizedBox(width: 4),
        if (trimmedName.isNotEmpty) ...[
          Flexible(
            child: Text(
              trimmedName,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(color: textColor, fontWeight: FontWeight.w700),
            ),
          ),
          const SizedBox(width: 8),
        ],
        Icon(
          rated ? Icons.star : Icons.fiber_new_outlined,
          size: 16,
          color: low ? MovaColors.orange : Colors.amber,
        ),
        const SizedBox(width: 3),
        Flexible(
          child: Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: low ? MovaColors.orange : muted,
              fontWeight: low ? FontWeight.w700 : FontWeight.w500,
              fontSize: 13,
            ),
          ),
        ),
      ],
    );
  }
}

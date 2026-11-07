import 'package:flutter/material.dart';

import '../../../core/config/client_apps_config.dart';
import '../../../core/theme/mova_colors.dart';
import '../../../core/i18n/i18n.dart';

/// « Nombre de passagers » for car rides: − / + stepper (1 to [max]).
class PassengerCountSelector extends StatelessWidget {
  const PassengerCountSelector({
    super.key,
    required this.count,
    required this.onChanged,
    this.max = kMaxRidePassengerCount,
    this.note,
  });

  final int count;
  final ValueChanged<int> onChanged;
  final int max;

  /// Replaces the default hint (e.g. « gamme Familiale sélectionnée »).
  final String? note;

  @override
  Widget build(BuildContext context) {
    final standardSeats = defaultPassengerSeats('STANDARD');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Icon(Icons.people_alt_outlined, color: MovaColors.violet),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                tr('Nombre de passagers'),
                style: TextStyle(fontWeight: FontWeight.w600),
              ),
            ),
            IconButton(
              key: const Key('passengerCountMinus'),
              tooltip: tr('Moins de passagers'),
              onPressed: count > 1 ? () => onChanged(count - 1) : null,
              icon: const Icon(Icons.remove_circle_outline),
            ),
            SizedBox(
              width: 28,
              child: Text(
                '$count',
                key: const Key('passengerCountValue'),
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
            ),
            IconButton(
              key: const Key('passengerCountPlus'),
              tooltip: tr('Plus de passagers'),
              onPressed: count < max ? () => onChanged(count + 1) : null,
              icon: const Icon(Icons.add_circle_outline),
            ),
          ],
        ),
        if (note != null)
          Text(
            note!,
            key: const Key('passengerCountNote'),
            style: const TextStyle(fontSize: 12, color: MovaColors.textSecondary),
          )
        else if (count > standardSeats)
          Text(
            trf('Seules les voitures de {count} places ou plus recevront la course : l\'attente peut être plus longue.', {'count': count}),
            style: const TextStyle(fontSize: 12, color: MovaColors.textSecondary),
          )
        else if (count >= max && max <= kCarPassengerLimit)
          Text(
            tr('4 passagers maximum par voiture.'),
            key: Key('passengerCountNote'),
            style: TextStyle(fontSize: 12, color: MovaColors.textSecondary),
          ),
      ],
    );
  }
}

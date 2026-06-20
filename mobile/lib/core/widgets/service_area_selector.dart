import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../theme/mova_colors.dart';
import '../location/service_area_prefs.dart';
import '../location/service_areas.dart';

class ServiceAreaSelector extends ConsumerWidget {
  const ServiceAreaSelector({super.key, this.compact = false});

  final bool compact;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final area = ref.watch(selectedServiceAreaProvider);
    final theme = Theme.of(context);

    return Material(
      color: MovaColors.violet.withValues(alpha: 0.08),
      borderRadius: BorderRadius.circular(compact ? 20 : 12),
      child: InkWell(
        borderRadius: BorderRadius.circular(compact ? 20 : 12),
        onTap: () => _pickCity(context, ref, area.id),
        child: Padding(
          padding: EdgeInsets.symmetric(
            horizontal: compact ? 12 : 16,
            vertical: compact ? 6 : 10,
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.location_city, size: compact ? 16 : 18, color: MovaColors.violet),
              const SizedBox(width: 6),
              Flexible(
                child: Text(
                  area.name,
                  style: theme.textTheme.labelLarge?.copyWith(
                    color: MovaColors.violet,
                    fontWeight: FontWeight.w600,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              const SizedBox(width: 4),
              Icon(Icons.expand_more, size: compact ? 16 : 18, color: MovaColors.violet),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _pickCity(BuildContext context, WidgetRef ref, String currentId) async {
    final picked = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (ctx) {
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.all(16),
                child: Text(
                  'Choisir votre ville préférée',
                  style: Theme.of(ctx).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
                ),
              ),
              Flexible(
                child: ListView.builder(
                  shrinkWrap: true,
                  itemCount: ServiceAreas.all.length,
                  itemBuilder: (_, i) {
                    final a = ServiceAreas.all[i];
                    return ListTile(
                      leading: Icon(
                        a.id == currentId ? Icons.radio_button_checked : Icons.radio_button_off,
                        color: MovaColors.violet,
                      ),
                      title: Text(a.name),
                      subtitle: Text(a.province, style: const TextStyle(fontSize: 12)),
                      onTap: () => Navigator.pop(ctx, a.id),
                    );
                  },
                ),
              ),
            ],
          ),
        );
      },
    );
    if (picked == null) return;
    final prefs = await ref.read(serviceAreaPrefsProvider.future);
    await prefs.setSelectedAreaId(picked);
    ref.invalidate(serviceAreaPrefsProvider);
  }
}

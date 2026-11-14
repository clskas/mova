import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/i18n/i18n.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_widgets.dart';
import 'growth_widgets.dart';

/// Booking: « Pour quelqu'un d'autre » (mode famille) and « Assurance trajet ».
class FamilyInsuranceOptions extends StatelessWidget {
  const FamilyInsuranceOptions({
    super.key,
    required this.config,
    required this.forOther,
    required this.onForOther,
    required this.nameController,
    required this.phoneController,
    required this.insurance,
    required this.onInsurance,
  });

  final GrowthConfig config;
  final bool forOther;
  final ValueChanged<bool> onForOther;
  final TextEditingController nameController;
  final TextEditingController phoneController;
  final bool insurance;
  final ValueChanged<bool> onInsurance;

  @override
  Widget build(BuildContext context) {
    final family = config.on('familyMode');
    final ins = config.on('tripInsurance');
    if (!family && !ins) return const SizedBox.shrink();
    final fee = config.intOf('tripInsurance', 'feeCdf', 200);
    return MovaCard(
      key: const Key('familyInsuranceOptions'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (family) ...[
            SwitchListTile(
              key: const Key('forOtherToggle'),
              contentPadding: EdgeInsets.zero,
              secondary: const Icon(Icons.family_restroom, color: MovaColors.violet),
              title: Text(tr('Pour quelqu’un d’autre'), style: const TextStyle(fontWeight: FontWeight.w600)),
              subtitle: Text(tr('Enfant, parent, ami : il reçoit un SMS pour suivre le chauffeur. Vous payez.'),
                  style: const TextStyle(fontSize: 12, color: MovaColors.textSecondary)),
              value: forOther,
              onChanged: onForOther,
            ),
            if (forOther) ...[
              TextField(
                controller: nameController,
                decoration: InputDecoration(labelText: tr('Nom de la personne')),
              ),
              TextField(
                key: const Key('riderPhoneField'),
                controller: phoneController,
                keyboardType: TextInputType.phone,
                decoration: InputDecoration(labelText: tr('Téléphone de la personne')),
              ),
            ],
          ],
          if (ins)
            CheckboxListTile(
              key: const Key('insuranceToggle'),
              contentPadding: EdgeInsets.zero,
              controlAffinity: ListTileControlAffinity.leading,
              title: Text(trf('Assurance trajet (+{v1})', {'v1': MarketConfig.formatCdf(fee)})),
              subtitle: Text(tr('Prélevée sur votre portefeuille au départ de la course.'),
                  style: const TextStyle(fontSize: 12, color: MovaColors.textSecondary)),
              value: insurance,
              onChanged: (v) => onInsurance(v == true),
            ),
        ],
      ),
    );
  }
}

/// Driver home: « Ma destination » (only rides that bring me closer).
class DriverDestinationCard extends ConsumerStatefulWidget {
  const DriverDestinationCard({super.key});

  @override
  ConsumerState<DriverDestinationCard> createState() => _DriverDestinationCardState();
}

class _DriverDestinationCardState extends ConsumerState<DriverDestinationCard> {
  Map<String, dynamic>? _data;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final r = await ref.read(apiClientProvider).get('/rides/driver-destination');
    if (!mounted) return;
    if (r case Success(:final data)) setState(() => _data = data);
  }

  void _snack(String m) {
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));
  }

  Future<void> _set() async {
    final ctrl = TextEditingController();
    final query = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(tr('Où allez-vous ?')),
        content: TextField(
          controller: ctrl,
          autofocus: true,
          decoration: InputDecoration(hintText: tr('Quartier, avenue, repère')),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: Text(tr('Annuler'))),
          TextButton(onPressed: () => Navigator.pop(ctx, ctrl.text.trim()), child: Text(tr('Valider'))),
        ],
      ),
    );
    if (query == null || query.length < 2) return;
    setState(() => _busy = true);
    final api = ref.read(apiClientProvider);
    final found = await api.geoAutocomplete(query);
    Map<String, dynamic>? place;
    if (found case Success(:final data)) {
      place = data.where((p) => p['lat'] is num && p['lng'] is num).firstOrNull;
    }
    if (place == null) {
      setState(() => _busy = false);
      _snack(tr('Lieu introuvable. Précisez la commune.'));
      return;
    }
    final r = await api.post('/rides/driver-destination', {
      'lat': place['lat'],
      'lng': place['lng'],
      'label': place['label'] ?? query,
    });
    if (!mounted) return;
    setState(() => _busy = false);
    switch (r) {
      case Success():
        await _load();
      case Failure(:final error):
        _snack(error.message);
    }
  }

  Future<void> _clear() async {
    setState(() => _busy = true);
    await ref.read(apiClientProvider).post('/rides/driver-destination/clear', {});
    if (!mounted) return;
    setState(() => _busy = false);
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    final d = _data;
    if (d == null || d['enabled'] != true) return const SizedBox.shrink();
    final dest = d['destination'] is Map ? Map<String, dynamic>.from(d['destination'] as Map) : null;
    final used = (d['usedToday'] as num?)?.toInt() ?? 0;
    final max = (d['maxPerDay'] as num?)?.toInt() ?? 2;
    return MovaCard(
      key: const Key('driverDestinationCard'),
      child: Row(
        children: [
          const Icon(Icons.home_work_outlined, color: MovaColors.violet),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(tr('Ma destination'), style: const TextStyle(fontWeight: FontWeight.w600)),
                Text(
                  dest != null
                      ? trf('Seulement des courses vers : {v1}', {'v1': dest['label']?.toString() ?? '—'})
                      : trf('Rentrer chez vous en travaillant ({v1}/{v2} aujourd’hui)', {'v1': '$used', 'v2': '$max'}),
                  style: const TextStyle(fontSize: 12, color: MovaColors.textSecondary),
                ),
              ],
            ),
          ),
          TextButton(
            onPressed: _busy ? null : (dest != null ? _clear : _set),
            child: Text(dest != null ? tr('Retirer') : tr('Choisir')),
          ),
        ],
      ),
    );
  }
}

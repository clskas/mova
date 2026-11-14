import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/cache/user_profile_cache.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/i18n/i18n.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_widgets.dart';

const _operatorNames = {
  'MPESA': 'M-Pesa',
  'AIRTEL_MONEY': 'Airtel Money',
  'ORANGE_MONEY': 'Orange Money',
  'AFRIMONEY': 'Afrimoney',
};

/// Readable list of failing operators (pure, tested).
String degradedOperatorsLabel(List<String> ops) =>
    ops.map((o) => _operatorNames[o] ?? o).join(', ');

/// Wallet: « Airtel Money a des soucis » (Automatisations → Panne d'opérateur) and,
/// for drivers, the weekly payout choice.
class WalletAutomationCards extends ConsumerStatefulWidget {
  const WalletAutomationCards({super.key});

  @override
  ConsumerState<WalletAutomationCards> createState() => _WalletAutomationCardsState();
}

class _WalletAutomationCardsState extends ConsumerState<WalletAutomationCards> {
  List<String> _degraded = const [];
  Map<String, dynamic>? _payout;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final api = ref.read(apiClientProvider);
    final cfg = await api.get('/public/client-config');
    final snap = await UserProfileCache.load();
    final isDriver = snap.profile?['role']?.toString().toUpperCase() == 'DRIVER';
    Map<String, dynamic>? payout;
    if (isDriver) {
      final r = await api.get('/wallet/auto-payout');
      if (r case Success(:final data)) {
        if (data is Map && data['available'] == true) payout = Map<String, dynamic>.from(data);
      }
    }
    if (!mounted) return;
    setState(() {
      if (cfg case Success(:final data)) {
        final d = data is Map ? data['mmDegraded'] : null;
        _degraded = d is List ? d.map((e) => e.toString()).toList() : const [];
      }
      _payout = payout;
    });
  }

  Future<void> _setPayout(bool enabled, String provider) async {
    setState(() => _busy = true);
    final r = await ref.read(apiClientProvider).post('/wallet/auto-payout', {'enabled': enabled, 'provider': provider});
    if (!mounted) return;
    setState(() => _busy = false);
    switch (r) {
      case Success(:final data):
        setState(() => _payout = {...?_payout, 'enabled': data['enabled'], 'provider': data['provider']});
      case Failure(:final error):
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = _payout;
    if (_degraded.isEmpty && p == null) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (_degraded.isNotEmpty)
          MovaCard(
            key: const Key('mmDegradedBanner'),
            child: Row(
              children: [
                const Icon(Icons.warning_amber_rounded, color: MovaColors.orange),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(trf('{v1} a des difficultés en ce moment : utilisez un autre opérateur ou les espèces.',
                      {'v1': degradedOperatorsLabel(_degraded)})),
                ),
              ],
            ),
          ),
        if (p != null)
          MovaCard(
            key: const Key('autoPayoutCard'),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  secondary: const Icon(Icons.event_repeat, color: MovaColors.violet),
                  title: Text(tr('Paiement automatique chaque semaine'), style: const TextStyle(fontWeight: FontWeight.w600)),
                  subtitle: Text(
                    trf('Votre solde (dès {v1}) est envoyé sur votre propre numéro Mobile Money.',
                        {'v1': MarketConfig.formatCdf((p['minCdf'] as num?)?.toInt() ?? 0)}),
                    style: const TextStyle(fontSize: 12, color: MovaColors.textSecondary),
                  ),
                  value: p['enabled'] == true,
                  onChanged: _busy ? null : (v) => _setPayout(v, (p['provider'] ?? 'MPESA').toString()),
                ),
                if (p['enabled'] == true)
                  DropdownButton<String>(
                    value: _operatorNames.containsKey(p['provider']) ? p['provider'].toString() : 'MPESA',
                    items: [
                      for (final e in _operatorNames.entries) DropdownMenuItem(value: e.key, child: Text(e.value)),
                    ],
                    onChanged: _busy ? null : (v) => _setPayout(true, v ?? 'MPESA'),
                  ),
              ],
            ),
          ),
      ],
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';

class SubscriptionsScreen extends ConsumerStatefulWidget {
  const SubscriptionsScreen({super.key});

  @override
  ConsumerState<SubscriptionsScreen> createState() => _SubscriptionsScreenState();
}

class _SubscriptionsScreenState extends ConsumerState<SubscriptionsScreen> {
  List<Map<String, dynamic>> _plans = [];
  Map<String, dynamic>? _active;
  bool _loading = true;
  String? _error;
  String? _acting;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final api = ref.read(apiClientProvider);
    final plansResult = await api.get('/subscriptions/plans');
    final mineResult = await api.get('/subscriptions/mine');
    if (!mounted) return;
    setState(() {
      _loading = false;
      if (plansResult case Success(:final data)) {
        if (data is List) {
          _plans = List<Map<String, dynamic>>.from(data);
        } else if (data is Map) {
          final raw = data['data'] ?? data['plans'];
          if (raw is List) _plans = List<Map<String, dynamic>>.from(raw);
        }
      }
      if (mineResult case Success(:final data)) {
        if (data is Map<String, dynamic> && data['plan'] != null) {
          _active = data;
        } else if (data is Map) {
          final map = Map<String, dynamic>.from(data);
          if (map['plan'] != null) {
            _active = map;
          } else if (map['subscription'] is Map && (map['subscription'] as Map)['plan'] != null) {
            _active = map;
          }
        }
      }
      if (plansResult case Failure(:final error)) _error = error.message;
    });
  }

  Future<void> _cancel() async {
    setState(() => _acting = 'cancel');
    final result = await ref.read(apiClientProvider).post('/subscriptions/cancel', {});
    if (!mounted) return;
    setState(() => _acting = null);
    switch (result) {
      case Success(:final data):
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(data['message']?.toString() ?? 'Abonnement annulé')),
        );
        await _load();
      case Failure(:final error):
        setState(() => _error = error.message);
    }
  }

  Future<void> _subscribe(String planId) async {
    setState(() => _acting = planId);
    final result = await ref.read(apiClientProvider).post('/subscriptions/subscribe', {'planId': planId});
    if (!mounted) return;
    setState(() => _acting = null);
    switch (result) {
      case Success(:final data):
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(data['message']?.toString() ?? 'Abonnement activé')),
        );
        await _load();
      case Failure(:final error):
        setState(() => _error = error.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    return MovaScreen(
      title: 'MOVA Plus',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'Réduction de frais et priorité de matching — paiement depuis votre portefeuille MOVA.',
            style: TextStyle(color: MovaColors.textSecondary, height: 1.4),
          ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            MovaErrorBanner(message: _error!, onRetry: _load),
          ],
          if (_active != null && (_active!['plan'] != null || (_active!['subscription'] as Map?)?['plan'] != null)) ...[
            const SizedBox(height: 16),
            MovaCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Abonnement actif : ${((_active!['plan'] ?? (_active!['subscription'] as Map?)?['plan']) as Map)['name']} — '
                    '${MarketConfig.formatCdf(((_active!['plan'] ?? (_active!['subscription'] as Map?)?['plan']) as Map)['monthlyPriceCdf'] as int? ?? 0)} / mois',
                    style: const TextStyle(fontWeight: FontWeight.w600, color: MovaColors.green),
                  ),
                  const SizedBox(height: 12),
                  MovaButton(
                    label: _acting == 'cancel' ? '…' : 'Annuler l\'abonnement',
                    isSecondary: true,
                    isLoading: _acting == 'cancel',
                    onPressed: _acting != null ? null : _cancel,
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 16),
          if (_loading)
            const Center(child: Padding(padding: EdgeInsets.all(24), child: CircularProgressIndicator()))
          else if (_plans.isEmpty)
            const Text('Aucun plan disponible pour le moment.', style: TextStyle(color: MovaColors.textSecondary))
          else
            ..._plans.map((plan) {
              final id = plan['id']?.toString() ?? '';
              final price = plan['monthlyPriceCdf'] as int? ?? 0;
              return Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: MovaCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(plan['name']?.toString() ?? 'Plan', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
                      if (plan['description'] != null)
                        Text(plan['description'].toString(), style: const TextStyle(color: MovaColors.textSecondary)),
                      const SizedBox(height: 8),
                      Text(
                        '${MarketConfig.formatCdf(price)} / mois · -${plan['feeReductionPercent'] ?? 0} % frais',
                        style: const TextStyle(color: MovaColors.violet, fontWeight: FontWeight.w600),
                      ),
                      const SizedBox(height: 12),
                      MovaButton(
                        label: _acting == id ? '…' : 'Souscrire',
                        isLoading: _acting == id,
                        onPressed: _acting != null ? null : () => _subscribe(id),
                      ),
                    ],
                  ),
                ),
              );
            }),
        ],
      ),
    );
  }
}

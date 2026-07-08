import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import 'subscription_plan_card.dart';

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

  Map<String, dynamic>? get _activePlan {
    if (_active == null) return null;
    final plan = _active!['plan'] ?? (_active!['subscription'] as Map?)?['plan'];
    return plan is Map ? Map<String, dynamic>.from(plan) : null;
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

  bool _isPopularPlan(Map<String, dynamic> plan) {
    if (plan['isPopular'] == true || plan['featured'] == true) return true;
    final code = plan['code']?.toString().toUpperCase() ?? '';
    return code.contains('PREMIUM') || code.contains('PLUS');
  }

  @override
  Widget build(BuildContext context) {
    final activePlan = _activePlan;
    final activeId = activePlan?['id']?.toString();

    return MovaScreen(
      title: 'MOVA Plus',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [
                  MovaColors.violet.withValues(alpha: 0.12),
                  MovaColors.green.withValues(alpha: 0.08),
                ],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(16),
            ),
            child: const Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(Icons.workspace_premium, color: MovaColors.violet, size: 28),
                    SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'Économisez sur chaque course',
                        style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18),
                      ),
                    ),
                  ],
                ),
                SizedBox(height: 8),
                Text(
                  'Comme Uber One ou Glovo Plus : réductions automatiques sur les frais de service, '
                  'sans code promo à saisir. Idéal si vous utilisez MOVA plusieurs fois par semaine.',
                  style: TextStyle(color: MovaColors.textSecondary, height: 1.4, fontSize: 13),
                ),
              ],
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            MovaErrorBanner(message: _error!, onRetry: _load),
          ],
          if (activePlan != null) ...[
            const SizedBox(height: 16),
            MovaCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.verified_user, color: MovaColors.green),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          '${activePlan['name']} actif',
                          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    '${MarketConfig.formatCdf(activePlan['monthlyPriceCdf'] as int? ?? 0)} / mois · '
                    '−${activePlan['feeReductionPercent'] ?? 0} % frais',
                    style: const TextStyle(color: MovaColors.textSecondary),
                  ),
                  if (_active?['subscription'] is Map) ...[
                    Builder(builder: (context) {
                      final sub = _active!['subscription'] as Map;
                      if (sub['endsAt'] == null && sub['renewsAt'] == null) return const SizedBox.shrink();
                      return Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Text(
                          'Renouvellement : ${_formatDate(sub['renewsAt'] ?? sub['endsAt'])}',
                          style: const TextStyle(fontSize: 12, color: MovaColors.textSecondary),
                        ),
                      );
                    }),
                  ],
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
          const Text('Comparer les offres', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
          const SizedBox(height: 4),
          const Text(
            'Les réductions s\'appliquent sur les frais MOVA (pas sur le panier restaurant ni les achats courses).',
            style: TextStyle(color: MovaColors.textSecondary, fontSize: 12, height: 1.35),
          ),
          const SizedBox(height: 12),
          if (_loading)
            const Center(child: Padding(padding: EdgeInsets.all(24), child: CircularProgressIndicator()))
          else if (_plans.isEmpty)
            const Text('Aucun plan disponible pour le moment.', style: TextStyle(color: MovaColors.textSecondary))
          else
            ..._plans.map((plan) {
              final id = plan['id']?.toString() ?? '';
              final isActive = activeId != null && activeId == id;
              final highlight = _isPopularPlan(plan) && !isActive;
              return Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: SubscriptionPlanCard(
                  plan: plan,
                  isActive: isActive,
                  highlight: highlight,
                  isLoading: _acting == id,
                  onSubscribe: isActive || _acting != null ? null : () => _subscribe(id),
                ),
              );
            }),
          const SizedBox(height: 8),
          const Text(
            'Le premier mois est débité immédiatement de votre portefeuille MOVA. '
            'Rechargez votre solde avant de souscrire si nécessaire.',
            style: TextStyle(color: MovaColors.textSecondary, fontSize: 11, height: 1.35),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }

  String _formatDate(dynamic raw) {
    if (raw == null) return '—';
    try {
      final dt = DateTime.parse(raw.toString());
      return '${dt.day.toString().padLeft(2, '0')}/${dt.month.toString().padLeft(2, '0')}/${dt.year}';
    } catch (_) {
      return raw.toString();
    }
  }
}

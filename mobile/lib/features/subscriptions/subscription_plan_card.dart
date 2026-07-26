import 'package:flutter/material.dart';

import '../../core/config/market_config.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_widgets.dart';

/// Carte plan d'abonnement SENGA Plus.
class SubscriptionPlanCard extends StatelessWidget {
  const SubscriptionPlanCard({
    super.key,
    required this.plan,
    required this.onSubscribe,
    this.isActive = false,
    this.isLoading = false,
    this.highlight = false,
  });

  final Map<String, dynamic> plan;
  final VoidCallback? onSubscribe;
  final bool isActive;
  final bool isLoading;
  final bool highlight;

  static List<String> benefitsFor(Map<String, dynamic> plan) {
    final reduction = plan['feeReductionPercent'] as int? ?? 0;
    final priority = plan['priorityMatching'] == true;
    final benefits = <String>[
      if (reduction > 0) '−$reduction % sur les frais de service (courses, livraisons, déménagement)',
      if (priority) 'Priorité de matching chauffeur / livreur',
      'Réduction appliquée automatiquement à chaque commande',
      'Paiement mensuel depuis votre portefeuille SENGA',
      'Annulation à tout moment',
    ];
    final custom = plan['benefits'];
    if (custom is List && custom.isNotEmpty) {
      return custom.map((e) => e.toString()).toList();
    }
    return benefits;
  }

  static int estimatedMonthlySavings(Map<String, dynamic> plan) {
    final reduction = plan['feeReductionPercent'] as int? ?? 0;
    if (reduction <= 0) return 0;
    // Estimation : ~8 commandes/mois, frais service moyen 2 500 CDF
    const avgOrdersPerMonth = 8;
    const avgServiceFeeCdf = 2500;
    return ((avgOrdersPerMonth * avgServiceFeeCdf * reduction) / 100).round();
  }

  @override
  Widget build(BuildContext context) {
    final name = plan['name']?.toString() ?? 'Plan';
    final price = plan['monthlyPriceCdf'] as int? ?? 0;
    final description = plan['description']?.toString();
    final benefits = benefitsFor(plan);
    final savings = estimatedMonthlySavings(plan);
    final borderColor = highlight ? MovaColors.violet : Colors.grey.shade200;

    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: borderColor, width: highlight ? 2 : 1),
        color: highlight ? MovaColors.violet.withValues(alpha: 0.04) : Colors.white,
        boxShadow: highlight
            ? [
                BoxShadow(
                  color: MovaColors.violet.withValues(alpha: 0.12),
                  blurRadius: 12,
                  offset: const Offset(0, 4),
                ),
              ]
            : null,
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (highlight)
                        Container(
                          margin: const EdgeInsets.only(bottom: 8),
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: MovaColors.violet,
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: const Text(
                            'Le plus populaire',
                            style: TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w600),
                          ),
                        ),
                      Text(name, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 20)),
                      if (description != null && description.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.only(top: 4),
                          child: Text(description, style: const TextStyle(color: MovaColors.textSecondary, height: 1.35)),
                        ),
                    ],
                  ),
                ),
                if (isActive)
                  const Icon(Icons.verified, color: MovaColors.green, size: 28),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  MarketConfig.formatCdf(price),
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 28,
                    color: highlight ? MovaColors.violet : MovaColors.midnight,
                  ),
                ),
                const Padding(
                  padding: EdgeInsets.only(left: 4, bottom: 4),
                  child: Text('/ mois', style: TextStyle(color: MovaColors.textSecondary, fontSize: 14)),
                ),
              ],
            ),
            if (savings > price) ...[
              const SizedBox(height: 6),
              Text(
                'Économisez jusqu\'à ${MarketConfig.formatCdf(savings)}/mois si vous commandez régulièrement',
                style: const TextStyle(color: MovaColors.green, fontSize: 12, fontWeight: FontWeight.w500),
              ),
            ],
            const SizedBox(height: 16),
            ...benefits.map(
              (b) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(Icons.check_circle, size: 18, color: highlight ? MovaColors.violet : MovaColors.green),
                    const SizedBox(width: 8),
                    Expanded(child: Text(b, style: const TextStyle(fontSize: 13, height: 1.35))),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 8),
            if (isActive)
              const Text(
                'Plan actif sur votre compte',
                textAlign: TextAlign.center,
                style: TextStyle(color: MovaColors.green, fontWeight: FontWeight.w600),
              )
            else
              MovaButton(
                label: isLoading ? '…' : 'Choisir $name',
                isLoading: isLoading,
                onPressed: onSubscribe,
              ),
          ],
        ),
      ),
    );
  }
}

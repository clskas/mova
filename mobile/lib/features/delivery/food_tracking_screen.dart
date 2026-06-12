import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/config/market_config.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';

class FoodTrackingScreen extends ConsumerWidget {
  const FoodTrackingScreen({
    super.key,
    required this.orderId,
    required this.restaurantName,
    required this.totalCdf,
    this.deliveryAddress,
  });

  final String orderId;
  final String restaurantName;
  final int totalCdf;
  final String? deliveryAddress;

  static const _timeline = [
    {'status': 'CONFIRMED', 'label': 'Commande confirmée', 'done': true},
    {'status': 'PREPARING', 'label': 'Préparation en cuisine', 'done': true},
    {'status': 'PICKUP', 'label': 'Livreur en route', 'done': true},
    {'status': 'DELIVERED', 'label': 'Livré', 'done': false},
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MovaScreen(
      title: 'Suivi commande',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          MovaCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  restaurantName,
                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 4),
                Text(
                  'Commande #$orderId',
                  style: const TextStyle(color: MovaColors.textSecondary, fontSize: 13),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                if (deliveryAddress != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    deliveryAddress!,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
                const SizedBox(height: 8),
                Text(
                  MarketConfig.formatCdf(totalCdf),
                  style: const TextStyle(
                    color: MovaColors.green,
                    fontWeight: FontWeight.bold,
                    fontSize: 18,
                  ),
                ),
                const SizedBox(height: 4),
                const Text(
                  'En cours de livraison',
                  style: TextStyle(color: MovaColors.violet, fontWeight: FontWeight.w600),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          Text('Statuts', style: Theme.of(context).textTheme.titleSmall),
          const SizedBox(height: 12),
          ..._timeline.map((step) {
            final done = step['done'] == true;
            return Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(
                    done ? Icons.check_circle : Icons.radio_button_unchecked,
                    color: done ? MovaColors.green : MovaColors.textSecondary,
                    size: 22,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      step['label']?.toString() ?? '',
                      style: TextStyle(
                        fontWeight: done ? FontWeight.w600 : FontWeight.normal,
                        color: done ? MovaColors.midnight : MovaColors.textSecondary,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
            );
          }),
          const SizedBox(height: 24),
          MovaButton(
            label: 'Retour à l\'accueil',
            isSecondary: true,
            icon: Icons.home_outlined,
            onPressed: () => Navigator.popUntil(context, (r) => r.isFirst),
          ),
        ],
      ),
    );
  }
}

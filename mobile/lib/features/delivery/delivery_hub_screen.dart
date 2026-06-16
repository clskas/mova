import 'package:flutter/material.dart';

import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_service_icons.dart';
import '../errands/errand_screen.dart';
import '../home/service_card.dart';
import 'express_delivery_screen.dart';
import 'food_delivery_screen.dart';
import 'parcel_delivery_screen.dart';

/// Hub regroupant tous les types de livraison MOVA.
class DeliveryHubScreen extends StatelessWidget {
  const DeliveryHubScreen({super.key});

  void _open(BuildContext context, Widget screen) {
    Navigator.push(context, MaterialPageRoute(builder: (_) => screen));
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return MovaScreen(
      title: 'Livraisons',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Choisissez votre type de livraison',
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: theme.textTheme.bodyMedium?.copyWith(
              color: MovaColors.textSecondary,
            ),
          ),
          const SizedBox(height: 20),
          LayoutBuilder(
            builder: (context, constraints) {
              const spacing = 12.0;
              final cardWidth = (constraints.maxWidth - spacing) / 2;

              Widget gridRow(List<Widget> cards) {
                return Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    for (var i = 0; i < cards.length; i++) ...[
                      if (i > 0) const SizedBox(width: spacing),
                      SizedBox(width: cardWidth, child: cards[i]),
                    ],
                  ],
                );
              }

              return Column(
                children: [
                  gridRow([
                    ServiceCard(
                      icon: MovaServiceIcon.food(color: MovaColors.green),
                      iconColor: MovaColors.green,
                      title: 'Livraison repas',
                      subtitle: 'Restaurants et plats locaux',
                      onTap: () => _open(context, const FoodDeliveryScreen()),
                    ),
                    ServiceCard(
                      icon: MovaServiceIcon.parcel(color: MovaColors.green),
                      iconColor: MovaColors.green,
                      title: 'Livraison colis',
                      subtitle: 'Envoyez un colis en toute sécurité',
                      onTap: () => _open(context, const ParcelDeliveryScreen()),
                    ),
                  ]),
                  const SizedBox(height: spacing),
                  gridRow([
                    ServiceCard(
                      icon: const Icon(Icons.bolt_outlined, color: MovaColors.orange, size: 28),
                      iconColor: MovaColors.orange,
                      title: 'Livraison express',
                      subtitle: 'Envoi urgent en moins de 45 min',
                      onTap: () => _open(context, const ExpressDeliveryScreen()),
                    ),
                    ServiceCard(
                      icon: MovaServiceIcon.errand(color: MovaColors.orange),
                      iconColor: MovaColors.orange,
                      title: 'Courses & commissions',
                      subtitle: 'Achats et courses pour vous',
                      onTap: () => _open(context, const ErrandScreen()),
                    ),
                  ]),
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}

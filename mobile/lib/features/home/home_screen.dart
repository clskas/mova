import 'package:flutter/material.dart';
import '../../core/config/market_config.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../booking/booking_screen.dart';
import '../carpool/carpool_screen.dart';
import '../delivery/food_delivery_screen.dart';
import '../delivery/parcel_delivery_screen.dart';
import '../errands/errand_screen.dart';
import '../rides/scheduled_ride_screen.dart';
import '../wallet/wallet_screen.dart';
import '../help/help_screen.dart';
import '../history/history_screen.dart';
import 'service_card.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  String _greeting() {
    final hour = DateTime.now().hour;
    if (hour < 12) return 'Bonjour';
    if (hour < 18) return 'Bon après-midi';
    return 'Bonsoir';
  }

  void _open(BuildContext context, Widget screen) {
    Navigator.push(context, MaterialPageRoute(builder: (_) => screen));
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return MovaScreen(
      title: 'MOVA',
      actions: [
        IconButton(
          icon: const Icon(Icons.account_balance_wallet_outlined),
          tooltip: 'Wallet',
          onPressed: () => _open(context, const WalletScreen()),
        ),
        IconButton(
          icon: const Icon(Icons.history),
          tooltip: 'Historique',
          onPressed: () => _open(context, const HistoryScreen()),
        ),
        IconButton(
          icon: const Icon(Icons.help_outline),
          tooltip: 'Aide',
          onPressed: () => _open(context, const HelpScreen()),
        ),
      ],
      bottomNavigationBar: NavigationBar(
        selectedIndex: 0,
        onDestinationSelected: (index) {
          switch (index) {
            case 1:
              _open(context, const HistoryScreen());
            case 2:
              _open(context, const WalletScreen());
            case 3:
              _open(context, const HelpScreen());
          }
        },
        backgroundColor: MovaColors.white,
        indicatorColor: MovaColors.violet.withValues(alpha: 0.15),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.home_outlined),
            selectedIcon: Icon(Icons.home, color: MovaColors.violet),
            label: 'Accueil',
          ),
          NavigationDestination(
            icon: Icon(Icons.history_outlined),
            selectedIcon: Icon(Icons.history, color: MovaColors.violet),
            label: 'Historique',
          ),
          NavigationDestination(
            icon: Icon(Icons.account_balance_wallet_outlined),
            selectedIcon: Icon(Icons.account_balance_wallet, color: MovaColors.violet),
            label: 'Wallet',
          ),
          NavigationDestination(
            icon: Icon(Icons.help_outline),
            selectedIcon: Icon(Icons.help, color: MovaColors.violet),
            label: 'Aide',
          ),
        ],
      ),
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
                    Text(
                      '${_greeting()} 👋',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.headlineSmall?.copyWith(
                        fontWeight: FontWeight.bold,
                        color: MovaColors.midnight,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        const Icon(
                          Icons.location_on,
                          size: 16,
                          color: MovaColors.violet,
                        ),
                        const SizedBox(width: 4),
                        Flexible(
                          child: Text(
                            MarketConfig.defaultCity,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: theme.textTheme.bodyMedium?.copyWith(
                              color: MovaColors.textSecondary,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            'La mobilité, simplement.',
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: theme.textTheme.titleMedium?.copyWith(
              color: MovaColors.violet,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Choisissez un service pour continuer',
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
                      icon: Icons.local_taxi,
                      iconColor: MovaColors.violet,
                      title: 'Taxi / Moto-taxi',
                      subtitle: 'Course immédiate partout en ville',
                      onTap: () => _open(context, const BookingScreen()),
                    ),
                    ServiceCard(
                      icon: Icons.inventory_2_outlined,
                      iconColor: MovaColors.green,
                      title: 'Livraison colis',
                      subtitle: 'Envoyez un colis en toute sécurité',
                      onTap: () => _open(context, const ParcelDeliveryScreen()),
                    ),
                  ]),
                  const SizedBox(height: spacing),
                  gridRow([
                    ServiceCard(
                      icon: Icons.account_balance_wallet_outlined,
                      iconColor: MovaColors.midnight,
                      title: 'Wallet MOVA',
                      subtitle: 'Solde, recharge et paiements',
                      onTap: () => _open(context, const WalletScreen()),
                    ),
                    ServiceCard(
                      icon: Icons.history,
                      iconColor: MovaColors.orange,
                      title: 'Historique',
                      subtitle: 'Vos courses et transactions',
                      onTap: () => _open(context, const HistoryScreen()),
                    ),
                  ]),
                  const SizedBox(height: spacing),
                  gridRow([
                    ServiceCard(
                      icon: Icons.event_available_outlined,
                      iconColor: MovaColors.violet,
                      title: 'Réservation planifiée',
                      subtitle: 'Programmez votre trajet à l\'avance',
                      onTap: () => _open(context, const ScheduledRideScreen()),
                    ),
                    ServiceCard(
                      icon: Icons.restaurant_outlined,
                      iconColor: MovaColors.green,
                      title: 'Livraison repas',
                      subtitle: 'Restaurants et plats locaux',
                      onTap: () => _open(context, const FoodDeliveryScreen()),
                    ),
                  ]),
                  const SizedBox(height: spacing),
                  gridRow([
                    ServiceCard(
                      icon: Icons.shopping_bag_outlined,
                      iconColor: MovaColors.orange,
                      title: 'Courses & commissions',
                      subtitle: 'Achats et courses pour vous',
                      onTap: () => _open(context, const ErrandScreen()),
                    ),
                    ServiceCard(
                      icon: Icons.people_outline,
                      iconColor: MovaColors.midnight,
                      title: 'Covoiturage',
                      subtitle: 'Partagez un trajet, économisez',
                      onTap: () => _open(context, const CarpoolScreen()),
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

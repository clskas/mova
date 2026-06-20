import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/auth/session.dart';
import '../../core/error/result.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import '../../core/widgets/mova_service_icons.dart';
import '../../core/widgets/service_area_selector.dart';
import '../booking/booking_screen.dart';
import '../carpool/carpool_screen.dart';
import '../delivery/delivery_hub_screen.dart';
import '../rides/scheduled_ride_screen.dart';
import '../moving/moving_screen.dart';
import '../rental/rental_screen.dart';
import '../wallet/wallet_screen.dart';
import '../help/help_screen.dart';
import '../history/history_screen.dart';
import 'service_card.dart';

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> with WidgetsBindingObserver {
  Map<String, dynamic>? _user;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _loadUser();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _loadUser(forceRefresh: true);
  }

  Future<void> _loadUser({bool forceRefresh = false}) async {
    final api = ref.read(apiClientProvider);
    await api.loadToken();
    final result = await api.getCurrentUser(forceRefresh: forceRefresh);
    if (!mounted) return;
    if (result case Success(:final data)) {
      setState(() => _user = data);
    }
  }

  String _greeting() {
    final hour = DateTime.now().hour;
    if (hour < 12) return 'Bonjour';
    if (hour < 18) return 'Bon après-midi';
    return 'Bonsoir';
  }

  void _open(BuildContext context, Widget screen) {
    Navigator.push(context, MaterialPageRoute(builder: (_) => screen));
  }

  String _userLabel() {
    final first = _user?['firstName']?.toString().trim();
    final last = _user?['lastName']?.toString().trim();
    if (first != null && first.isNotEmpty) {
      return last != null && last.isNotEmpty ? '$first $last' : first;
    }
    final phone = _user?['phone']?.toString();
    if (phone != null && phone.isNotEmpty) return phone;
    return '';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final userLabel = _userLabel();
    final suspended = _user?['status']?.toString() == 'SUSPENDED';

    return MovaScreen(
      titleWidget: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const MovaBrandIcon(size: 26),
          const SizedBox(width: 8),
          Text(
            'MOVA',
            style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
          ),
        ],
      ),
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
        IconButton(
          icon: const Icon(Icons.logout),
          tooltip: 'Déconnexion',
          onPressed: () async {
            final confirm = await showDialog<bool>(
              context: context,
              builder: (ctx) => AlertDialog(
                title: const Text('Déconnexion'),
                content: const Text('Voulez-vous vous déconnecter de MOVA ?'),
                actions: [
                  TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Annuler')),
                  TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Déconnexion')),
                ],
              ),
            );
            if (confirm == true && context.mounted) {
              await logoutPassenger(context, ref);
            }
          },
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
      scrollable: false,
      child: RefreshIndicator(
        onRefresh: () => _loadUser(forceRefresh: true),
        child: SingleChildScrollView(
          physics: kMovaScrollPhysics,
          child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (suspended)
            const Padding(
              padding: EdgeInsets.only(bottom: 12),
              child: Card(
                color: Color(0xFFFFF3E0),
                child: Padding(
                  padding: EdgeInsets.all(12),
                  child: Text(
                    'Compte suspendu — contactez le support MOVA.',
                    style: TextStyle(color: MovaColors.orange, fontWeight: FontWeight.w600),
                  ),
                ),
              ),
            ),
          const SizedBox(height: 16),
          MovaWelcomeBanner(
            greeting: userLabel.isNotEmpty ? '${_greeting()}, $userLabel 👋' : '${_greeting()} 👋',
            subtitle: 'Mobilité partout en RDC — choisissez un service',
          ),
          const SizedBox(height: 12),
          const Align(alignment: Alignment.centerLeft, child: ServiceAreaSelector(compact: true)),
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
                      icon: MovaServiceIcon.taxi(color: MovaColors.violet),
                      iconColor: MovaColors.violet,
                      title: 'Taxi / Moto-taxi',
                      subtitle: 'Course immédiate partout en RDC',
                      onTap: () => _open(context, const BookingScreen()),
                    ),
                    ServiceCard(
                      icon: MovaServiceIcon.parcel(color: MovaColors.green),
                      iconColor: MovaColors.green,
                      title: 'Livraisons',
                      subtitle: 'Repas, colis, express et plus',
                      onTap: () => _open(context, const DeliveryHubScreen()),
                    ),
                  ]),
                  const SizedBox(height: spacing),
                  gridRow([
                    ServiceCard(
                      icon: MovaServiceIcon.calendar(color: MovaColors.violet),
                      iconColor: MovaColors.violet,
                      title: 'Réservation planifiée',
                      subtitle: 'Programmez votre trajet à l\'avance',
                      onTap: () => _open(context, const ScheduledRideScreen()),
                    ),
                    ServiceCard(
                      icon: MovaServiceIcon.carpool(color: MovaColors.midnight),
                      iconColor: MovaColors.midnight,
                      title: 'Covoiturage',
                      subtitle: 'Partagez un trajet, économisez',
                      onTap: () => _open(context, const CarpoolScreen()),
                    ),
                  ]),
                  const SizedBox(height: spacing),
                  gridRow([
                    ServiceCard(
                      icon: MovaServiceIcon.rental(color: MovaColors.violet),
                      iconColor: MovaColors.violet,
                      title: 'Location véhicule',
                      subtitle: 'Voiture, SUV ou minibus',
                      onTap: () => _open(context, const RentalScreen()),
                    ),
                    ServiceCard(
                      icon: MovaServiceIcon.moving(color: MovaColors.midnight),
                      iconColor: MovaColors.midnight,
                      title: 'Déménagement',
                      subtitle: 'Camion et manutention',
                      onTap: () => _open(context, const MovingScreen()),
                    ),
                  ]),
                  const SizedBox(height: spacing),
                  gridRow([
                    ServiceCard(
                      icon: MovaServiceIcon.wallet(color: MovaColors.midnight),
                      iconColor: MovaColors.midnight,
                      title: 'Wallet MOVA',
                      subtitle: 'Solde, recharge et paiements',
                      onTap: () => _open(context, const WalletScreen()),
                    ),
                    ServiceCard(
                      icon: MovaServiceIcon.history(color: MovaColors.orange),
                      iconColor: MovaColors.orange,
                      title: 'Historique',
                      subtitle: 'Vos courses et transactions',
                      onTap: () => _open(context, const HistoryScreen()),
                    ),
                  ]),
                ],
              );
            },
          ),
          SizedBox(height: MediaQuery.paddingOf(context).bottom + kBottomNavigationBarHeight + 16),
        ],
      ),
        ),
      ),
    );
  }
}

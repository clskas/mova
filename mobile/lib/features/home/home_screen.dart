import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/auth/session.dart';
import '../../core/config/passenger_copy.dart';
import '../../core/error/result.dart';
import '../../core/home/active_shipments_refresh.dart';
import '../../core/location/gps_enable_prompt.dart';
import '../../core/location/service_area_gps.dart';
import '../../core/offline/connectivity_service.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import '../../core/widgets/mova_service_icons.dart';
import '../../core/widgets/passenger_service_icons.dart';
import '../../core/widgets/publicite_carousel.dart';
import '../../core/widgets/service_area_selector.dart';
import '../booking/booking_screen.dart';
import '../booking/matching_screen.dart';
import '../booking/tracking_screen.dart';
import '../carpool/carpool_screen.dart';
import '../delivery/delivery_hub_screen.dart';
import '../delivery/food_tracking_screen.dart';
import '../delivery/parcel_tracking_screen.dart';
import '../rides/scheduled_ride_screen.dart';
import '../moving/moving_screen.dart';
import '../rental/rental_screen.dart';
import '../errands/errand_tracking_screen.dart';
import '../subscriptions/subscriptions_screen.dart';
import '../wallet/wallet_screen.dart';
import '../help/help_screen.dart';
import '../profile/profile_screen.dart';
import '../history/history_screen.dart';
import 'service_card.dart';

enum _HomeMenuAction { wallet, subscriptions, history, help, logout }

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> with WidgetsBindingObserver {
  Map<String, dynamic>? _user;
  Map<String, dynamic>? _activeRide;
  Map<String, dynamic>? _activeDelivery;
  Map<String, dynamic>? _activeErrand;
  List<Map<String, dynamic>> _publicites = const [];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) GpsEnablePrompt.promptIfNeeded(context);
    });
    _loadUser();
    _loadActiveRide();
    _loadActiveDelivery();
    _loadPublicites();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      GpsEnablePrompt.promptIfNeeded(context);
      final connectivity = ref.read(connectivityServiceProvider);
      connectivity.prepareReconnect();
      ref.read(apiClientProvider).checkHealth(resetFailures: true);
      ServiceAreaGps.sync(ref);
      _loadUser(forceRefresh: true);
      _loadActiveRide();
      _loadActiveDelivery();
      _loadPublicites();
    }
  }

  Future<void> _loadPublicites() async {
    final api = ref.read(apiClientProvider);
    final result = await api.getPublicites(cible: 'PASSENGER');
    if (!mounted) return;
    if (result case Success(:final data)) {
      setState(() => _publicites = data);
    }
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

  Future<void> _loadActiveDelivery() async {
    final api = ref.read(apiClientProvider);
    final result = await api.getActiveShipments();
    if (!mounted) return;
    if (result case Success(:final data)) {
      final delivery = data['delivery'];
      final errand = data['errand'];
      setState(() {
        _activeDelivery = delivery is Map<String, dynamic>
            ? delivery
            : delivery is Map
                ? Map<String, dynamic>.from(delivery)
                : null;
        _activeErrand = errand is Map<String, dynamic>
            ? errand
            : errand is Map
                ? Map<String, dynamic>.from(errand)
                : null;
      });
    }
  }

  void _resumeActiveErrand() {
    final errand = _activeErrand;
    if (errand == null) return;
    final id = errand['id']?.toString();
    if (id == null || id.isEmpty) return;
    final items = (errand['items'] as List?)?.map((e) => e.toString()).toList() ?? const <String>[];
    final total = errand['totalPriceCdf'] as int? ??
        errand['priceCdf'] as int? ??
        ((errand['estimatedPriceCdf'] as int? ?? 0) + (errand['purchaseTotalCdf'] as int? ?? 0));
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => ErrandTrackingScreen(
          errandId: id,
          deliveryAddress: errand['deliveryAddress']?.toString() ??
              errand['dropoffAddress']?.toString() ??
              'Livraison',
          items: items,
          totalCdf: total,
        ),
      ),
    ).then((_) => _loadActiveDelivery());
  }

  String _activeErrandLabel() {
    final errand = _activeErrand;
    if (errand == null) return '';
    final status = errand['status']?.toString().toUpperCase() ?? '';
    if (status == 'COMPLETED' && errand['isPaid'] != true) {
      return 'Courses & commissions — paiement en attente';
    }
    return switch (status) {
      'IN_PROGRESS' => 'Courses & commissions — achats en cours',
      'ASSIGNED' => 'Courses & commissions — livreur assigné',
      'PENDING' => 'Courses & commissions — recherche livreur',
      'COMPLETED' => 'Courses & commissions — terminée',
      _ => 'Courses & commissions en cours',
    };
  }

  void _resumeActiveDelivery() {
    final delivery = _activeDelivery;
    if (delivery == null) return;
    final id = delivery['id']?.toString();
    if (id == null || id.isEmpty) return;
    final type = delivery['type']?.toString().toUpperCase() ?? 'PARCEL';
    final Widget screen;
    if (type == 'FOOD') {
      screen = FoodTrackingScreen(
        orderId: id,
        restaurantName: delivery['restaurantName']?.toString() ??
            delivery['restaurant']?['name']?.toString() ??
            'Restaurant',
        totalCdf: (delivery['priceCdf'] ?? delivery['estimatedPriceCdf'] ?? 0) as int,
        deliveryAddress: delivery['dropoffAddress']?.toString() ??
            delivery['deliveryAddress']?.toString(),
      );
    } else {
      screen = ParcelTrackingScreen(parcelId: id);
    }
    Navigator.push(context, MaterialPageRoute(builder: (_) => screen))
        .then((_) => _loadActiveDelivery());
  }

  String _activeDeliveryLabel() {
    final delivery = _activeDelivery;
    if (delivery == null) return '';
    final status = delivery['status']?.toString().toUpperCase() ?? '';
    final type = delivery['type']?.toString().toUpperCase() ?? '';
    final prefix = type == 'FOOD' ? 'Commande repas' : 'Livraison';
    return switch (status) {
      'IN_TRANSIT' => '$prefix — livreur en route',
      'PICKED_UP' => '$prefix — colis pris en charge',
      'READY_FOR_PICKUP' => '$prefix — prête pour le livreur',
      'RESTAURANT_CONFIRMED' => '$prefix — en préparation',
      _ => '$prefix en cours',
    };
  }

  Future<void> _loadActiveRide() async {
    final api = ref.read(apiClientProvider);
    final result = await api.getActiveRide();
    if (!mounted) return;
    if (result case Success(:final data)) {
      setState(() => _activeRide = data);
    }
  }

  void _resumeActiveRide() {
    final ride = _activeRide;
    if (ride == null) return;
    final api = ref.read(apiClientProvider);
    final rideId = ride['id']?.toString();
    if (rideId == null || rideId.isEmpty) return;
    final fare = (ride['estimatedFareCdf'] ?? ride['totalCdf'] ?? 0) as int;
    final Widget screen;
    if (api.rideHasDriver(ride)) {
      screen = TrackingScreen(rideId: rideId, estimatedFareCdf: fare);
    } else {
      screen = MatchingScreen(
        rideId: rideId,
        pickupAddress: ride['pickupAddress']?.toString() ?? 'Départ',
        dropoffAddress: ride['dropoffAddress']?.toString() ?? 'Destination',
        estimatedFareCdf: fare,
      );
    }
    Navigator.push(context, MaterialPageRoute(builder: (_) => screen))
        .then((_) => _loadActiveRide());
  }

  String _activeRideLabel() {
    final ride = _activeRide;
    if (ride == null) return '';
    final api = ref.read(apiClientProvider);
    if (api.rideHasDriver(ride)) {
      final status = ride['status']?.toString().toUpperCase() ?? '';
      return switch (status) {
        'IN_PROGRESS' => 'Course en cours — suivez votre trajet',
        'DRIVER_ARRIVED' => 'Votre chauffeur est arrivé',
        _ => 'Chauffeur en route',
      };
    }
    return 'Recherche d\'un chauffeur en cours…';
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

  Future<void> _openProfile(BuildContext context) async {
    await Navigator.push(context, MaterialPageRoute(builder: (_) => const ProfileScreen()));
    if (!mounted) return;
    await _loadUser(forceRefresh: true);
  }

  String _userLabel() {
    final first = _user?['firstName']?.toString().trim();
    final last = _user?['lastName']?.toString().trim();
    if (first != null && first.isNotEmpty) {
      return last != null && last.isNotEmpty ? '$first $last' : first;
    }
    return '';
  }

  String _welcomeGreeting(String userLabel) {
    if (userLabel.isEmpty) return PassengerCopy.homeTagline;
    return '${_greeting()}, $userLabel 👋';
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(activeShipmentsRefreshTickProvider, (_, __) => _loadActiveDelivery());

    final userLabel = _userLabel();
    final suspended = _user?['status']?.toString() == 'SUSPENDED';

    return MovaScreen(
      title: 'Senga',
      actions: [
        IconButton(
          icon: const Icon(Icons.person_outline),
          tooltip: 'Mon profil',
          onPressed: () => _openProfile(context),
        ),
        PopupMenuButton<_HomeMenuAction>(
          tooltip: 'Plus',
          onSelected: (action) async {
            switch (action) {
              case _HomeMenuAction.wallet:
                _open(context, const WalletScreen());
              case _HomeMenuAction.subscriptions:
                _open(context, const SubscriptionsScreen());
              case _HomeMenuAction.history:
                _open(context, const HistoryScreen());
              case _HomeMenuAction.help:
                _open(context, const HelpScreen());
              case _HomeMenuAction.logout:
                final confirm = await showDialog<bool>(
                  context: context,
                  builder: (ctx) => AlertDialog(
                    title: const Text('Déconnexion'),
                    content: const Text('Voulez-vous vous déconnecter de SENGA ?'),
                    actions: [
                      TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Annuler')),
                      TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Déconnexion')),
                    ],
                  ),
                );
                if (confirm == true && context.mounted) {
                  await logoutPassenger(context, ref);
                }
            }
          },
          itemBuilder: (context) => const [
            PopupMenuItem(
              value: _HomeMenuAction.wallet,
              child: ListTile(
                leading: Icon(Icons.account_balance_wallet_outlined),
                title: Text('Wallet'),
                contentPadding: EdgeInsets.zero,
                visualDensity: VisualDensity.compact,
              ),
            ),
            PopupMenuItem(
              value: _HomeMenuAction.subscriptions,
              child: ListTile(
                leading: Icon(Icons.card_membership_outlined),
                title: Text('SENGA Plus'),
                contentPadding: EdgeInsets.zero,
                visualDensity: VisualDensity.compact,
              ),
            ),
            PopupMenuItem(
              value: _HomeMenuAction.history,
              child: ListTile(
                leading: Icon(Icons.history),
                title: Text('Historique'),
                contentPadding: EdgeInsets.zero,
                visualDensity: VisualDensity.compact,
              ),
            ),
            PopupMenuItem(
              value: _HomeMenuAction.help,
              child: ListTile(
                leading: Icon(Icons.help_outline),
                title: Text('Aide'),
                contentPadding: EdgeInsets.zero,
                visualDensity: VisualDensity.compact,
              ),
            ),
            PopupMenuDivider(),
            PopupMenuItem(
              value: _HomeMenuAction.logout,
              child: ListTile(
                leading: Icon(Icons.logout),
                title: Text('Déconnexion'),
                contentPadding: EdgeInsets.zero,
                visualDensity: VisualDensity.compact,
              ),
            ),
          ],
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
      padding: EdgeInsets.symmetric(
        horizontal: MediaQuery.sizeOf(context).width < 360 ? 12 : 16,
        vertical: 16,
      ),
      child: RefreshIndicator(
        onRefresh: () async {
          await _loadUser(forceRefresh: true);
          await _loadActiveRide();
          await _loadActiveDelivery();
        },
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
                    'Compte suspendu — contactez le support SENGA.',
                    style: TextStyle(color: MovaColors.orange, fontWeight: FontWeight.w600),
                  ),
                ),
              ),
            ),
          if (_activeRide != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Material(
                color: MovaColors.violet,
                borderRadius: BorderRadius.circular(14),
                child: InkWell(
                  borderRadius: BorderRadius.circular(14),
                  onTap: _resumeActiveRide,
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Row(
                      children: [
                        const Icon(Icons.directions_car, color: MovaColors.white),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                'Course en cours',
                                style: TextStyle(
                                  color: MovaColors.white,
                                  fontWeight: FontWeight.bold,
                                  fontSize: 15,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                _activeRideLabel(),
                                style: const TextStyle(color: MovaColors.white, fontSize: 13),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                          decoration: BoxDecoration(
                            color: MovaColors.white,
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: const Text(
                            'Reprendre',
                            style: TextStyle(
                              color: MovaColors.violet,
                              fontWeight: FontWeight.w600,
                              fontSize: 13,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          if (_activeErrand != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Material(
                color: MovaColors.green,
                borderRadius: BorderRadius.circular(14),
                child: InkWell(
                  borderRadius: BorderRadius.circular(14),
                  onTap: _resumeActiveErrand,
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Row(
                      children: [
                        const Icon(Icons.shopping_bag_outlined, color: MovaColors.white),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                'Courses en cours',
                                style: TextStyle(
                                  color: MovaColors.white,
                                  fontWeight: FontWeight.bold,
                                  fontSize: 15,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                _activeErrandLabel(),
                                style: const TextStyle(color: MovaColors.white, fontSize: 13),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                          decoration: BoxDecoration(
                            color: MovaColors.white,
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: const Text(
                            'Reprendre',
                            style: TextStyle(
                              color: MovaColors.green,
                              fontWeight: FontWeight.w600,
                              fontSize: 13,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          if (_activeDelivery != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Material(
                color: MovaColors.orange,
                borderRadius: BorderRadius.circular(14),
                child: InkWell(
                  borderRadius: BorderRadius.circular(14),
                  onTap: _resumeActiveDelivery,
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Row(
                      children: [
                        const Icon(Icons.local_shipping_outlined, color: MovaColors.white),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                'Livraison en cours',
                                style: TextStyle(
                                  color: MovaColors.white,
                                  fontWeight: FontWeight.bold,
                                  fontSize: 15,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                _activeDeliveryLabel(),
                                style: const TextStyle(color: MovaColors.white, fontSize: 13),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                          decoration: BoxDecoration(
                            color: MovaColors.white,
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: const Text(
                            'Reprendre',
                            style: TextStyle(
                              color: MovaColors.orange,
                              fontWeight: FontWeight.w600,
                              fontSize: 13,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          const SizedBox(height: 16),
          MovaWelcomeBanner(
            greeting: _welcomeGreeting(userLabel),
            subtitle: userLabel.isNotEmpty ? PassengerCopy.homeTagline : '',
          ),
          if (_publicites.isNotEmpty) ...[
            const SizedBox(height: 12),
            PubliciteCarousel(items: _publicites),
          ],
          const SizedBox(height: 12),
          const Align(alignment: Alignment.centerLeft, child: ServiceAreaSelector(compact: true)),
          const SizedBox(height: 20),
          LayoutBuilder(
            builder: (context, constraints) {
              const spacing = 12.0;
              final cardWidth = (constraints.maxWidth - spacing) / 2;
              final compactCards = cardWidth < 150;

              Widget gridRow(List<Widget> cards) {
                return IntrinsicHeight(
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      for (var i = 0; i < cards.length; i++) ...[
                        if (i > 0) const SizedBox(width: spacing),
                        Expanded(child: cards[i]),
                      ],
                    ],
                  ),
                );
              }

              return Column(
                children: [
                  gridRow([
                    ServiceCard(
                      icon: PassengerServiceIcon.taxi(size: compactCards ? 52 : 58),
                      brandedIcon: true,
                      iconColor: MovaColors.violet,
                      title: 'Taxi / Moto-taxi',
                      subtitle: 'Course immédiate partout en RDC',
                      onTap: () => _open(context, const BookingScreen()),
                      compact: compactCards,
                    ),
                    ServiceCard(
                      icon: PassengerServiceIcon.delivery(size: compactCards ? 52 : 58),
                      brandedIcon: true,
                      iconColor: MovaColors.green,
                      title: 'Livraisons',
                      subtitle: 'Repas, colis, express et plus',
                      onTap: () => _open(context, const DeliveryHubScreen()),
                      compact: compactCards,
                    ),
                  ]),
                  const SizedBox(height: spacing),
                  gridRow([
                    ServiceCard(
                      icon: PassengerServiceIcon.scheduled(size: compactCards ? 52 : 58),
                      brandedIcon: true,
                      iconColor: MovaColors.violet,
                      title: 'Réservation planifiée',
                      subtitle: 'Programmez votre trajet à l\'avance',
                      onTap: () => _open(context, const ScheduledRideScreen()),
                      compact: compactCards,
                    ),
                    ServiceCard(
                      icon: PassengerServiceIcon.carpool(size: compactCards ? 52 : 58),
                      brandedIcon: true,
                      iconColor: MovaColors.midnight,
                      title: 'Covoiturage',
                      subtitle: 'Partagez un trajet, économisez',
                      onTap: () => _open(context, const CarpoolScreen()),
                      compact: compactCards,
                    ),
                  ]),
                  const SizedBox(height: spacing),
                  gridRow([
                    ServiceCard(
                      icon: PassengerServiceIcon.rental(size: compactCards ? 52 : 58),
                      brandedIcon: true,
                      iconColor: MovaColors.violet,
                      title: 'Location véhicule',
                      subtitle: 'Voiture, SUV ou minibus',
                      onTap: () => _open(context, const RentalScreen()),
                      compact: compactCards,
                    ),
                    ServiceCard(
                      icon: PassengerServiceIcon.moving(size: compactCards ? 52 : 58),
                      brandedIcon: true,
                      iconColor: MovaColors.midnight,
                      title: 'Déménagement',
                      subtitle: 'Camion et manutention',
                      onTap: () => _open(context, const MovingScreen()),
                      compact: compactCards,
                    ),
                  ]),
                  const SizedBox(height: spacing),
                  gridRow([
                    ServiceCard(
                      icon: MovaServiceIcon.wallet(color: MovaColors.midnight),
                      iconColor: MovaColors.midnight,
                      title: 'Wallet SENGA',
                      subtitle: 'Solde, recharge et paiements',
                      onTap: () => _open(context, const WalletScreen()),
                      compact: compactCards,
                    ),
                    ServiceCard(
                      icon: MovaServiceIcon.history(color: MovaColors.orange),
                      iconColor: MovaColors.orange,
                      title: 'Historique',
                      subtitle: 'Vos courses et transactions',
                      onTap: () => _open(context, const HistoryScreen()),
                      compact: compactCards,
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

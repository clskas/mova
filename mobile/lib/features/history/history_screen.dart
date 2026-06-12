import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_client.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';

class HistoryScreen extends ConsumerStatefulWidget {
  const HistoryScreen({super.key});

  @override
  ConsumerState<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends ConsumerState<HistoryScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  List<dynamic> _rides = [];
  List<dynamic> _deliveries = [];
  List<dynamic> _scheduled = [];
  List<dynamic> _errands = [];
  bool _loading = true;
  bool _cached = false;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 5, vsync: this);
    _load();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final api = ref.read(apiClientProvider);
    await api.loadToken();
    await api.checkHealth();

    final ridesResult = await api.get('/rides/history?role=passenger');
    final deliveriesResult = await api.get('/deliveries/history');
    final scheduledResult = await api.get('/rides/scheduled');
    final errandsResult = await api.get('/deliveries/errand/history');

    setState(() {
      _loading = false;
      if (ridesResult case Success(:final data)) {
        _rides = data['data'] as List? ?? data['rides'] as List? ?? [];
        _cached = data['cached'] == true;
      }
      if (deliveriesResult case Success(:final data)) {
        _deliveries = data['data'] as List? ?? [];
      }
      if (scheduledResult case Success(:final data)) {
        _scheduled = data['data'] as List? ?? [];
      }
      if (errandsResult case Success(:final data)) {
        _errands = data['data'] as List? ?? [];
      }
    });
  }

  String _statusLabel(String? status) => switch (status) {
        'COMPLETED' => 'Terminé',
        'DELIVERED' => 'Livré',
        'CONFIRMED' => 'Confirmé',
        'IN_TRANSIT' => 'En transit',
        'CANCELLED' => 'Annulé',
        _ => status ?? '',
      };

  Widget _empty(String message) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 32),
        child: Center(
          child: Text(message, style: const TextStyle(color: MovaColors.textSecondary)),
        ),
      );

  Widget _rideTile(Map<String, dynamic> ride) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: MovaCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '${ride['pickupAddress'] ?? 'Départ'} → ${ride['dropoffAddress'] ?? 'Arrivée'}',
              style: const TextStyle(fontWeight: FontWeight.w600),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 4),
            Text(
              MarketConfig.formatCdf(ride['priceCdf'] as int? ?? 0),
              style: const TextStyle(color: MovaColors.violet),
            ),
            Text(
              _statusLabel(ride['status']?.toString()),
              style: const TextStyle(color: MovaColors.textSecondary, fontSize: 13),
            ),
          ],
        ),
      ),
    );
  }

  Widget _parcelTile(Map<String, dynamic> item) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: MovaCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Row(
              children: [
                Icon(Icons.inventory_2_outlined, size: 18, color: MovaColors.green),
                SizedBox(width: 6),
                Text('Colis', style: TextStyle(fontWeight: FontWeight.w600)),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              '${item['pickupAddress'] ?? 'Enlèvement'} → ${item['dropoffAddress'] ?? 'Livraison'}',
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 4),
            Text(
              MarketConfig.formatCdf(item['priceCdf'] as int? ?? 0),
              style: const TextStyle(color: MovaColors.violet),
            ),
            Text(
              _statusLabel(item['status']?.toString()),
              style: const TextStyle(color: MovaColors.textSecondary, fontSize: 13),
            ),
          ],
        ),
      ),
    );
  }

  Widget _foodTile(Map<String, dynamic> item) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: MovaCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Row(
              children: [
                Icon(Icons.restaurant_outlined, size: 18, color: MovaColors.green),
                SizedBox(width: 6),
                Text('Repas', style: TextStyle(fontWeight: FontWeight.w600)),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              item['restaurantName']?.toString() ?? 'Restaurant',
              style: const TextStyle(fontWeight: FontWeight.w600),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            Text(
              item['deliveryAddress']?.toString() ?? '',
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(color: MovaColors.textSecondary, fontSize: 13),
            ),
            const SizedBox(height: 4),
            Text(
              MarketConfig.formatCdf(item['priceCdf'] as int? ?? 0),
              style: const TextStyle(color: MovaColors.violet),
            ),
            Text(
              _statusLabel(item['status']?.toString()),
              style: const TextStyle(color: MovaColors.textSecondary, fontSize: 13),
            ),
          ],
        ),
      ),
    );
  }

  Widget _scheduledTile(Map<String, dynamic> ride) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: MovaCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Row(
              children: [
                Icon(Icons.event_available_outlined, size: 18, color: MovaColors.violet),
                SizedBox(width: 6),
                Text('Réservation', style: TextStyle(fontWeight: FontWeight.w600)),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              ride['dropoffAddress']?.toString() ?? 'Destination',
              style: const TextStyle(fontWeight: FontWeight.w600),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            Text(
              ride['scheduledAt']?.toString() ?? '',
              style: const TextStyle(color: MovaColors.textSecondary, fontSize: 13),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 4),
            Text(
              MarketConfig.formatCdf(ride['priceCdf'] as int? ?? 0),
              style: const TextStyle(color: MovaColors.violet),
            ),
            Text(
              _statusLabel(ride['status']?.toString()),
              style: const TextStyle(color: MovaColors.textSecondary, fontSize: 13),
            ),
          ],
        ),
      ),
    );
  }

  Widget _errandTile(Map<String, dynamic> item) {
    final items = item['items'] as List? ?? [];
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: MovaCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Row(
              children: [
                Icon(Icons.shopping_bag_outlined, size: 18, color: MovaColors.orange),
                SizedBox(width: 6),
                Text('Courses', style: TextStyle(fontWeight: FontWeight.w600)),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              item['deliveryAddress']?.toString() ?? '',
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            if (items.isNotEmpty)
              Text(
                items.map((e) => e.toString()).join(', '),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(color: MovaColors.textSecondary, fontSize: 13),
              ),
            const SizedBox(height: 4),
            Text(
              MarketConfig.formatCdf(item['priceCdf'] as int? ?? 0),
              style: const TextStyle(color: MovaColors.violet),
            ),
            Text(
              _statusLabel(item['status']?.toString()),
              style: const TextStyle(color: MovaColors.textSecondary, fontSize: 13),
            ),
          ],
        ),
      ),
    );
  }

  Widget _tabContent() {
    if (_loading) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 48),
        child: Center(child: CircularProgressIndicator()),
      );
    }

    final parcels = _deliveries.where((d) => (d as Map)['type'] == 'PARCEL').toList();
    final meals = _deliveries.where((d) => (d as Map)['type'] == 'FOOD').toList();

    return AnimatedBuilder(
      animation: _tabController,
      builder: (context, _) {
        switch (_tabController.index) {
          case 1:
            if (parcels.isEmpty) return _empty('Aucun colis');
            return Column(
              children: parcels.map((p) => _parcelTile(p as Map<String, dynamic>)).toList(),
            );
          case 2:
            if (meals.isEmpty) return _empty('Aucune commande repas');
            return Column(
              children: meals.map((m) => _foodTile(m as Map<String, dynamic>)).toList(),
            );
          case 3:
            if (_scheduled.isEmpty) return _empty('Aucune réservation');
            return Column(
              children: _scheduled.map((s) => _scheduledTile(s as Map<String, dynamic>)).toList(),
            );
          case 4:
            if (_errands.isEmpty) return _empty('Aucune course');
            return Column(
              children: _errands.map((e) => _errandTile(e as Map<String, dynamic>)).toList(),
            );
          default:
            if (_rides.isEmpty) return _empty('Aucun trajet');
            return Column(
              children: _rides.map((r) => _rideTile(r as Map<String, dynamic>)).toList(),
            );
        }
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return MovaScreen(
      title: 'Historique',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (_cached)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Text(
                'Données en cache (hors-ligne)',
                style: TextStyle(color: MovaColors.orange.withValues(alpha: 0.9)),
                textAlign: TextAlign.center,
              ),
            ),
          TabBar(
            controller: _tabController,
            isScrollable: true,
            onTap: (_) => setState(() {}),
            labelColor: MovaColors.violet,
            unselectedLabelColor: MovaColors.textSecondary,
            tabs: const [
              Tab(text: 'Trajets'),
              Tab(text: 'Colis'),
              Tab(text: 'Repas'),
              Tab(text: 'Réservations'),
              Tab(text: 'Courses'),
            ],
          ),
          const SizedBox(height: 12),
          _tabContent(),
        ],
      ),
    );
  }
}

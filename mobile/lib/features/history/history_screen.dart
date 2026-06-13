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
  List<dynamic> _history = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 4, vsync: this);
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

    final historyResult = await api.get('/history?limit=50');

    setState(() {
      _loading = false;
      if (historyResult case Success(:final data)) {
        _history = data['data'] as List? ?? [];
      }
    });
  }

  String _statusLabel(String? status) => switch (status) {
        'COMPLETED' => 'Terminé',
        'DELIVERED' => 'Livré',
        'CONFIRMED' => 'Confirmé',
        'SCHEDULED' => 'Planifié',
        'IN_TRANSIT' => 'En transit',
        'CANCELLED' => 'Annulé',
        'ACCEPTED' => 'Accepté',
        'IN_PROGRESS' => 'En cours',
        'PENDING' => 'En attente',
        _ => status ?? '',
      };

  Widget _rideTile(Map<String, dynamic> item) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: MovaCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Row(
              children: [
                Icon(Icons.local_taxi_outlined, size: 18, color: MovaColors.violet),
                SizedBox(width: 6),
                Text('Course taxi', style: TextStyle(fontWeight: FontWeight.w600)),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              item['title']?.toString() ?? '',
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

  Widget _unifiedTile(Map<String, dynamic> item) {
    final type = item['type']?.toString();
    final meta = item['meta'] as Map<String, dynamic>? ?? {};
    if (type == 'RIDE') return _rideTile(item);
    if (type == 'PARCEL' || type == 'EXPRESS') {
      return _parcelTile({
        ...meta,
        'pickupAddress': meta['pickupAddress'] ?? item['title'],
        'dropoffAddress': meta['dropoffAddress'] ?? '',
        'priceCdf': item['priceCdf'],
        'status': item['status'],
      });
    }
    if (type == 'FOOD') {
      return _foodTile({
        ...meta,
        'restaurantName': meta['restaurantName'] ?? item['title'],
        'deliveryAddress': meta['deliveryAddress'] ?? '',
        'priceCdf': item['priceCdf'],
        'status': item['status'],
      });
    }
    if (type == 'SCHEDULED') {
      return _scheduledTile({
        'dropoffAddress': item['title'],
        'scheduledAt': meta['scheduledAt'] ?? item['createdAt'],
        'priceCdf': item['priceCdf'],
        'status': item['status'],
      });
    }
    if (type == 'ERRAND') {
      return _errandTile({
        'deliveryAddress': item['title'],
        'items': meta['items'] ?? [],
        'priceCdf': item['priceCdf'],
        'status': item['status'],
      });
    }
    return _rideTile(item);
  }

  Widget _empty(String message) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 32),
        child: Center(
          child: Text(message, style: const TextStyle(color: MovaColors.textSecondary)),
        ),
      );

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

    final rides = _history.where((d) => (d as Map)['type'] == 'RIDE').toList();
    final errands = _history.where((d) => (d as Map)['type'] == 'ERRAND').toList();
    final parcels = _history.where((d) {
      final t = (d as Map)['type'];
      return t == 'PARCEL' || t == 'EXPRESS';
    }).toList();
    final meals = _history.where((d) => (d as Map)['type'] == 'FOOD').toList();
    final scheduled = _history.where((d) => (d as Map)['type'] == 'SCHEDULED').toList();

    return AnimatedBuilder(
      animation: _tabController,
      builder: (context, _) {
        switch (_tabController.index) {
          case 1:
            if (parcels.isEmpty) return _empty('Aucun colis');
            return Column(
              children: parcels.map((p) => _unifiedTile(p as Map<String, dynamic>)).toList(),
            );
          case 2:
            if (meals.isEmpty) return _empty('Aucune commande repas');
            return Column(
              children: meals.map((m) => _unifiedTile(m as Map<String, dynamic>)).toList(),
            );
          case 3:
            if (scheduled.isEmpty) return _empty('Aucune réservation');
            return Column(
              children: scheduled.map((s) => _unifiedTile(s as Map<String, dynamic>)).toList(),
            );
          default:
            final courses = [...rides, ...errands];
            if (courses.isEmpty) return _empty('Aucune course');
            return Column(
              children: courses.map((e) => _unifiedTile(e as Map<String, dynamic>)).toList(),
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
          TabBar(
            controller: _tabController,
            isScrollable: true,
            onTap: (_) => setState(() {}),
            labelColor: MovaColors.violet,
            unselectedLabelColor: MovaColors.textSecondary,
            tabs: const [
              Tab(text: 'Courses'),
              Tab(text: 'Colis'),
              Tab(text: 'Repas'),
              Tab(text: 'Réservations'),
            ],
          ),
          const SizedBox(height: 12),
          _tabContent(),
        ],
      ),
    );
  }
}

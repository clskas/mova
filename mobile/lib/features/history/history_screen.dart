import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_client.dart';
import '../../core/cache/unified_history_cache.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import '../delivery/food_delivery_screen.dart';
import '../delivery/parcel_delivery_screen.dart';
import '../booking/booking_screen.dart';
import '../rating/rating_screen.dart';
import '../../core/widgets/offline_shell.dart';
import 'history_detail_dialog.dart';
import '../billing/receipts_list_screen.dart';

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
  bool _fromCache = false;
  DateTime? _lastSync;

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
    final cached = await UnifiedHistoryCache.load();
    if (cached.data.isNotEmpty && mounted) {
      setState(() {
        _history = cached.data;
        _lastSync = cached.syncedAt;
        _fromCache = true;
        _loading = false;
      });
    }

    final api = ref.read(apiClientProvider);
    await api.loadToken();
    await api.checkHealth();

    final historyResult = await api.get('/history?limit=50');

    if (!mounted) return;
    setState(() {
      _loading = false;
      if (historyResult case Success(:final data)) {
        _history = data['data'] as List? ?? [];
        _fromCache = data['cached'] == true;
        final syncedRaw = data['syncedAt']?.toString();
        _lastSync = syncedRaw != null
            ? DateTime.tryParse(syncedRaw)
            : (_fromCache ? _lastSync : DateTime.now());
        if (!_fromCache) _lastSync = DateTime.now();
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
    final meta = item['meta'] as Map<String, dynamic>? ?? {};
    final status = item['status']?.toString() ?? '';
    final id = item['id']?.toString() ?? '';
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: MovaCard(
        onTap: () => showHistoryDetailDialog(context, ref, item),
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
              rideHistoryStatusLabel(item),
              style: const TextStyle(color: MovaColors.textSecondary, fontSize: 13),
            ),
            if (status == 'COMPLETED' && id.isNotEmpty) ...[
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  MovaButton(
                    label: 'Commander à nouveau',
                    isSecondary: true,
                    icon: Icons.replay,
                    onPressed: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => BookingScreen(
                            initialPickupAddress: meta['pickupAddress']?.toString(),
                            initialDropoffAddress: meta['dropoffAddress']?.toString(),
                            initialVehicleType: meta['vehicleType']?.toString(),
                          ),
                        ),
                      );
                    },
                  ),
                  MovaButton(
                    label: 'Noter le chauffeur',
                    isSecondary: true,
                    icon: Icons.star_outline,
                    onPressed: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(builder: (_) => RatingScreen(rideId: id)),
                      );
                    },
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _unifiedTile(Map<String, dynamic> item) {
    final type = item['type']?.toString();
    if (type == 'RIDE') return _rideTile(item);
    if (type == 'PARCEL' || type == 'EXPRESS') return _parcelTile(item);
    if (type == 'FOOD') return _foodTile(item);
    if (type == 'SCHEDULED') return _scheduledTile(item);
    if (type == 'MOVING') return _movingTile(item);
    if (type == 'ERRAND') return _errandTile(item);
    return _rideTile(item);
  }

  Widget _empty(String message) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 32),
        child: Center(
          child: Text(message, style: const TextStyle(color: MovaColors.textSecondary)),
        ),
      );

  Widget _parcelTile(Map<String, dynamic> item) {
    final meta = item['meta'] as Map<String, dynamic>? ?? {};
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: MovaCard(
        onTap: () => showHistoryDetailDialog(context, ref, item),
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
              item['title']?.toString() ??
                  '${meta['pickupAddress'] ?? 'Enlèvement'} → ${meta['dropoffAddress'] ?? 'Livraison'}',
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
            if ((item['status']?.toString() ?? '') == 'DELIVERED') ...[
              const SizedBox(height: 8),
              MovaButton(
                label: 'Commander à nouveau',
                isSecondary: true,
                icon: Icons.replay,
                onPressed: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => ParcelDeliveryScreen(
                        initialPickupAddress: meta['pickupAddress']?.toString(),
                        initialDropoffAddress: meta['dropoffAddress']?.toString(),
                        initialWeightCategory: meta['weightCategory']?.toString(),
                      ),
                    ),
                  );
                },
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _foodTile(Map<String, dynamic> item) {
    final meta = item['meta'] as Map<String, dynamic>? ?? {};
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: MovaCard(
        onTap: () => showHistoryDetailDialog(context, ref, item),
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
              meta['restaurantName']?.toString() ?? item['title']?.toString() ?? 'Restaurant',
              style: const TextStyle(fontWeight: FontWeight.w600),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            Text(
              meta['deliveryAddress']?.toString() ?? '',
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
            if ((item['status']?.toString() ?? '') == 'DELIVERED') ...[
              const SizedBox(height: 8),
              MovaButton(
                label: 'Commander à nouveau',
                isSecondary: true,
                icon: Icons.replay,
                onPressed: () {
                  final items = (meta['items'] as List?)?.cast<Map<String, dynamic>>() ?? [];
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => FoodDeliveryScreen(
                        initialRestaurantId: meta['restaurantId']?.toString(),
                        initialItems: items,
                        initialDeliveryAddress: meta['deliveryAddress']?.toString(),
                      ),
                    ),
                  );
                },
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _scheduledTile(Map<String, dynamic> item) {
    final meta = item['meta'] as Map<String, dynamic>? ?? {};
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: MovaCard(
        onTap: () => showHistoryDetailDialog(context, ref, item),
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
              item['title']?.toString() ?? 'Destination',
              style: const TextStyle(fontWeight: FontWeight.w600),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            Text(
              meta['scheduledAt']?.toString() ?? item['createdAt']?.toString() ?? '',
              style: const TextStyle(color: MovaColors.textSecondary, fontSize: 13),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 4),
            Text(
              MarketConfig.formatCdf(item['priceCdf'] as int? ?? 0),
              style: const TextStyle(color: MovaColors.violet),
            ),
            Text(
              historyStatusLabel(item['status']?.toString()),
              style: const TextStyle(color: MovaColors.textSecondary, fontSize: 13),
            ),
          ],
        ),
      ),
    );
  }

  Widget _movingTile(Map<String, dynamic> item) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: MovaCard(
        onTap: () => showHistoryDetailDialog(context, ref, item),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Row(
              children: [
                Icon(Icons.local_shipping_outlined, size: 18, color: MovaColors.midnight),
                SizedBox(width: 6),
                Text('Déménagement', style: TextStyle(fontWeight: FontWeight.w600)),
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
              historyStatusLabel(item['status']?.toString()),
              style: const TextStyle(color: MovaColors.textSecondary, fontSize: 13),
            ),
          ],
        ),
      ),
    );
  }

  Widget _errandTile(Map<String, dynamic> item) {
    final meta = item['meta'] as Map<String, dynamic>? ?? {};
    final items = meta['items'] as List? ?? [];
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: MovaCard(
        onTap: () => showHistoryDetailDialog(context, ref, item),
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
              item['title']?.toString() ?? '',
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
    final movings = _history.where((d) => (d as Map)['type'] == 'MOVING').toList();
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
            final courses = [...rides, ...errands, ...movings];
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
      actions: [
        IconButton(
          tooltip: 'Mes reçus',
          icon: const Icon(Icons.receipt_long_outlined),
          onPressed: () => Navigator.push(
            context,
            MaterialPageRoute(builder: (_) => const ReceiptsListScreen()),
          ),
        ),
      ],
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
          if (_lastSync != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text(
                formatLastSync(_lastSync),
                style: TextStyle(
                  color: _fromCache ? MovaColors.orange : MovaColors.textSecondary,
                  fontSize: 12,
                ),
              ),
            ),
          _tabContent(),
        ],
      ),
    );
  }
}

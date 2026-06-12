import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_client.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import 'food_tracking_screen.dart';

class FoodDeliveryScreen extends ConsumerStatefulWidget {
  const FoodDeliveryScreen({super.key});

  @override
  ConsumerState<FoodDeliveryScreen> createState() => _FoodDeliveryScreenState();
}

class _FoodDeliveryScreenState extends ConsumerState<FoodDeliveryScreen> {
  List<Map<String, dynamic>> _restaurants = [];
  Map<String, dynamic>? _selectedRestaurant;
  final Map<String, int> _cart = {};
  final _addressController = TextEditingController(text: 'Ma position, Kinshasa');
  bool _loading = true;
  bool _ordering = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadRestaurants();
  }

  @override
  void dispose() {
    _addressController.dispose();
    super.dispose();
  }

  Future<void> _loadRestaurants() async {
    final api = ref.read(apiClientProvider);
    await api.loadToken();
    await api.checkHealth();
    final result = await api.get('/deliveries/restaurants');
    setState(() {
      _loading = false;
      switch (result) {
        case Success(:final data):
          _restaurants = (data['data'] as List? ?? [])
              .cast<Map<String, dynamic>>();
        case Failure(:final error):
          _error = error.message;
      }
    });
  }

  int get _cartTotal {
    if (_selectedRestaurant == null) return 0;
    final items = _selectedRestaurant!['items'] as List? ?? [];
    var total = 0;
    for (final entry in _cart.entries) {
      final item = items.cast<Map<String, dynamic>>().firstWhere(
            (i) => i['id'] == entry.key,
            orElse: () => {},
          );
      total += (item['priceCdf'] as int? ?? 0) * entry.value;
    }
    return total;
  }

  int get _deliveryFee =>
      _selectedRestaurant?['deliveryMinCdf'] as int? ?? 3500;

  List<Map<String, dynamic>> _cartItems() {
    if (_selectedRestaurant == null) return [];
    final items = _selectedRestaurant!['items'] as List? ?? [];
    return _cart.entries.map((e) {
      final item = items.cast<Map<String, dynamic>>().firstWhere(
            (i) => i['id'] == e.key,
          );
      return {
        'id': e.key,
        'name': item['name'],
        'priceCdf': item['priceCdf'],
        'quantity': e.value,
      };
    }).toList();
  }

  Future<void> _order() async {
    if (_cart.isEmpty || _addressController.text.trim().isEmpty) return;
    setState(() {
      _ordering = true;
      _error = null;
    });
    final api = ref.read(apiClientProvider);
    final result = await api.post('/deliveries/food', {
      'restaurantId': _selectedRestaurant!['id'],
      'restaurantName': _selectedRestaurant!['name'],
      'deliveryAddress': _addressController.text.trim(),
      'items': _cartItems(),
    });
    setState(() => _ordering = false);
    switch (result) {
      case Success(:final data):
        if (mounted) {
          final order = data['order'] as Map<String, dynamic>?;
          Navigator.pushReplacement(
            context,
            MaterialPageRoute(
              builder: (_) => FoodTrackingScreen(
                orderId: order?['id']?.toString() ?? '',
                restaurantName: _selectedRestaurant!['name']?.toString() ?? '',
                totalCdf: order?['priceCdf'] as int? ?? _cartTotal + _deliveryFee,
                deliveryAddress: _addressController.text.trim(),
              ),
            ),
          );
        }
      case Failure(:final error):
        setState(() => _error = error.message);
    }
  }

  Widget _buildRestaurantList() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Restaurants à proximité',
          style: Theme.of(context).textTheme.titleSmall,
        ),
        const SizedBox(height: 12),
        ..._restaurants.map((r) {
          return Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: MovaCard(
              onTap: () => setState(() {
                _selectedRestaurant = r;
                _cart.clear();
              }),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: MovaColors.green.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Icon(Icons.restaurant, color: MovaColors.green),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          r['name']?.toString() ?? '',
                          style: const TextStyle(fontWeight: FontWeight.w600),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        Text(
                          '${r['cuisine']} · ⭐ ${r['rating']}',
                          style: const TextStyle(
                            color: MovaColors.textSecondary,
                            fontSize: 13,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        Text(
                          'Livraison dès ${MarketConfig.formatCdf(r['deliveryMinCdf'] as int? ?? 3500)}',
                          style: const TextStyle(
                            color: MovaColors.violet,
                            fontSize: 12,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const Icon(Icons.chevron_right),
                ],
              ),
            ),
          );
        }),
      ],
    );
  }

  Widget _buildMenu() {
    final restaurant = _selectedRestaurant!;
    final items = (restaurant['items'] as List? ?? []).cast<Map<String, dynamic>>();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            IconButton(
              icon: const Icon(Icons.arrow_back),
              onPressed: () => setState(() {
                _selectedRestaurant = null;
                _cart.clear();
              }),
            ),
            Expanded(
              child: Text(
                restaurant['name']?.toString() ?? '',
                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        ...items.map((item) {
          final id = item['id'] as String;
          final qty = _cart[id] ?? 0;
          return Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: MovaCard(
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          item['name']?.toString() ?? '',
                          style: const TextStyle(fontWeight: FontWeight.w600),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                        Text(
                          MarketConfig.formatCdf(item['priceCdf'] as int? ?? 0),
                          style: const TextStyle(color: MovaColors.violet),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.remove_circle_outline),
                    onPressed: qty > 0
                        ? () => setState(() {
                              if (qty <= 1) {
                                _cart.remove(id);
                              } else {
                                _cart[id] = qty - 1;
                              }
                            })
                        : null,
                  ),
                  Text('$qty', style: const TextStyle(fontWeight: FontWeight.bold)),
                  IconButton(
                    icon: const Icon(Icons.add_circle_outline),
                    onPressed: () => setState(() => _cart[id] = qty + 1),
                  ),
                ],
              ),
            ),
          );
        }),
        if (_cart.isNotEmpty) ...[
          const SizedBox(height: 16),
          TextField(
            controller: _addressController,
            decoration: const InputDecoration(
              labelText: 'Adresse de livraison',
              prefixIcon: Icon(Icons.delivery_dining),
            ),
          ),
          const SizedBox(height: 12),
          MovaCard(
            child: Column(
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('Sous-total'),
                    Text(MarketConfig.formatCdf(_cartTotal)),
                  ],
                ),
                const SizedBox(height: 4),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('Livraison'),
                    Text(MarketConfig.formatCdf(_deliveryFee)),
                  ],
                ),
                const Divider(height: 16),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('Total', style: TextStyle(fontWeight: FontWeight.bold)),
                    Text(
                      MarketConfig.formatCdf(_cartTotal + _deliveryFee),
                      style: const TextStyle(
                        fontWeight: FontWeight.bold,
                        color: MovaColors.green,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          MovaButton(
            label: 'Commander',
            isLoading: _ordering,
            icon: Icons.shopping_bag_outlined,
            onPressed: _order,
          ),
        ],
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return MovaScreen(
      title: 'Livraison repas',
      child: _loading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (_error != null) ...[
                  MovaErrorBanner(message: _error!, onRetry: _loadRestaurants),
                  const SizedBox(height: 16),
                ],
                if (_selectedRestaurant == null)
                  _buildRestaurantList()
                else
                  _buildMenu(),
              ],
            ),
    );
  }
}

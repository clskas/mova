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
  final _addressController = TextEditingController(text: 'Ma position');
  bool _loading = true;
  bool _ordering = false;
  int? _estimatedTotal;
  String? _error;
  String? _validationError;

  static const _deliveryLat = MarketConfig.defaultLat;
  static const _deliveryLng = MarketConfig.defaultLng;

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

  List<Map<String, dynamic>> _menuItems(Map<String, dynamic> restaurant) {
    return (restaurant['menuItems'] as List? ?? restaurant['items'] as List? ?? [])
        .cast<Map<String, dynamic>>();
  }

  String _itemKey(Map<String, dynamic> item) => item['name']?.toString() ?? '';

  int _itemPrice(Map<String, dynamic> item) =>
      item['unitPriceCdf'] as int? ?? item['priceCdf'] as int? ?? 0;

  Future<void> _loadRestaurants() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final api = ref.read(apiClientProvider);
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

  int get _cartSubtotal {
    if (_selectedRestaurant == null) return 0;
    final items = _menuItems(_selectedRestaurant!);
    var total = 0;
    for (final entry in _cart.entries) {
      final item = items.firstWhere(
        (i) => _itemKey(i) == entry.key,
        orElse: () => {},
      );
      total += _itemPrice(item) * entry.value;
    }
    return total;
  }

  List<Map<String, dynamic>> _cartItemsForApi() {
    if (_selectedRestaurant == null) return [];
    final items = _menuItems(_selectedRestaurant!);
    return _cart.entries.map((e) {
      final item = items.firstWhere((i) => _itemKey(i) == e.key);
      return {
        'name': _itemKey(item),
        'quantity': e.value,
        'unitPriceCdf': _itemPrice(item),
      };
    }).toList();
  }

  Map<String, dynamic> _orderPayload() => {
        'restaurantId': _selectedRestaurant!['id'],
        'deliveryAddress': _addressController.text.trim(),
        'deliveryLat': _deliveryLat,
        'deliveryLng': _deliveryLng,
        'items': _cartItemsForApi(),
      };

  Future<void> _estimateOrder() async {
    if (_cart.isEmpty) {
      setState(() => _validationError = 'Ajoutez au moins un plat au panier.');
      return;
    }
    if (_addressController.text.trim().isEmpty) {
      setState(() => _validationError = 'Indiquez l\'adresse de livraison.');
      return;
    }
    setState(() {
      _ordering = true;
      _error = null;
      _validationError = null;
    });
    final api = ref.read(apiClientProvider);
    final result = await api.post('/deliveries/food/estimate', _orderPayload());
    setState(() {
      _ordering = false;
      switch (result) {
        case Success(:final data):
          _estimatedTotal = data['estimatedPriceCdf'] as int?;
        case Failure(:final error):
          _error = error.message;
      }
    });
  }

  Future<void> _order() async {
    if (_cart.isEmpty) {
      setState(() => _validationError = 'Ajoutez au moins un plat au panier.');
      return;
    }
    if (_addressController.text.trim().isEmpty) {
      setState(() => _validationError = 'Indiquez l\'adresse de livraison.');
      return;
    }
    setState(() {
      _ordering = true;
      _error = null;
      _validationError = null;
    });
    final api = ref.read(apiClientProvider);
    final result = await api.post('/deliveries/food', _orderPayload());
    setState(() => _ordering = false);
    switch (result) {
      case Success(:final data):
        if (mounted) {
          final delivery = data['delivery'] as Map<String, dynamic>? ??
              data['order'] as Map<String, dynamic>?;
          final total = delivery?['estimatedPriceCdf'] as int? ??
              _estimatedTotal ??
              _cartSubtotal + 3500;
          Navigator.pushReplacement(
            context,
            MaterialPageRoute(
              builder: (_) => FoodTrackingScreen(
                orderId: delivery?['id']?.toString() ?? '',
                restaurantName: _selectedRestaurant!['name']?.toString() ?? '',
                totalCdf: total,
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
    if (_restaurants.isEmpty) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 24),
        child: Text(
          'Aucun restaurant disponible pour le moment.',
          style: TextStyle(color: MovaColors.textSecondary),
          textAlign: TextAlign.center,
        ),
      );
    }

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
                _estimatedTotal = null;
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
                        if (r['address'] != null)
                          Text(
                            r['address']?.toString() ?? '',
                            style: const TextStyle(
                              color: MovaColors.textSecondary,
                              fontSize: 12,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
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
    final items = _menuItems(restaurant);

    if (items.isEmpty) {
      return const Text(
        'Menu indisponible pour ce restaurant.',
        style: TextStyle(color: MovaColors.textSecondary),
      );
    }

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
                _estimatedTotal = null;
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
          final key = _itemKey(item);
          final qty = _cart[key] ?? 0;
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
                          key,
                          style: const TextStyle(fontWeight: FontWeight.w600),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                        Text(
                          MarketConfig.formatCdf(_itemPrice(item)),
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
                                _cart.remove(key);
                              } else {
                                _cart[key] = qty - 1;
                              }
                              _estimatedTotal = null;
                            })
                        : null,
                  ),
                  Text('$qty', style: const TextStyle(fontWeight: FontWeight.bold)),
                  IconButton(
                    icon: const Icon(Icons.add_circle_outline),
                    onPressed: () => setState(() {
                      _cart[key] = qty + 1;
                      _estimatedTotal = null;
                    }),
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
            onChanged: (_) => setState(() => _estimatedTotal = null),
          ),
          const SizedBox(height: 12),
          MovaCard(
            child: Column(
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('Sous-total'),
                    Text(MarketConfig.formatCdf(_cartSubtotal)),
                  ],
                ),
                if (_estimatedTotal != null) ...[
                  const Divider(height: 16),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('Total estimé', style: TextStyle(fontWeight: FontWeight.bold)),
                      Text(
                        MarketConfig.formatCdf(_estimatedTotal!),
                        style: const TextStyle(
                          fontWeight: FontWeight.bold,
                          color: MovaColors.green,
                        ),
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),
          if (_validationError != null) ...[
            const SizedBox(height: 12),
            MovaErrorBanner(message: _validationError!),
          ],
          if (_error != null) ...[
            const SizedBox(height: 12),
            MovaErrorBanner(message: _error!, onRetry: _estimateOrder),
          ],
          const SizedBox(height: 12),
          if (_estimatedTotal == null)
            MovaButton(
              label: 'Estimer la commande',
              isLoading: _ordering,
              icon: Icons.calculate_outlined,
              onPressed: _estimateOrder,
            )
          else
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
                if (_error != null && _selectedRestaurant == null) ...[
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

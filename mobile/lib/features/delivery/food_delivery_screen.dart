import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_client.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/geo/geo_utils.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import 'food_tracking_screen.dart';

class FoodDeliveryScreen extends ConsumerStatefulWidget {
  const FoodDeliveryScreen({
    super.key,
    this.initialRestaurantId,
    this.initialItems,
    this.initialDeliveryAddress,
  });

  final String? initialRestaurantId;
  final List<Map<String, dynamic>>? initialItems;
  final String? initialDeliveryAddress;

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
    if (widget.initialDeliveryAddress != null) {
      _addressController.text = widget.initialDeliveryAddress!;
    }
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
    final result = await api.get(
      '/deliveries/restaurants?deliveryLat=$_deliveryLat&deliveryLng=$_deliveryLng',
    );
    setState(() {
      _loading = false;
      switch (result) {
        case Success(:final data):
          _restaurants = (data['data'] as List? ?? [])
              .cast<Map<String, dynamic>>();
          _applyInitialReorder();
        case Failure(:final error):
          _error = error.message;
      }
    });
  }

  void _applyInitialReorder() {
    if (widget.initialRestaurantId == null) return;
    final restaurant = _restaurants.cast<Map<String, dynamic>?>().firstWhere(
          (r) => r?['id']?.toString() == widget.initialRestaurantId,
          orElse: () => null,
        );
    if (restaurant == null) return;
    _selectedRestaurant = restaurant;
    _cart.clear();
    for (final item in widget.initialItems ?? []) {
      final name = item['name']?.toString();
      final qty = item['quantity'] as int? ?? 1;
      if (name != null && name.isNotEmpty) _cart[name] = qty;
    }
  }

  int _deliveryEtaMin(Map<String, dynamic> restaurant) {
    final apiEta = (restaurant['deliveryEtaMin'] as num?)?.toInt();
    if (apiEta != null && apiEta > 0) return apiEta;
    final lat = (restaurant['lat'] as num?)?.toDouble();
    final lng = (restaurant['lng'] as num?)?.toDouble();
    if (lat == null || lng == null) return 35;
    return GeoUtils.driverEtaMinutes(lat, lng, _deliveryLat, _deliveryLng) + 15;
  }

  Widget _restaurantPlaceholder() {
    return Container(
      width: 72,
      height: 72,
      color: MovaColors.green.withValues(alpha: 0.12),
      child: const Icon(Icons.restaurant, color: MovaColors.green),
    );
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
                  ClipRRect(
                    borderRadius: BorderRadius.circular(12),
                    child: r['imageUrl'] != null
                        ? Image.network(
                            r['imageUrl'].toString(),
                            width: 72,
                            height: 72,
                            fit: BoxFit.cover,
                            errorBuilder: (_, __, ___) => _restaurantPlaceholder(),
                          )
                        : _restaurantPlaceholder(),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          r['name']?.toString() ?? '',
                          style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        Row(
                          children: [
                            const Icon(Icons.star, color: Colors.amber, size: 14),
                            const SizedBox(width: 4),
                            Text(
                              '${r['rating']}',
                              style: const TextStyle(fontSize: 13),
                            ),
                            const SizedBox(width: 8),
                            const Icon(Icons.schedule, size: 14, color: MovaColors.textSecondary),
                            const SizedBox(width: 4),
                            Text(
                              'Livraison ~${_deliveryEtaMin(r)} min',
                              style: const TextStyle(
                                color: MovaColors.violet,
                                fontSize: 13,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ],
                        ),
                        Text(
                          r['cuisine']?.toString() ?? '',
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

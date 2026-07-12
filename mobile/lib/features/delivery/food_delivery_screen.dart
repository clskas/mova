import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:latlong2/latlong.dart';
import '../../core/api/api_client.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/geo/geo_utils.dart';
import '../../core/location/location_service.dart';
import '../../core/location/service_area_location.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/location/service_area_prefs.dart';
import '../../core/location/service_areas.dart';
import '../../core/widgets/destination_coord_panel.dart';
import '../../core/widgets/geo_autocomplete_field.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import '../../core/widgets/service_area_selector.dart';
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
  final _promoController = TextEditingController();
  String _filterCuisine = '';
  double _filterMaxEta = 0; // 0 = pas de filtre
  double _filterMaxPrice = 0;
  double _filterMaxDistance = 0;
  bool _loading = true;
  // Rafraîchissement léger (changement de filtre) : on garde le panneau à l'écran
  // et on affiche seulement un indicateur discret, sans recharger toute la page.
  bool _refreshing = false;
  bool _ordering = false;
  int? _estimatedTotal;
  int? _estimatedDeliveryFee;
  int? _estimatedDiscount;
  String? _error;
  String? _validationError;
  String _searchQuery = '';
  bool _loadingGps = false;
  bool _addressCoordsResolved = false;
  String _deliveryCityId = 'kinshasa';
  double _deliveryLat = ServiceAreas.byId('kinshasa')!.center.latitude;
  double _deliveryLng = ServiceAreas.byId('kinshasa')!.center.longitude;

  String get _deliveryCityName =>
      ServiceAreas.byId(_deliveryCityId)?.name ?? ServiceAreas.fallbackArea.name;

  @override
  void initState() {
    super.initState();
    if (widget.initialDeliveryAddress != null) {
      _addressController.text = widget.initialDeliveryAddress!;
    }
    WidgetsBinding.instance.addPostFrameCallback((_) => _bootstrapDeliveryLocation());
  }

  void _onAddressUserInput() {
    setState(() {
      _estimatedTotal = null;
      _estimatedDeliveryFee = null;
      _estimatedDiscount = null;
      _addressCoordsResolved = false;
    });
  }

  void _onAddressSuggestionSelected(Map<String, dynamic> suggestion) {
    final label = suggestion['label']?.toString() ?? suggestion['address']?.toString() ?? '';
    _addressController.text = label;
    final coords = ServiceAreaLocation.ensureInServiceArea(
      LatLng(
        (suggestion['lat'] as num?)?.toDouble() ?? _deliveryLat,
        (suggestion['lng'] as num?)?.toDouble() ?? _deliveryLng,
      ),
      address: label,
    );
    final detected = ServiceAreas.byCoords(coords) ?? ServiceAreas.nearest(coords);
    setState(() {
      _deliveryCityId = detected.id;
      _deliveryLat = coords.latitude;
      _deliveryLng = coords.longitude;
      _addressCoordsResolved = true;
      _estimatedTotal = null;
      _estimatedDeliveryFee = null;
      _estimatedDiscount = null;
    });
    _syncCityPreference(detected.id);
    _loadRestaurants(background: true);
  }

  Future<void> _bootstrapDeliveryLocation() async {
    final area = ref.read(selectedServiceAreaProvider);
    _applyDeliveryCity(area, updateAddress: false, reload: false);
    await _loadRestaurants();
    await _resolveDeliveryCoords(reloadAfter: true);
  }

  void _applyDeliveryCity(ServiceArea area, {bool updateAddress = true, bool reload = true}) {
    setState(() {
      _deliveryCityId = area.id;
      _deliveryLat = area.center.latitude;
      _deliveryLng = area.center.longitude;
      if (updateAddress &&
          (_addressController.text.trim().isEmpty ||
              _addressController.text.trim() == 'Ma position')) {
        _addressController.text = 'Centre-ville, ${area.name}';
      }
      _estimatedTotal = null;
      _estimatedDeliveryFee = null;
      _estimatedDiscount = null;
    });
    if (reload) {
      _loadRestaurants(background: _restaurants.isNotEmpty);
    }
  }

  Future<void> _syncCityPreference(String areaId) async {
    final prefs = await ref.read(serviceAreaPrefsProvider.future);
    if (prefs.selectedAreaId == areaId) return;
    await prefs.setSelectedAreaId(areaId);
    ref.invalidate(serviceAreaPrefsProvider);
  }

  List<Map<String, dynamic>> _parseRestaurants(Map<String, dynamic> data) {
    final raw = data['data'] ?? data['restaurants'];
    if (raw is List) {
      return raw.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
    }
    return [];
  }

  Future<void> _useMyLocationForDelivery() async {
    setState(() {
      _loadingGps = true;
      _validationError = null;
    });
    final result = await LocationService.getCurrentLocation();
    if (!mounted) return;
    if (result == null) {
      setState(() {
        _loadingGps = false;
        _validationError =
            'Impossible d\'obtenir votre position. Activez le GPS et autorisez la localisation.';
      });
      return;
    }
    final coords = ServiceAreaLocation.ensureInServiceArea(
      result.position,
      address: result.label,
    );
    final detected = ServiceAreas.byCoords(coords) ?? ServiceAreas.nearest(coords);
    setState(() {
      _loadingGps = false;
      _deliveryCityId = detected.id;
      _deliveryLat = coords.latitude;
      _deliveryLng = coords.longitude;
      _addressController.text = ServiceAreaLocation.isInBounds(result.position)
          ? result.label
          : LocationService.coordsLabel(coords);
      _estimatedTotal = null;
      _estimatedDeliveryFee = null;
      _estimatedDiscount = null;
      _addressCoordsResolved = true;
    });
    await _syncCityPreference(detected.id);
    await _loadRestaurants(background: true);
  }

  Widget _buildDeliveryAddressField() {
    final api = ref.read(apiClientProvider);
    return GeoAutocompleteField(
      controller: _addressController,
      api: api,
      city: _deliveryCityName,
      label: 'Adresse de livraison',
      hint: 'Ex: Gombe, Bandal, Limete…',
      prefixIcon: Icons.delivery_dining,
      textInputAction: TextInputAction.done,
      onUserInput: _onAddressUserInput,
      onSelected: _onAddressSuggestionSelected,
      suffixIcon: IconButton(
        icon: const Icon(Icons.gps_fixed, color: MovaColors.violet),
        tooltip: 'Ma position',
        onPressed: _loadingGps ? null : _useMyLocationForDelivery,
      ),
    );
  }

  Future<void> _resolveDeliveryCoords({bool reloadAfter = false}) async {
    final result = await LocationService.getCurrentLocation();
    if (!mounted) return;
    if (result != null) {
      final coords = ServiceAreaLocation.ensureInServiceArea(
        result.position,
        address: result.label,
      );
      final detected = ServiceAreas.byCoords(coords) ?? ServiceAreas.nearest(coords);
      setState(() {
        _deliveryCityId = detected.id;
        _deliveryLat = coords.latitude;
        _deliveryLng = coords.longitude;
        if (_addressController.text.trim().isEmpty ||
            _addressController.text.trim() == 'Ma position') {
          _addressController.text = ServiceAreaLocation.isInBounds(result.position)
              ? result.label
              : LocationService.coordsLabel(coords);
        }
      });
      await _syncCityPreference(detected.id);
      if (reloadAfter) await _loadRestaurants();
    }
  }

  Future<String?> _resolveDeliveryAddress() async {
    if (_addressCoordsResolved) return null;
    final text = _addressController.text.trim();
    if (text.isEmpty) return 'Indiquez l\'adresse de livraison.';
    if (text == 'Ma position') {
      await _resolveDeliveryCoords(reloadAfter: true);
      return null;
    }
    final api = ref.read(apiClientProvider);
    final result = await api.geoAutocomplete(text, city: _deliveryCityName);
    if (result case Success(:final data) when data.isNotEmpty) {
      _onAddressSuggestionSelected(data.first);
      return null;
    }
    return 'Lieu non reconnu — choisissez une suggestion (ex. Gombe, Limete) ou utilisez le GPS.';
  }

  void _setDeliveryFromCoords(LatLng coords, String label) {
    final safe = ServiceAreaLocation.ensureInServiceArea(coords, address: label);
    setState(() {
      _deliveryLat = safe.latitude;
      _deliveryLng = safe.longitude;
      _addressCoordsResolved = true;
      if (_addressController.text.trim().isEmpty || _addressController.text == 'Ma position') {
        _addressController.text = label;
      }
      _estimatedTotal = null;
      _estimatedDeliveryFee = null;
      _estimatedDiscount = null;
    });
    _loadRestaurants(background: true);
  }

  @override
  void dispose() {
    _addressController.dispose();
    _promoController.dispose();
    super.dispose();
  }

  List<Map<String, dynamic>> _menuItems(Map<String, dynamic> restaurant) {
    return (restaurant['menuItems'] as List? ?? restaurant['items'] as List? ?? restaurant['menu'] as List? ?? [])
        .cast<Map<String, dynamic>>()
        .where((item) => item['isAvailable'] != false)
        .toList();
  }

  String? _itemImageUrl(Map<String, dynamic> item) {
    final raw = item['imageUrl']?.toString();
    if (raw == null || raw.isEmpty) return null;
    return MarketConfig.resolveMediaUrl(raw);
  }

  String _cartKey(String restaurantId, String itemName, {String? size, List<String>? options}) {
    final s = (size ?? '').trim();
    final opts = (options ?? const []).map((o) => o.trim()).where((o) => o.isNotEmpty).toList()..sort();
    return '$restaurantId|$itemName|$s|${opts.join(",")}';
  }

  ({String restaurantId, String itemName, String? size, List<String> options}) _parseCartKey(String key) {
    final parts = key.split('|');
    final restaurantId = parts.isNotEmpty ? parts[0] : '';
    final itemName = parts.length > 1 ? parts[1] : '';
    final size = parts.length > 2 && parts[2].trim().isNotEmpty ? parts[2].trim() : null;
    final options = parts.length > 3 && parts[3].trim().isNotEmpty
        ? parts[3].split(',').map((s) => s.trim()).where((s) => s.isNotEmpty).toList()
        : <String>[];
    return (restaurantId: restaurantId, itemName: itemName, size: size, options: options);
  }

  String _itemKey(Map<String, dynamic> item) => item['name']?.toString() ?? '';

  int _itemPrice(Map<String, dynamic> item) =>
      item['unitPriceCdf'] as int? ?? item['priceCdf'] as int? ?? 0;

  /// Prix unitaire effectif d'un plat, suppléments compris — reproduit exactement
  /// la logique serveur (`computeFoodItemUnitPriceCdf`) : une taille sélectionnée
  /// remplace le prix de base, chaque option ajoute son supplément.
  int _effectiveUnitPrice(
    Map<String, dynamic> item, {
    String? size,
    List<String> options = const [],
  }) {
    var total = _itemPrice(item);

    if (size != null && size.trim().isNotEmpty) {
      final sizes = (item['sizes'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
      for (final s in sizes) {
        final label = (s['label'] ?? s['name'])?.toString();
        if (label == size) {
          final sPrice = (s['priceCdf'] ?? s['unitPriceCdf']) as int?;
          if (sPrice != null && sPrice > 0) total = sPrice;
          break;
        }
      }
    }

    if (options.isNotEmpty) {
      final opts = (item['options'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
      for (final selected in options) {
        for (final o in opts) {
          final label = (o['label'] ?? o['name'])?.toString();
          if (label == selected) {
            total += (o['priceCdf'] ?? o['unitPriceCdf'] ?? 0) as int;
            break;
          }
        }
      }
    }
    return total < 0 ? 0 : total;
  }

  int _itemQtyInCart(String restaurantId, String itemName) {
    return _cart.entries
        .where((e) => e.key.startsWith('$restaurantId|$itemName|'))
        .fold<int>(0, (sum, e) => sum + e.value);
  }

  void _removeOneFromCart(String restaurantId, String itemName) {
    final keys = _cart.keys.where((k) => k.startsWith('$restaurantId|$itemName|')).toList();
    if (keys.isEmpty) return;
    final k = keys.last;
    final current = _cart[k] ?? 0;
    if (current <= 1) {
      _cart.remove(k);
    } else {
      _cart[k] = current - 1;
    }
    _estimatedTotal = null;
  }

  Future<void> _promptAndAddToCart(Map<String, dynamic> item, String restaurantId) async {
    final name = _itemKey(item);
    final baseKey = _cartKey(restaurantId, name);
    final sizes = (item['sizes'] as List?)?.cast<Map<String, dynamic>>();
    final options = (item['options'] as List?)?.cast<Map<String, dynamic>>();

    if ((sizes != null && sizes.isNotEmpty) || (options != null && options.isNotEmpty)) {
      String? selectedSize;
      final selectedOptions = <String>{};
      final ok = await showModalBottomSheet<bool>(
        context: context,
        isScrollControlled: true,
        builder: (ctx) {
          return StatefulBuilder(
            builder: (ctx, setStateSheet) {
              return Padding(
                padding: EdgeInsets.only(
                  left: 16,
                  right: 16,
                  top: 16,
                  bottom: MediaQuery.of(ctx).viewInsets.bottom + 16,
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(name, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                    const SizedBox(height: 12),
                    if (sizes != null && sizes.isNotEmpty) ...[
                      const Text('Taille', style: TextStyle(fontWeight: FontWeight.w600)),
                      const SizedBox(height: 6),
                      Wrap(
                        spacing: 8,
                        children: sizes.map((s) {
                          final label = (s['label'] ?? s['name'])?.toString() ?? '';
                          return ChoiceChip(
                            label: Text(label),
                            selected: selectedSize == label,
                            onSelected: (_) => setStateSheet(() => selectedSize = label),
                          );
                        }).toList(),
                      ),
                      const SizedBox(height: 12),
                    ],
                    if (options != null && options.isNotEmpty) ...[
                      const Text('Options', style: TextStyle(fontWeight: FontWeight.w600)),
                      const SizedBox(height: 6),
                      ...options.map((o) {
                        final label = (o['label'] ?? o['name'])?.toString() ?? '';
                        return CheckboxListTile(
                          dense: true,
                          contentPadding: EdgeInsets.zero,
                          value: selectedOptions.contains(label),
                          onChanged: (v) => setStateSheet(() {
                            if (v == true) {
                              selectedOptions.add(label);
                            } else {
                              selectedOptions.remove(label);
                            }
                          }),
                          title: Text(label),
                        );
                      }),
                      const SizedBox(height: 12),
                    ],
                    ElevatedButton(
                      onPressed: () => Navigator.pop(ctx, true),
                      child: const Text('Ajouter'),
                    ),
                  ],
                ),
              );
            },
          );
        },
      );
      if (ok == true && mounted) {
        setState(() {
          final key = _cartKey(restaurantId, name, size: selectedSize, options: selectedOptions.toList());
          _cart[key] = (_cart[key] ?? 0) + 1;
          _estimatedTotal = null;
      _estimatedDeliveryFee = null;
      _estimatedDiscount = null;
        });
      }
    } else {
      setState(() {
        _cart[baseKey] = (_cart[baseKey] ?? 0) + 1;
        _estimatedTotal = null;
      _estimatedDeliveryFee = null;
      _estimatedDiscount = null;
      });
    }
  }

  Future<void> _showMealDetailModal(
    Map<String, dynamic> item,
    String restaurantId,
    String restaurantName,
  ) async {
    final name = _itemKey(item);
    final imageUrl = _itemImageUrl(item);
    final price = _itemPrice(item);
    final description = item['description']?.toString().trim() ?? '';
    final sizes = (item['sizes'] as List?)?.cast<Map<String, dynamic>>();
    final options = (item['options'] as List?)?.cast<Map<String, dynamic>>();

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setModalState) {
            final qty = _itemQtyInCart(restaurantId, name);
            return DraggableScrollableSheet(
              initialChildSize: 0.72,
              minChildSize: 0.45,
              maxChildSize: 0.92,
              builder: (_, scrollController) {
                return Container(
                  decoration: const BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
                  ),
                  child: Column(
                    children: [
                      const SizedBox(height: 10),
                      Container(
                        width: 40,
                        height: 4,
                        decoration: BoxDecoration(
                          color: Colors.grey.shade300,
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                      Expanded(
                        child: ListView(
                          controller: scrollController,
                          padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
                          children: [
                            if (imageUrl != null)
                              ClipRRect(
                                borderRadius: BorderRadius.circular(16),
                                child: Image.network(
                                  imageUrl,
                                  height: 200,
                                  width: double.infinity,
                                  fit: BoxFit.cover,
                                  errorBuilder: (_, __, ___) => SizedBox(
                                    height: 160,
                                    child: _restaurantPlaceholder(),
                                  ),
                                ),
                              )
                            else
                              SizedBox(height: 160, child: _restaurantPlaceholder()),
                            const SizedBox(height: 16),
                            Text(
                              name,
                              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 22),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              restaurantName,
                              style: const TextStyle(color: MovaColors.textSecondary, fontSize: 13),
                            ),
                            const SizedBox(height: 12),
                            Text(
                              MarketConfig.formatCdf(price),
                              style: const TextStyle(
                                color: MovaColors.violet,
                                fontSize: 20,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            if (description.isNotEmpty) ...[
                              const SizedBox(height: 16),
                              const Text(
                                'Description',
                                style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
                              ),
                              const SizedBox(height: 6),
                              Text(
                                description,
                                style: const TextStyle(
                                  color: MovaColors.textSecondary,
                                  fontSize: 14,
                                  height: 1.45,
                                ),
                              ),
                            ],
                            if (sizes != null && sizes.isNotEmpty) ...[
                              const SizedBox(height: 16),
                              const Text('Tailles disponibles', style: TextStyle(fontWeight: FontWeight.w600)),
                              const SizedBox(height: 8),
                              Wrap(
                                spacing: 8,
                                runSpacing: 8,
                                children: sizes.map((s) {
                                  final label = (s['label'] ?? s['name'])?.toString() ?? '';
                                  return Chip(label: Text(label));
                                }).toList(),
                              ),
                            ],
                            if (options != null && options.isNotEmpty) ...[
                              const SizedBox(height: 16),
                              const Text('Options', style: TextStyle(fontWeight: FontWeight.w600)),
                              const SizedBox(height: 8),
                              ...options.map((o) {
                                final label = (o['label'] ?? o['name'])?.toString() ?? '';
                                return Padding(
                                  padding: const EdgeInsets.only(bottom: 4),
                                  child: Row(
                                    children: [
                                      const Icon(Icons.check_circle_outline, size: 18, color: MovaColors.green),
                                      const SizedBox(width: 8),
                                      Expanded(child: Text(label)),
                                    ],
                                  ),
                                );
                              }),
                            ],
                          ],
                        ),
                      ),
                      SafeArea(
                        top: false,
                        child: Padding(
                          padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
                          child: Row(
                            children: [
                              Container(
                                decoration: BoxDecoration(
                                  border: Border.all(color: Colors.grey.shade300),
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    IconButton(
                                      icon: const Icon(Icons.remove),
                                      onPressed: qty > 0
                                          ? () {
                                              setState(() => _removeOneFromCart(restaurantId, name));
                                              setModalState(() {});
                                            }
                                          : null,
                                    ),
                                    Text(
                                      '$qty',
                                      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                                    ),
                                    IconButton(
                                      icon: const Icon(Icons.add),
                                      onPressed: () async {
                                        await _promptAndAddToCart(item, restaurantId);
                                        if (ctx.mounted) setModalState(() {});
                                      },
                                    ),
                                  ],
                                ),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: ElevatedButton(
                                  style: ElevatedButton.styleFrom(
                                    backgroundColor: MovaColors.violet,
                                    foregroundColor: Colors.white,
                                    padding: const EdgeInsets.symmetric(vertical: 14),
                                    shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(12),
                                    ),
                                  ),
                                  onPressed: () async {
                                    await _promptAndAddToCart(item, restaurantId);
                                    if (ctx.mounted) Navigator.pop(ctx);
                                  },
                                  child: Text(qty > 0 ? 'Ajouter encore' : 'Ajouter au panier'),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                );
              },
            );
          },
        );
      },
    );
  }

  bool get _hasActiveRestaurantFilters =>
      _filterCuisine.trim().isNotEmpty ||
      _filterMaxEta > 0 ||
      _filterMaxPrice > 0 ||
      _filterMaxDistance > 0;

  Future<void> _resetRestaurantFilters() async {
    setState(() {
      _filterCuisine = '';
      _filterMaxEta = 0;
      _filterMaxPrice = 0;
      _filterMaxDistance = 0;
    });
    await _loadRestaurants(background: true);
  }

  Future<void> _loadRestaurants({bool background = false}) async {
    setState(() {
      if (background) {
        _refreshing = true;
      } else {
        _loading = true;
      }
      _error = null;
    });
    final api = ref.read(apiClientProvider);
    await api.checkHealth();
    final params = <String, String>{
      'deliveryLat': '$_deliveryLat',
      'deliveryLng': '$_deliveryLng',
      'deliveryCity': _deliveryCityName,
      if (_filterCuisine.trim().isNotEmpty) 'cuisine': _filterCuisine.trim(),
      if (_filterMaxEta > 0) 'maxEtaMin': _filterMaxEta.round().toString(),
      if (_filterMaxPrice > 0) 'maxPriceCdf': _filterMaxPrice.round().toString(),
      if (_filterMaxDistance > 0) 'maxDistanceKm': _filterMaxDistance.toStringAsFixed(1),
    };
    final qs = params.entries.map((e) => '${Uri.encodeQueryComponent(e.key)}=${Uri.encodeQueryComponent(e.value)}').join('&');
    final result = await api.get('/deliveries/restaurants?$qs');
    if (!mounted) return;
    setState(() {
      _loading = false;
      _refreshing = false;
      switch (result) {
        case Success(:final data):
          _restaurants = _parseRestaurants(data);
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
      if (name != null && name.isNotEmpty) {
        _cart[_cartKey(widget.initialRestaurantId!, name)] = qty;
      }
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
    var total = 0;
    for (final entry in _cart.entries) {
      final parsed = _parseCartKey(entry.key);
      final restaurant = _restaurants.firstWhere(
        (r) => r['id']?.toString() == parsed.restaurantId,
        orElse: () => <String, dynamic>{},
      );
      if (restaurant.isEmpty) continue;
      final items = _menuItems(restaurant);
      final item = items.firstWhere((i) => _itemKey(i) == parsed.itemName, orElse: () => {});
      total += _effectiveUnitPrice(item, size: parsed.size, options: parsed.options) *
          entry.value;
    }
    return total;
  }

  List<Map<String, dynamic>> _cartItemsForRestaurant(String restaurantId) {
    final restaurant = _restaurants.firstWhere(
      (r) => r['id']?.toString() == restaurantId,
      orElse: () => <String, dynamic>{},
    );
    if (restaurant.isEmpty) return [];
    final menu = _menuItems(restaurant);
    final items = <Map<String, dynamic>>[];
    for (final e in _cart.entries) {
      final parsed = _parseCartKey(e.key);
      if (parsed.restaurantId != restaurantId) continue;
      final item = menu.firstWhere((i) => _itemKey(i) == parsed.itemName, orElse: () => {});
      items.add({
        'name': parsed.itemName,
        'quantity': e.value,
        'unitPriceCdf': _effectiveUnitPrice(item, size: parsed.size, options: parsed.options),
        if (parsed.size != null) 'size': parsed.size,
        if (parsed.options.isNotEmpty) 'options': parsed.options,
      });
    }
    return items;
  }

  List<Map<String, dynamic>> _ordersForApi() {
    final restaurantIds = _cart.keys.map((k) => _parseCartKey(k).restaurantId).where((id) => id.isNotEmpty).toSet().toList();
    return restaurantIds.map((id) => {'restaurantId': id, 'items': _cartItemsForRestaurant(id)}).toList();
  }

  Map<String, dynamic> _orderPayload() {
    final promoCode = _promoController.text.trim();
    return {
      'restaurantId': _selectedRestaurant!['id'],
      'deliveryAddress': _addressController.text.trim(),
      'deliveryLat': _deliveryLat,
      'deliveryLng': _deliveryLng,
      'items': _cartItemsForRestaurant(_selectedRestaurant!['id']?.toString() ?? ''),
      if (promoCode.isNotEmpty) 'promoCode': promoCode,
    };
  }

  Map<String, dynamic> _orderPayloadMulti() {
    final promoCode = _promoController.text.trim();
    return {
      'orders': _ordersForApi(),
      'deliveryAddress': _addressController.text.trim(),
      'deliveryLat': _deliveryLat,
      'deliveryLng': _deliveryLng,
      if (promoCode.isNotEmpty) 'promoCode': promoCode,
    };
  }

  Future<void> _estimateOrder() async {
    if (_cart.isEmpty) {
      setState(() => _validationError = 'Ajoutez au moins un plat au panier.');
      return;
    }
    if (_addressController.text.trim().isEmpty) {
      setState(() => _validationError = 'Indiquez l\'adresse de livraison.');
      return;
    }
    final geoError = await _resolveDeliveryAddress();
    if (geoError != null) {
      setState(() => _validationError = geoError);
      return;
    }
    setState(() {
      _ordering = true;
      _error = null;
      _validationError = null;
    });
    final api = ref.read(apiClientProvider);
    final restaurantIds = _cart.keys.map((k) => _parseCartKey(k).restaurantId).toSet();
    final isMulti = restaurantIds.length > 1;
    final result = await api.post(isMulti ? '/deliveries/food/multi/estimate' : '/deliveries/food/estimate', isMulti ? _orderPayloadMulti() : _orderPayload());
    setState(() {
      _ordering = false;
      switch (result) {
        case Success(:final data):
          _estimatedTotal = data['estimatedPriceCdf'] as int?;
          _estimatedDeliveryFee = data['deliveryFeeCdf'] as int?;
          _estimatedDiscount = data['discountCdf'] as int?;
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
    final geoError = await _resolveDeliveryAddress();
    if (geoError != null) {
      setState(() => _validationError = geoError);
      return;
    }
    setState(() {
      _ordering = true;
      _error = null;
      _validationError = null;
    });
    final api = ref.read(apiClientProvider);
    final restaurantIds = _cart.keys.map((k) => _parseCartKey(k).restaurantId).toSet();
    final isMulti = restaurantIds.length > 1;
    final result = await api.post(isMulti ? '/deliveries/food/multi' : '/deliveries/food', isMulti ? _orderPayloadMulti() : _orderPayload());
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
                restaurantName: isMulti ? 'Multi-restaurants' : (_selectedRestaurant!['name']?.toString() ?? ''),
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
    final query = _searchQuery.trim().toLowerCase();
    final filtered = query.isEmpty
        ? _restaurants
        : _restaurants.where((r) {
            final name = r['name']?.toString().toLowerCase() ?? '';
            final cuisine = r['cuisine']?.toString().toLowerCase() ?? '';
            return name.contains(query) || cuisine.contains(query);
          }).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Align(
          alignment: Alignment.centerLeft,
          child: ServiceAreaSelector(sheetTitle: 'Ville de livraison'),
        ),
        const SizedBox(height: 6),
        Text(
          'Restaurants à $_deliveryCityName',
          style: const TextStyle(
            color: MovaColors.textSecondary,
            fontSize: 13,
            fontWeight: FontWeight.w500,
          ),
        ),
        const SizedBox(height: 12),
        _buildDeliveryAddressField(),
        const SizedBox(height: 12),
        TextField(
          decoration: const InputDecoration(
            labelText: 'Rechercher un restaurant',
            prefixIcon: Icon(Icons.search),
            isDense: true,
          ),
          onChanged: (v) => setState(() => _searchQuery = v),
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Text(
              'Filtres livraison',
              style: Theme.of(context).textTheme.titleSmall,
            ),
            if (_refreshing)
              const Padding(
                padding: EdgeInsets.only(left: 8),
                child: SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              ),
            const Spacer(),
            if (_hasActiveRestaurantFilters)
              TextButton(
                onPressed: _refreshing ? null : _resetRestaurantFilters,
                child: const Text('Réinitialiser'),
              ),
          ],
        ),
        const SizedBox(height: 4),
        DropdownButtonFormField<String?>(
          value: _filterCuisine.isEmpty ? null : _filterCuisine,
          decoration: const InputDecoration(
            labelText: 'Cuisine',
            isDense: true,
          ),
          items: [
            const DropdownMenuItem<String?>(value: null, child: Text('Toutes')),
            ...{
              // La cuisine sélectionnée doit rester présente même si la liste filtrée
              // ne la contient plus, sinon le Dropdown lève une assertion (valeur orpheline).
              if (_filterCuisine.trim().isNotEmpty) _filterCuisine.trim(),
              ..._restaurants
                  .map((r) => r['cuisine']?.toString() ?? '')
                  .where((c) => c.trim().isNotEmpty),
            }.map((c) => DropdownMenuItem(value: c, child: Text(c))),
          ],
          onChanged: (v) async {
            setState(() => _filterCuisine = v ?? '');
            await _loadRestaurants(background: true);
          },
        ),
        const SizedBox(height: 8),
        Text(
          'Délai max (ETA, min. 20 min): ${_filterMaxEta <= 0 ? 'aucun' : '${_filterMaxEta.round()} min'}',
          style: const TextStyle(fontSize: 12, color: MovaColors.textSecondary),
        ),
        Slider(
          value: _filterMaxEta,
          min: 0,
          max: 90,
          divisions: 18,
          label: _filterMaxEta <= 0 ? 'Aucun' : '${_filterMaxEta.round()} min',
          // Le backend applique un plancher de 20 min sur l'ETA livraison : toute valeur
          // 1–19 min exclurait tous les restaurants. On la ramène donc à 20 min.
          onChanged: (v) => setState(() => _filterMaxEta = v <= 0 ? 0 : (v < 20 ? 20 : v)),
          onChangeEnd: (_) => _loadRestaurants(background: true),
        ),
        Text(
          'Prix max (plat le moins cher): ${_filterMaxPrice <= 0 ? 'aucun' : MarketConfig.formatCdf(_filterMaxPrice.round())}',
          style: const TextStyle(fontSize: 12, color: MovaColors.textSecondary),
        ),
        Slider(
          value: _filterMaxPrice,
          min: 0,
          max: 50000,
          divisions: 20,
          label: _filterMaxPrice <= 0 ? 'Aucun' : MarketConfig.formatCdf(_filterMaxPrice.round()),
          onChanged: (v) => setState(() => _filterMaxPrice = v),
          onChangeEnd: (_) => _loadRestaurants(background: true),
        ),
        Text(
          'Distance max: ${_filterMaxDistance <= 0 ? 'aucune' : '${_filterMaxDistance.toStringAsFixed(1)} km'}',
          style: const TextStyle(fontSize: 12, color: MovaColors.textSecondary),
        ),
        Slider(
          value: _filterMaxDistance,
          min: 0,
          max: 10,
          divisions: 20,
          label: _filterMaxDistance <= 0 ? 'Aucune' : '${_filterMaxDistance.toStringAsFixed(1)} km',
          onChanged: (v) => setState(() => _filterMaxDistance = v),
          onChangeEnd: (_) => _loadRestaurants(background: true),
        ),
        const SizedBox(height: 12),
        Text(
          'Restaurants à proximité',
          style: Theme.of(context).textTheme.titleSmall,
        ),
        if (filtered.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 24),
            child: Text(
              _restaurants.isEmpty
                  ? (_hasActiveRestaurantFilters
                      ? 'Aucun restaurant ne correspond aux filtres (cuisine, délai, prix ou distance). Ajustez ou réinitialisez les filtres ci-dessus.'
                      : 'Aucun restaurant disponible à $_deliveryCityName pour le moment.')
                  : 'Aucun restaurant ne correspond à votre recherche.',
              style: const TextStyle(color: MovaColors.textSecondary),
              textAlign: TextAlign.center,
            ),
          ),
        const SizedBox(height: 12),
        ...filtered.map((r) {
          return Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: MovaCard(
              onTap: () => setState(() {
                _selectedRestaurant = r;
                _estimatedTotal = null;
      _estimatedDeliveryFee = null;
      _estimatedDiscount = null;
              }),
              child: Row(
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(12),
                    child: r['imageUrl'] != null
                        ? Image.network(
                            MarketConfig.resolveMediaUrl(r['imageUrl'].toString()),
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
                        Wrap(
                          spacing: 4,
                          runSpacing: 4,
                          crossAxisAlignment: WrapCrossAlignment.center,
                          children: [
                            const Icon(Icons.star, color: Colors.amber, size: 14),
                            Text(
                              '${r['rating']}',
                              style: const TextStyle(fontSize: 13),
                            ),
                            const Icon(Icons.schedule, size: 14, color: MovaColors.textSecondary),
                            Text(
                              'Livraison ~${_deliveryEtaMin(r)} min',
                              style: const TextStyle(
                                color: MovaColors.violet,
                                fontSize: 13,
                                fontWeight: FontWeight.w500,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
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
                        if ((r['promotionLabel']?.toString() ?? '').trim().isNotEmpty)
                          Padding(
                            padding: const EdgeInsets.only(top: 4),
                            child: Text(
                              r['promotionLabel']?.toString() ?? '',
                              style: const TextStyle(color: MovaColors.green, fontSize: 12, fontWeight: FontWeight.w600),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
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
    final items = _menuItems(restaurant);
    final restaurantId = restaurant['id']?.toString() ?? '';

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
      _estimatedDeliveryFee = null;
      _estimatedDiscount = null;
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
          final name = _itemKey(item);
          final qty = _itemQtyInCart(restaurantId, name);
          return Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: MovaCard(
              child: Row(
                children: [
                  Expanded(
                    child: InkWell(
                      onTap: () => _showMealDetailModal(
                        item,
                        restaurantId,
                        restaurant['name']?.toString() ?? '',
                      ),
                      borderRadius: BorderRadius.circular(12),
                      child: Row(
                        children: [
                          if (_itemImageUrl(item) != null)
                            ClipRRect(
                              borderRadius: BorderRadius.circular(10),
                              child: Image.network(
                                _itemImageUrl(item)!,
                                width: 64,
                                height: 64,
                                fit: BoxFit.cover,
                                errorBuilder: (_, __, ___) => _restaurantPlaceholder(),
                              ),
                            )
                          else
                            SizedBox(
                              width: 64,
                              height: 64,
                              child: _restaurantPlaceholder(),
                            ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  name,
                                  style: const TextStyle(fontWeight: FontWeight.w600),
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                ),
                                if (item['description'] != null && item['description'].toString().isNotEmpty)
                                  Text(
                                    item['description'].toString(),
                                    style: const TextStyle(fontSize: 12, color: MovaColors.textSecondary),
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                Text(
                                  MarketConfig.formatCdf(_itemPrice(item)),
                                  style: const TextStyle(color: MovaColors.violet),
                                ),
                                const Text(
                                  'Voir le détail',
                                  style: TextStyle(fontSize: 11, color: MovaColors.violet),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.remove_circle_outline),
                    onPressed: qty > 0
                        ? () => setState(() => _removeOneFromCart(restaurantId, name))
                        : null,
                  ),
                  Text('$qty', style: const TextStyle(fontWeight: FontWeight.bold)),
                  IconButton(
                    icon: const Icon(Icons.add_circle_outline),
                    onPressed: () => _promptAndAddToCart(item, restaurantId),
                  ),
                ],
              ),
            ),
          );
        }),
        if (_cart.isNotEmpty) ...[
          const SizedBox(height: 16),
          _buildDeliveryAddressField(),
          DestinationCoordPanel(
            initialLat: _deliveryLat,
            initialLng: _deliveryLng,
            onApply: _setDeliveryFromCoords,
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _promoController,
            decoration: const InputDecoration(
              labelText: 'Code promo (optionnel)',
              prefixIcon: Icon(Icons.local_offer),
            ),
            onChanged: (_) => setState(() => _estimatedTotal = null),
          ),
          const SizedBox(height: 12),
          MovaCard(
            child: Column(
              children: [
                Row(
                  children: [
                    const Expanded(child: Text('Sous-total articles')),
                    Flexible(
                      child: Text(
                        MarketConfig.formatCdf(_cartSubtotal),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        textAlign: TextAlign.end,
                      ),
                    ),
                  ],
                ),
                if (_estimatedTotal != null) ...[
                  if (_estimatedDeliveryFee != null) ...[
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        const Expanded(child: Text('Frais de livraison')),
                        Flexible(
                          child: Text(
                            MarketConfig.formatCdf(_estimatedDeliveryFee!),
                            textAlign: TextAlign.end,
                          ),
                        ),
                      ],
                    ),
                  ],
                  if (_estimatedDiscount != null && _estimatedDiscount! > 0) ...[
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        const Expanded(child: Text('Réduction')),
                        Flexible(
                          child: Text(
                            '- ${MarketConfig.formatCdf(_estimatedDiscount!)}',
                            style: const TextStyle(color: MovaColors.green),
                            textAlign: TextAlign.end,
                          ),
                        ),
                      ],
                    ),
                  ],
                  const Divider(height: 16),
                  Row(
                    children: [
                      const Expanded(
                        child: Text('Total estimé', style: TextStyle(fontWeight: FontWeight.bold)),
                      ),
                      Flexible(
                        child: Text(
                          MarketConfig.formatCdf(_estimatedTotal!),
                          style: const TextStyle(
                            fontWeight: FontWeight.bold,
                            color: MovaColors.green,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          textAlign: TextAlign.end,
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
    ref.listen<ServiceArea>(selectedServiceAreaProvider, (previous, next) {
      if (previous?.id == next.id) return;
      _applyDeliveryCity(next);
    });

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

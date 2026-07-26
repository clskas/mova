import 'package:latlong2/latlong.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_client.dart';
import '../../core/billing/service_price_display.dart';
import '../../core/location/destination_coords.dart';
import '../../core/location/location_service.dart';
import '../../core/location/service_area_location.dart';
import '../../core/location/service_area_prefs.dart';
import '../../core/location/service_areas.dart';
import '../../core/error/result.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/geo_autocomplete_field.dart';
import '../../core/widgets/mova_layout.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import '../../core/config/market_config.dart';
import '../booking/widgets/mova_ride_map.dart';
import '../../widgets/promo_code_field.dart';
import '../wallet/wallet_screen.dart';
import 'errand_tracking_screen.dart';

class ErrandScreen extends ConsumerStatefulWidget {
  const ErrandScreen({super.key});

  @override
  ConsumerState<ErrandScreen> createState() => _ErrandScreenState();
}

class _ErrandScreenState extends ConsumerState<ErrandScreen> {
  final _pickupController = TextEditingController(text: 'Commerce / pharmacie, Gombe');
  final _dropoffController = TextEditingController();
  final _itemController = TextEditingController();
  final List<String> _items = [];
  final _budgetController = TextEditingController();
  final _budgetFocusNode = FocusNode();
  final _promoController = TextEditingController();
  int? _estimatedPrice;
  int? _estimatedPurchaseCdf;
  int? _minimumBudgetCdf;
  int? _walletAvailableCdf;
  bool _loading = false;
  bool _loadingGps = false;
  double? _pickupLat;
  double? _pickupLng;
  double? _deliveryLat;
  double? _deliveryLng;
  String? _error;
  String? _validationError;

  String get _autocompleteCity {
    if (_pickupLat != null && _pickupLng != null) {
      return ServiceAreas.autocompleteCity(
        coords: LatLng(_pickupLat!, _pickupLng!),
        preferredArea: ref.read(selectedServiceAreaProvider),
      );
    }
    if (_deliveryLat != null && _deliveryLng != null) {
      return ServiceAreas.autocompleteCity(
        coords: LatLng(_deliveryLat!, _deliveryLng!),
        preferredArea: ref.read(selectedServiceAreaProvider),
      );
    }
    return ServiceAreas.autocompleteCity(
      coords: _pickupPoint,
      preferredArea: ref.read(selectedServiceAreaProvider),
    );
  }

  @override
  void dispose() {
    _pickupController.dispose();
    _dropoffController.dispose();
    _itemController.dispose();
    _budgetController.dispose();
    _budgetFocusNode.dispose();
    _promoController.dispose();
    super.dispose();
  }

  void _addItem() {
    final text = _itemController.text.trim();
    if (text.isEmpty) return;
    setState(() {
      _items.add(text);
      _itemController.clear();
      _estimatedPrice = null;
      _validationError = null;
    });
  }

  void _removeItem(int index) {
    setState(() {
      _items.removeAt(index);
      _estimatedPrice = null;
    });
  }

  String _buildDescription() => _items.join(', ');

  Future<void> _useMyLocation() async {
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
    setState(() {
      _loadingGps = false;
      _dropoffController.text = ServiceAreaLocation.isInBounds(result.position)
          ? result.label
          : LocationService.coordsLabel(coords);
      _deliveryLat = coords.latitude;
      _deliveryLng = coords.longitude;
      _estimatedPrice = null;
      _estimatedPurchaseCdf = null;
    });
  }

  Map<String, dynamic> _errandPayload({bool requireBudget = false}) {
    final budget = int.tryParse(_budgetController.text.trim());
    if (requireBudget && (budget == null || budget <= 0)) {
      throw StateError('Budget achats max obligatoire.');
    }
    return {
      'pickupAddress': _pickupController.text.trim(),
      if (_pickupLat != null) 'pickupLat': _pickupLat,
      if (_pickupLng != null) 'pickupLng': _pickupLng,
      'deliveryAddress': _dropoffController.text.trim(),
      if (_deliveryLat != null) 'deliveryLat': _deliveryLat,
      if (_deliveryLng != null) 'deliveryLng': _deliveryLng,
      'items': List<String>.from(_items),
      'description': _buildDescription(),
      if (budget != null && budget > 0) 'budgetCdf': budget,
      if (_promoController.text.trim().isNotEmpty) 'promoCode': _promoController.text.trim(),
    };
  }

  int? _readCdf(dynamic value) => (value as num?)?.toInt();

  Map<String, dynamic> _unwrapEstimate(Map<String, dynamic> data) {
    final nested = data['estimate'];
    if (nested is Map) return Map<String, dynamic>.from(nested);
    return data;
  }

  Future<String?> _resolveAddressCoords({
    required String address,
    required double? lat,
    required double? lng,
    required bool isDelivery,
    double? nearLat,
    double? nearLng,
  }) async {
    if (lat != null && lng != null) return null;
    final text = address.trim();
    if (text.isEmpty) {
      return isDelivery
          ? 'Indiquez le lieu de livraison (nom du quartier ou adresse).'
          : 'Indiquez l\'adresse du commerce ou point de retrait.';
    }
    if (text == 'Ma position') {
      if (isDelivery) {
        final result = await LocationService.getCurrentLocation();
        if (result != null) {
          final coords = ServiceAreaLocation.ensureInServiceArea(
            result.position,
            address: result.label,
          );
          _deliveryLat = coords.latitude;
          _deliveryLng = coords.longitude;
          if (_dropoffController.text.trim() == 'Ma position') {
            _dropoffController.text = ServiceAreaLocation.isInBounds(result.position)
                ? result.label
                : LocationService.coordsLabel(coords);
          }
          return null;
        }
      }
      return 'Activez le GPS avec le bouton cible ou saisissez un nom de lieu.';
    }
    final fromTextCoords = DestinationCoords.parseText(text);
    if (fromTextCoords != null && ServiceAreaLocation.isInBounds(fromTextCoords)) {
      if (isDelivery) {
        _deliveryLat = fromTextCoords.latitude;
        _deliveryLng = fromTextCoords.longitude;
      } else {
        _pickupLat = fromTextCoords.latitude;
        _pickupLng = fromTextCoords.longitude;
      }
      return null;
    }
    final api = ref.read(apiClientProvider);
    final city = nearLat != null && nearLng != null
        ? ServiceAreas.autocompleteCity(
            coords: LatLng(nearLat, nearLng),
            preferredArea: ref.read(selectedServiceAreaProvider),
          )
        : _autocompleteCity;
    final result = await api.geoAutocomplete(text, city: city);
    if (result case Success(:final data) when data.isNotEmpty) {
      final s = data.first;
      final resolvedLat = (s['lat'] as num?)?.toDouble();
      final resolvedLng = (s['lng'] as num?)?.toDouble();
      if (resolvedLat != null && resolvedLng != null) {
        if (isDelivery) {
          _deliveryLat = resolvedLat;
          _deliveryLng = resolvedLng;
        } else {
          _pickupLat = resolvedLat;
          _pickupLng = resolvedLng;
        }
        return null;
      }
    }
    return isDelivery
        ? 'Lieu de livraison non reconnu — saisissez un nom de quartier (ex. Gombe, Limete) ou utilisez le GPS.'
        : 'Adresse de retrait non reconnue — saisissez un nom de lieu ou choisissez une suggestion.';
  }

  Future<String?> _ensureAddressCoords() async {
    final pickupError = await _resolveAddressCoords(
      address: _pickupController.text,
      lat: _pickupLat,
      lng: _pickupLng,
      isDelivery: false,
    );
    if (pickupError != null) return pickupError;
    return _resolveAddressCoords(
      address: _dropoffController.text,
      lat: _deliveryLat,
      lng: _deliveryLng,
      isDelivery: true,
      nearLat: _pickupLat,
      nearLng: _pickupLng,
    );
  }

  void _deferResetEstimate({bool clearPickup = false, bool clearDropoff = false}) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      setState(() {
        _estimatedPrice = null;
        _estimatedPurchaseCdf = null;
        _minimumBudgetCdf = null;
        if (clearPickup) {
          _pickupLat = null;
          _pickupLng = null;
        }
        if (clearDropoff) {
          _deliveryLat = null;
          _deliveryLng = null;
        }
      });
    });
  }

  void _onPickupUserInput() => _deferResetEstimate(clearPickup: true);

  void _onDropoffUserInput() => _deferResetEstimate(clearDropoff: true);

  void _selectPickupSuggestion(Map<String, dynamic> suggestion) {
    final label = suggestion['label']?.toString() ?? suggestion['address']?.toString() ?? '';
    _pickupController.text = label;
    setState(() {
      _pickupLat = (suggestion['lat'] as num?)?.toDouble();
      _pickupLng = (suggestion['lng'] as num?)?.toDouble();
      _estimatedPrice = null;
      _estimatedPurchaseCdf = null;
    });
  }

  void _selectDropoffSuggestion(Map<String, dynamic> suggestion) {
    final label = suggestion['label']?.toString() ?? suggestion['address']?.toString() ?? '';
    _dropoffController.text = label;
    setState(() {
      _deliveryLat = (suggestion['lat'] as num?)?.toDouble();
      _deliveryLng = (suggestion['lng'] as num?)?.toDouble();
      _estimatedPrice = null;
      _estimatedPurchaseCdf = null;
    });
  }

  LatLng get _pickupPoint => LatLng(
        _pickupLat ?? MarketConfig.defaultLat,
        _pickupLng ?? MarketConfig.defaultLng,
      );

  LatLng? get _dropoffPoint {
    if (_deliveryLat == null || _deliveryLng == null) return null;
    return LatLng(_deliveryLat!, _deliveryLng!);
  }

  String? _validate() {
    if (_items.isEmpty) return 'Ajoutez au moins un article à la liste.';
    if (_pickupController.text.trim().isEmpty) {
      return 'Indiquez l\'adresse du commerce ou point de retrait.';
    }
    if (_dropoffController.text.trim().isEmpty) {
      return 'Indiquez le lieu de livraison (nom du quartier ou adresse).';
    }
    final budget = int.tryParse(_budgetController.text.trim());
    if (budget == null || budget <= 0) {
      return 'Budget achats max obligatoire — rechargez votre wallet SENGA pour bloquer ce montant.';
    }
    if (_minimumBudgetCdf != null && budget < _minimumBudgetCdf!) {
      return 'Budget minimum : ${MarketConfig.formatCdf(_minimumBudgetCdf!)} (achats estimés).';
    }
    return null;
  }

  Future<String?> _ensureWalletCoversBudget(int budget) async {
    final api = ref.read(apiClientProvider);
    final result = await api.get('/wallet');
    if (result case Success(:final data)) {
      final available = data['availableBalanceCdf'] as int? ??
          ((data['balanceCdf'] as int? ?? 0) - (data['heldBalanceCdf'] as int? ?? 0));
      _walletAvailableCdf = available;
      if (available < budget) {
        return 'Solde wallet insuffisant : ${MarketConfig.formatCdf(available)} disponible, '
            '${MarketConfig.formatCdf(budget)} requis. Rechargez votre wallet SENGA.';
      }
      return null;
    }
    if (result case Failure(:final error)) {
      return error.message;
    }
    return 'Impossible de vérifier le wallet.';
  }

  Future<void> _estimate() async {
    FocusManager.instance.primaryFocus?.unfocus();
    final validation = _validate();
    if (validation != null) {
      setState(() => _validationError = validation);
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
      _validationError = null;
    });
    final coordError = await _ensureAddressCoords();
    if (!mounted) return;
    if (coordError != null) {
      setState(() {
        _loading = false;
        _validationError = coordError;
      });
      return;
    }
    final api = ref.read(apiClientProvider);
    await api.checkHealth();
    final result = await api.post('/deliveries/errand/estimate', _errandPayload());
    setState(() {
      _loading = false;
      switch (result) {
        case Success(:final data):
          final estimate = _unwrapEstimate(data);
          _estimatedPrice = _readCdf(estimate['estimatedPriceCdf'] ?? estimate['serviceFeeCdf']);
          _estimatedPurchaseCdf = _readCdf(estimate['estimatedPurchaseCdf']);
          _minimumBudgetCdf = _readCdf(estimate['minimumBudgetCdf'] ?? estimate['estimatedPurchaseCdf']);
          if (_estimatedPrice == null) {
            _error = 'Estimation indisponible — réessayez dans un instant.';
          }
        case Failure(:final error):
          _error = error.message;
      }
    });
  }

  Future<void> _confirm() async {
    FocusManager.instance.primaryFocus?.unfocus();
    final validation = _validate();
    if (validation != null) {
      setState(() => _validationError = validation);
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
      _validationError = null;
    });
    final coordError = await _ensureAddressCoords();
    if (!mounted) return;
    if (coordError != null) {
      setState(() {
        _loading = false;
        _validationError = coordError;
      });
      return;
    }
    final budget = int.parse(_budgetController.text.trim());
    final walletError = await _ensureWalletCoversBudget(budget);
    if (!mounted) return;
    if (walletError != null) {
      setState(() {
        _loading = false;
        _validationError = walletError;
      });
      return;
    }
    final api = ref.read(apiClientProvider);
    await api.checkHealth();
    final result = await api.post('/deliveries/errand', _errandPayload(requireBudget: true));
    setState(() => _loading = false);
    switch (result) {
      case Success(:final data):
        if (mounted) {
          final order = data['errand'] as Map<String, dynamic>? ??
              data['order'] as Map<String, dynamic>?;
          Navigator.pushReplacement(
            context,
            MaterialPageRoute(
              builder: (_) => ErrandTrackingScreen(
                errandId: order?['id']?.toString() ?? '',
                deliveryAddress: _dropoffController.text.trim(),
                items: List<String>.from(_items),
                totalCdf: order?['estimatedPriceCdf'] as int? ?? _estimatedPrice ?? 0,
              ),
            ),
          );
        }
      case Failure(:final error):
        setState(() => _error = error.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final compact = MovaLayout.isCompact(context);
    final gap = MovaLayout.gap(context);
    final gapSmall = MovaLayout.gap(context, normal: 12, compact: 8);
    final api = ref.read(apiClientProvider);
    final autocompleteCity = _autocompleteCity;

    return MovaScreen(
      title: 'Courses & commissions',
      scrollable: false,
      padding: EdgeInsets.zero,
      child: MovaMapFormLayout(
        mapBuilder: (height) => MovaRideMap(
          height: height,
          pickup: _pickupPoint,
          dropoff: _dropoffPoint,
          pickupLabel: _pickupController.text.trim().isEmpty ? null : _pickupController.text.trim(),
          dropoffLabel: _dropoffController.text.trim().isEmpty ? null : _dropoffController.text.trim(),
        ),
        child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            compact
                ? 'Listez vos achats — un livreur s\'en charge.'
                : 'Listez vos achats — un livreur s\'en charge pour vous.',
            style: theme.textTheme.bodyMedium?.copyWith(
              color: MovaColors.textSecondary,
              fontSize: compact ? 13 : null,
            ),
            maxLines: compact ? 3 : 2,
            overflow: TextOverflow.ellipsis,
          ),
          SizedBox(height: gap),
          GeoAutocompleteField(
            controller: _pickupController,
            api: api,
            city: autocompleteCity,
            label: compact ? 'Retrait (commerce)' : 'Point de retrait (commerce)',
            hint: 'Ex: Pharmacie, Marché…',
            prefixIcon: Icons.store_outlined,
            onUserInput: _onPickupUserInput,
            onSelected: _selectPickupSuggestion,
          ),
          SizedBox(height: gapSmall),
          GeoAutocompleteField(
            controller: _dropoffController,
            api: api,
            city: autocompleteCity,
            label: compact ? 'Livraison' : 'Lieu de livraison',
            hint: 'Ex: Gombe, Bandal…',
            prefixIcon: Icons.home_outlined,
            textInputAction: TextInputAction.next,
            blockedQueries: const {},
            onUserInput: _onDropoffUserInput,
            onSelected: _selectDropoffSuggestion,
            suffixIcon: _loadingGps
                ? Padding(
                    padding: EdgeInsets.all(compact ? 8 : 12),
                    child: SizedBox(
                      width: compact ? 16 : 18,
                      height: compact ? 16 : 18,
                      child: const CircularProgressIndicator(strokeWidth: 2),
                    ),
                  )
                : IconButton(
                    icon: Icon(Icons.gps_fixed, color: MovaColors.violet, size: compact ? 20 : 24),
                    tooltip: 'Ma position',
                    visualDensity: compact ? VisualDensity.compact : VisualDensity.standard,
                    onPressed: _loadingGps ? null : _useMyLocation,
                  ),
          ),
          SizedBox(height: gap),
          TextField(
            controller: _budgetController,
            focusNode: _budgetFocusNode,
            keyboardType: TextInputType.number,
            style: compact ? const TextStyle(fontSize: 14) : null,
            decoration: InputDecoration(
              isDense: compact,
              labelText: compact ? 'Budget max (FC) *' : 'Budget achats max (FC) *',
              hintText: _minimumBudgetCdf != null
                  ? 'Min. ${MarketConfig.formatCdf(_minimumBudgetCdf!)}'
                  : 'Ex: 50000',
              helperText: 'Obligatoire — bloqué sur votre wallet SENGA jusqu\'à la fin de la course.',
              helperMaxLines: 2,
              labelStyle: compact ? const TextStyle(fontSize: 13) : null,
              prefixIcon: Icon(Icons.account_balance_wallet_outlined, size: compact ? 20 : 24),
              suffixIcon: IconButton(
                icon: Icon(Icons.add_card_outlined, color: MovaColors.violet, size: compact ? 20 : 24),
                tooltip: 'Recharger le wallet',
                onPressed: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(builder: (_) => const WalletScreen()),
                  );
                },
              ),
            ),
            onChanged: (_) => _deferResetEstimate(),
          ),
          if (_walletAvailableCdf != null) ...[
            const SizedBox(height: 6),
            Text(
              'Solde wallet disponible : ${MarketConfig.formatCdf(_walletAvailableCdf!)}',
              style: theme.textTheme.bodySmall?.copyWith(color: MovaColors.textSecondary),
            ),
          ],
          SizedBox(height: gap),
          Text('Liste de courses', style: theme.textTheme.titleSmall?.copyWith(fontSize: compact ? 14 : null)),
          SizedBox(height: compact ? 6 : 8),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _itemController,
                  style: compact ? const TextStyle(fontSize: 14) : null,
                  decoration: InputDecoration(
                    hintText: compact ? 'Ex: Riz, Pain…' : 'Ex: Riz 5 kg, Pain, Savon…',
                    hintStyle: compact ? const TextStyle(fontSize: 13) : null,
                    isDense: true,
                  ),
                  onSubmitted: (_) => _addItem(),
                ),
              ),
              IconButton(
                icon: Icon(Icons.add_circle, color: MovaColors.violet, size: compact ? 22 : 24),
                visualDensity: compact ? VisualDensity.compact : VisualDensity.standard,
                onPressed: _addItem,
              ),
            ],
          ),
          if (_items.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: Text(
                'Ajoutez au moins un article',
                style: theme.textTheme.bodySmall?.copyWith(color: MovaColors.textSecondary),
              ),
            )
          else
            ...List.generate(_items.length, (i) {
              return Padding(
                padding: EdgeInsets.only(bottom: compact ? 4 : 6),
                child: MovaCard(
                  padding: EdgeInsets.all(compact ? 10 : 16),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          _items[i],
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: compact ? const TextStyle(fontSize: 13) : null,
                        ),
                      ),
                      IconButton(
                        icon: Icon(Icons.close, size: compact ? 18 : 20),
                        visualDensity: VisualDensity.compact,
                        onPressed: () => _removeItem(i),
                      ),
                    ],
                  ),
                ),
              );
            }),
          if (_estimatedPrice != null) ...[
            SizedBox(height: gap),
            ServicePriceDisplay.passengerCard(
              {
                'type': 'ERRAND',
                'serviceFeeCdf': _estimatedPrice,
                'purchaseTotalCdf': _estimatedPurchaseCdf ?? 0,
                'totalPriceCdf': _estimatedPrice! + (_estimatedPurchaseCdf ?? 0),
              },
              totalLabel: 'Total estimé',
            ),
          ],
          if (_validationError != null) ...[
            SizedBox(height: gap),
            MovaErrorBanner(message: _validationError!),
          ],
          PromoCodeField(
            controller: _promoController,
            compact: compact,
            onChanged: () => setState(() {
              _estimatedPrice = null;
              _estimatedPurchaseCdf = null;
            }),
          ),
          if (_error != null) ...[
            SizedBox(height: gap),
            MovaErrorBanner(message: _error!, onRetry: _estimate),
          ],
          SizedBox(height: compact ? 16 : 24),
          MovaButton(
            label: _estimatedPrice == null
                ? 'Estimer le prix'
                : (compact ? 'Envoyer' : 'Envoyer au livreur'),
            isLoading: _loading,
            icon: _estimatedPrice == null ? Icons.calculate_outlined : Icons.send_outlined,
            onPressed: _loading
                ? null
                : (_estimatedPrice == null ? _estimate : _confirm),
          ),
          SizedBox(height: gap),
        ],
        ),
      ),
    );
  }
}

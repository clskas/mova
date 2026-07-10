import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:latlong2/latlong.dart';
import '../../core/api/api_client.dart';
import '../../core/billing/service_price_display.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/location/destination_coords.dart';
import '../../core/location/destination_field_sync.dart';
import '../../core/location/service_area_location.dart';
import '../../core/location/service_areas.dart';
import '../../core/location/location_service.dart';
import '../../core/widgets/destination_coord_panel.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import '../../widgets/promo_code_field.dart';
import '../booking/widgets/mova_ride_map.dart';
import 'parcel_tracking_screen.dart';

/// Livraison express — flux colis simplifié (petit colis, sans photo).
class ExpressDeliveryScreen extends ConsumerStatefulWidget {
  const ExpressDeliveryScreen({super.key});

  @override
  ConsumerState<ExpressDeliveryScreen> createState() => _ExpressDeliveryScreenState();
}

class _ExpressDeliveryScreenState extends ConsumerState<ExpressDeliveryScreen> {
  final _pickupController = TextEditingController(text: 'Ma position');
  final _dropoffController = TextEditingController();
  final _promoController = TextEditingController();
  LatLng _pickup = MovaRideMap.mapDefaultCenter();
  LatLng? _dropoff;
  bool _dropoffFromManualCoords = false;
  bool _dropoffFromSuggestion = false;
  List<Map<String, dynamic>> _suggestions = [];
  List<Map<String, dynamic>> _pickupSuggestions = [];
  Timer? _debounce;
  Timer? _pickupDebounce;
  bool _loadingSuggestions = false;
  bool _loadingPickupSuggestions = false;
  bool _showSuggestions = false;
  bool _showPickupSuggestions = false;
  bool _pickupFromSuggestion = false;
  bool _pickupFromGps = false;
  int? _estimatedPrice;
  Map<String, dynamic>? _priceBreakdown;
  bool _loading = false;
  bool _loadingGps = false;
  bool _loadingDropoffGps = false;
  String? _error;
  String? _validationError;

  @override
  void initState() {
    super.initState();
    _dropoffController.addListener(_onDropoffChanged);
    WidgetsBinding.instance.addPostFrameCallback((_) => _useMyLocation());
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _pickupDebounce?.cancel();
    _dropoffController.removeListener(_onDropoffChanged);
    _pickupController.dispose();
    _dropoffController.dispose();
    _promoController.dispose();
    super.dispose();
  }

  void _onPickupChanged() {
    _pickupDebounce?.cancel();
    _pickupDebounce = Timer(const Duration(milliseconds: 350), _fetchPickupSuggestions);
    setState(() {
      _estimatedPrice = null;
      _pickupFromSuggestion = false;
      _pickupFromGps = false;
    });
  }

  Future<void> _fetchPickupSuggestions() async {
    final query = _pickupController.text.trim();
    if (query.length < 2 || query == 'Ma position') {
      setState(() {
        _pickupSuggestions = [];
        _showPickupSuggestions = false;
      });
      return;
    }
    setState(() => _loadingPickupSuggestions = true);
    final api = ref.read(apiClientProvider);
    final result = await api.geoAutocomplete(query, city: ServiceAreas.cityNameForCoords(_pickup));
    if (!mounted) return;
    setState(() {
      _loadingPickupSuggestions = false;
      switch (result) {
        case Success(:final data):
          _pickupSuggestions = data;
          _showPickupSuggestions = data.isNotEmpty;
        case Failure():
          _pickupSuggestions = [];
          _showPickupSuggestions = false;
      }
    });
  }

  void _selectPickupSuggestion(Map<String, dynamic> suggestion) {
    final label = suggestion['label']?.toString() ?? suggestion['address']?.toString() ?? '';
    _pickupController.text = label;
    _pickup = ServiceAreaLocation.ensureInServiceArea(
      LatLng(
        (suggestion['lat'] as num?)?.toDouble() ?? MarketConfig.defaultLat,
        (suggestion['lng'] as num?)?.toDouble() ?? MarketConfig.defaultLng,
      ),
      address: label,
    );
    setState(() {
      _showPickupSuggestions = false;
      _pickupSuggestions = [];
      _estimatedPrice = null;
      _pickupFromSuggestion = true;
      _pickupFromGps = false;
    });
  }

  void _onDropoffChanged() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), _fetchSuggestions);
    setState(() {
      _estimatedPrice = null;
      _dropoffFromManualCoords = false;
      _dropoffFromSuggestion = false;
    });
  }

  Future<void> _fetchSuggestions() async {
    final query = _dropoffController.text.trim();
    if (query.length < 2) {
      setState(() {
        _suggestions = [];
        _showSuggestions = false;
      });
      return;
    }
    setState(() => _loadingSuggestions = true);
    final api = ref.read(apiClientProvider);
    final result = await api.geoAutocomplete(query, city: ServiceAreas.cityNameForCoords(_pickup));
    if (!mounted) return;
    setState(() {
      _loadingSuggestions = false;
      switch (result) {
        case Success(:final data):
          _suggestions = data;
          _showSuggestions = data.isNotEmpty;
        case Failure():
          _suggestions = [];
          _showSuggestions = false;
      }
    });
  }

  void _selectSuggestion(Map<String, dynamic> suggestion) {
    final label = suggestion['label']?.toString() ?? suggestion['address']?.toString() ?? '';
    DestinationFieldSync.setText(_dropoffController, _onDropoffChanged, label);
    _dropoff = ServiceAreaLocation.ensureInServiceArea(
      LatLng(
        (suggestion['lat'] as num?)?.toDouble() ?? MarketConfig.defaultLat,
        (suggestion['lng'] as num?)?.toDouble() ?? MarketConfig.defaultLng,
      ),
      address: label,
    );
    setState(() {
      _showSuggestions = false;
      _suggestions = [];
      _estimatedPrice = null;
      _dropoffFromManualCoords = false;
      _dropoffFromSuggestion = true;
    });
  }

  void _setDropoffFromCoords(LatLng coords, String label) {
    _dropoff = coords;
    _dropoffController.text = label;
    setState(() {
      _estimatedPrice = null;
      _dropoffFromManualCoords = true;
      _dropoffFromSuggestion = false;
    });
  }

  Future<void> _onMapDropoffTap(LatLng raw) async {
    if (!ServiceAreaLocation.isInBounds(raw)) {
      if (mounted) setState(() => _validationError = ServiceAreaLocation.outOfAreaMessage());
      return;
    }
    _setDropoffFromCoords(raw, LocationService.coordsLabel(raw));
    final label = await ServiceAreaLocation.labelForCoords(raw);
    if (!mounted || !_dropoffFromManualCoords) return;
    _dropoffController.text = label;
    setState(() {});
  }

  Future<String?> _resolveCoords() async {
    final pickupText = _pickupController.text.trim();
    final pickupFromText = DestinationCoords.parseText(pickupText);
    if (pickupFromText != null && ServiceAreaLocation.isInBounds(pickupFromText)) {
      _pickup = pickupFromText;
    } else if ((_pickupFromGps || _pickupFromSuggestion) && ServiceAreaLocation.isInBounds(_pickup)) {
      // Coordonnées déjà fixées par GPS ou autocomplétion.
    } else if (pickupText.isNotEmpty && pickupText != 'Ma position') {
      final api = ref.read(apiClientProvider);
      final pickupResult = await api.geoAutocomplete(
        pickupText,
        city: ServiceAreas.cityNameForCoords(_pickup),
      );
      if (pickupResult case Success(:final data) when data.isNotEmpty) {
        final s = data.first;
        _pickup = ServiceAreaLocation.ensureInServiceArea(
          LatLng(
            (s['lat'] as num?)?.toDouble() ?? MarketConfig.defaultLat,
            (s['lng'] as num?)?.toDouble() ?? MarketConfig.defaultLng,
          ),
          address: pickupText,
        );
        _pickupFromSuggestion = true;
        _pickupFromGps = false;
      } else {
        return 'Adresse d\'enlèvement non reconnue — utilisez le GPS, l\'autocomplétion MOVA ou les coordonnées.';
      }
    } else if (ServiceAreaLocation.isInBounds(_pickup)) {
      _pickup = ServiceAreaLocation.ensureInServiceArea(
        _pickup,
        address: pickupText.isEmpty ? 'Ma position' : pickupText,
      );
    } else {
      return 'Impossible de déterminer l\'enlèvement. Activez le GPS ou choisissez une adresse dans la liste.';
    }

    if (_dropoffFromManualCoords && _dropoff != null && ServiceAreaLocation.isInBounds(_dropoff!)) {
      return _validateDistinctEndpoints();
    }

    final fromTextCoords = DestinationCoords.parseText(_dropoffController.text);
    if (fromTextCoords != null && ServiceAreaLocation.isInBounds(fromTextCoords)) {
      _dropoff = fromTextCoords;
      _dropoffFromManualCoords = true;
      _dropoffFromSuggestion = false;
      return _validateDistinctEndpoints();
    }

    if (_dropoff != null && _dropoffFromSuggestion && ServiceAreaLocation.isInBounds(_dropoff!)) {
      return _validateDistinctEndpoints();
    }

    final api = ref.read(apiClientProvider);
    final result = await api.geoAutocomplete(
      _dropoffController.text.trim(),
      city: ServiceAreas.cityNameForCoords(_pickup),
    );
    if (result case Success(:final data) when data.isNotEmpty) {
      final s = data.first;
      _dropoff = ServiceAreaLocation.ensureInServiceArea(
        LatLng(
          (s['lat'] as num?)?.toDouble() ?? MarketConfig.defaultLat,
          (s['lng'] as num?)?.toDouble() ?? MarketConfig.defaultLng,
        ),
        address: _dropoffController.text,
      );
      _dropoffFromSuggestion = true;
      return _validateDistinctEndpoints();
    }

    return 'Adresse non reconnue — utilisez le GPS, l\'autocomplétion MOVA ou les coordonnées.';
  }

  String? _validateDistinctEndpoints() {
    final dropoff = _dropoff;
    if (dropoff == null) return 'Indiquez l\'adresse de livraison.';
    final samePoint =
        (dropoff.latitude - _pickup.latitude).abs() < 0.00005 &&
        (dropoff.longitude - _pickup.longitude).abs() < 0.00005;
    if (samePoint) {
      return 'Le point de livraison doit être différent de l\'enlèvement.';
    }
    return null;
  }

  Map<String, dynamic> _payload() {
    final dropoff = _dropoff!;
    return {
      'pickupLat': _pickup.latitude,
      'pickupLng': _pickup.longitude,
      'pickupAddress': _pickupController.text.trim(),
      'dropoffLat': dropoff.latitude,
      'dropoffLng': dropoff.longitude,
      'dropoffAddress': _dropoffController.text.trim(),
      'weightCategory': 'SMALL',
      'express': true,
      if (_promoController.text.trim().isNotEmpty) 'promoCode': _promoController.text.trim(),
    };
  }

  String? _validate() {
    if (_pickupController.text.trim().isEmpty) return 'Indiquez l\'adresse d\'enlèvement.';
    if (_dropoffController.text.trim().length < 3) return 'Indiquez l\'adresse de livraison.';
    return null;
  }

  Future<void> _useMyLocation() async {
    setState(() => _loadingGps = true);
    final result = await LocationService.getCurrentLocation();
    if (!mounted) return;
    setState(() {
      _loadingGps = false;
      if (result != null) {
        _pickup = ServiceAreaLocation.ensureInServiceArea(
          result.position,
          address: result.label,
        );
        _pickupController.text = ServiceAreaLocation.isInBounds(result.position)
            ? result.label
            : 'Ma position';
        _pickupFromSuggestion = false;
        _pickupFromGps = true;
        _estimatedPrice = null;
      }
    });
  }

  Future<void> _useMyLocationForDropoff() async {
    setState(() {
      _loadingDropoffGps = true;
      _validationError = null;
    });
    final result = await LocationService.getCurrentLocation();
    if (!mounted) return;
    if (result == null) {
      setState(() {
        _loadingDropoffGps = false;
        _validationError =
            'Impossible d\'obtenir votre position. Activez le GPS et autorisez la localisation.';
      });
      return;
    }
    final coords = ServiceAreaLocation.ensureInServiceArea(
      result.position,
      address: result.label,
    );
    final label = ServiceAreaLocation.isInBounds(result.position)
        ? result.label
        : LocationService.coordsLabel(coords);
    DestinationFieldSync.setText(_dropoffController, _onDropoffChanged, label);
    setState(() {
      _loadingDropoffGps = false;
      _dropoff = coords;
      _dropoffFromManualCoords = true;
      _dropoffFromSuggestion = false;
      _showSuggestions = false;
      _suggestions = [];
      _estimatedPrice = null;
    });
  }

  Future<void> _estimate() async {
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
    final coordError = await _resolveCoords();
    if (!mounted) return;
    if (coordError != null) {
      setState(() {
        _loading = false;
        _validationError = coordError;
      });
      return;
    }
    setState(() {});
    final api = ref.read(apiClientProvider);
    await api.checkHealth();
    final result = await api.post('/express/estimate', _payload());
    if (!mounted) return;
    setState(() {
      _loading = false;
      switch (result) {
        case Success(:final data):
          _estimatedPrice = (data['estimatedPriceCdf'] as num?)?.toInt();
          _priceBreakdown = data['priceBreakdown'] is Map
              ? Map<String, dynamic>.from(data['priceBreakdown'] as Map)
              : null;
        case Failure(:final error):
          _error = error.message;
      }
    });
  }

  Future<void> _confirm() async {
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
    final coordError = await _resolveCoords();
    if (!mounted) return;
    if (coordError != null) {
      setState(() {
        _loading = false;
        _validationError = coordError;
      });
      return;
    }
    final api = ref.read(apiClientProvider);
    final result = await api.post('/express', _payload());
    if (!mounted) return;
    setState(() => _loading = false);
    switch (result) {
      case Success(:final data):
        final delivery = data['delivery'] as Map<String, dynamic>?;
        if (delivery != null && mounted) {
          Navigator.pushReplacement(
            context,
            MaterialPageRoute(
              builder: (_) => ParcelTrackingScreen(parcelId: delivery['id'] as String),
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

    return MovaScreen(
      title: 'Livraison express',
      scrollable: false,
      padding: EdgeInsets.zero,
      child: MovaMapFormLayout(
        maxMapHeight: 160,
        mapBuilder: (height) => MovaRideMap(
          pickup: _pickup,
          dropoff: _dropoff,
          height: height,
          onDropoffTap: _onMapDropoffTap,
          dropoffEditable: true,
          pickupLabel: _pickupController.text,
          dropoffLabel: _dropoffController.text,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
                  Text(
                    'Envoi urgent — livraison en moins de 45 min.',
                    style: theme.textTheme.bodyMedium?.copyWith(color: MovaColors.textSecondary),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: _pickupController,
                    decoration: InputDecoration(
                      labelText: 'Enlèvement',
                      hintText: 'Ma position ou nom du lieu (ex: Marché Central)',
                      prefixIcon: const Icon(Icons.upload_outlined),
                      suffixIcon: _loadingGps
                          ? const Padding(
                              padding: EdgeInsets.all(12),
                              child: SizedBox(
                                width: 18,
                                height: 18,
                                child: CircularProgressIndicator(strokeWidth: 2),
                              ),
                            )
                          : IconButton(
                              icon: const Icon(Icons.gps_fixed, color: MovaColors.orange),
                              onPressed: _loadingGps ? null : _useMyLocation,
                            ),
                    ),
                    onChanged: (_) => _onPickupChanged(),
                  ),
                  if (_showPickupSuggestions && _pickupSuggestions.isNotEmpty)
                    MovaCard(
                      margin: const EdgeInsets.only(top: 4),
                      padding: EdgeInsets.zero,
                      child: Column(
                        children: _pickupSuggestions.map((s) {
                          final label = s['label']?.toString() ?? s['address']?.toString() ?? '';
                          return ListTile(
                            dense: true,
                            leading: const Icon(Icons.location_on_outlined, size: 20),
                            title: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis),
                            onTap: () => _selectPickupSuggestion(s),
                          );
                        }).toList(),
                      ),
                    ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _dropoffController,
                    textInputAction: TextInputAction.done,
                    decoration: InputDecoration(
                      labelText: 'Adresse de livraison',
                      hintText: 'Ex: Gombe, Limete, Boikene…',
                      helperText: 'Saisissez l\'adresse ou utilisez le GPS',
                      helperMaxLines: 2,
                      prefixIcon: const Icon(Icons.place_outlined),
                      suffixIcon: _loadingDropoffGps || _loadingSuggestions
                          ? const Padding(
                              padding: EdgeInsets.all(12),
                              child: SizedBox(
                                width: 18,
                                height: 18,
                                child: CircularProgressIndicator(strokeWidth: 2),
                              ),
                            )
                          : IconButton(
                              icon: const Icon(Icons.gps_fixed, color: MovaColors.orange),
                              tooltip: 'Ma position',
                              onPressed: _useMyLocationForDropoff,
                            ),
                    ),
                  ),
                  if (_showSuggestions && _suggestions.isNotEmpty)
                    MovaCard(
                      margin: const EdgeInsets.only(top: 4),
                      padding: EdgeInsets.zero,
                      child: Column(
                        children: _suggestions.map((s) {
                          final label = s['label']?.toString() ?? s['address']?.toString() ?? '';
                          return ListTile(
                            dense: true,
                            leading: const Icon(Icons.location_on_outlined, size: 20),
                            title: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis),
                            onTap: () => _selectSuggestion(s),
                          );
                        }).toList(),
                      ),
                    ),
                  DestinationCoordPanel(
                    initialLat: _dropoff?.latitude,
                    initialLng: _dropoff?.longitude,
                    onApply: _setDropoffFromCoords,
                  ),
                  const SizedBox(height: 12),
                  const MovaCard(
                    child: Row(
                      children: [
                        Icon(Icons.flash_on, color: MovaColors.orange),
                        SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            'Petit colis (< 1 kg) — priorité livreur',
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (_estimatedPrice != null) ...[
                    const SizedBox(height: 16),
                    ServicePriceDisplay.estimateCard(
                      totalCdf: _estimatedPrice!,
                      priceBreakdown: _priceBreakdown,
                      totalLabel: 'Tarif express',
                    ),
                  ],
                  if (_validationError != null) ...[
                    const SizedBox(height: 16),
                    MovaErrorBanner(message: _validationError!),
                  ],
                  PromoCodeField(
                    controller: _promoController,
                    onChanged: () => setState(() => _estimatedPrice = null),
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 16),
                    MovaErrorBanner(message: _error!, onRetry: _estimate),
                  ],
                  const SizedBox(height: 24),
                  MovaButton(
                    label: _estimatedPrice == null ? 'Estimer' : 'Commander express',
                    isLoading: _loading,
                    icon: Icons.bolt_outlined,
                    onPressed: _loading ? null : (_estimatedPrice == null ? _estimate : _confirm),
                  ),
          ],
        ),
      ),
    );
  }
}

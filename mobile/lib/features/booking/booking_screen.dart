import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:latlong2/latlong.dart';
import '../../core/api/api_client.dart';
import '../../core/config/test_runtime_config.dart';
import '../../core/location/destination_coords.dart';
import '../../core/location/location_service.dart';
import '../../core/widgets/destination_coord_panel.dart';
import '../../core/location/service_area_location.dart';
import '../../core/location/service_area_prefs.dart';
import '../../core/location/service_areas.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/geo_autocomplete_field.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import '../../widgets/promo_code_field.dart';
import 'matching_screen.dart';
import 'tracking_screen.dart';
import '../geo/suggest_place_screen.dart';
import 'widgets/mova_ride_map.dart';
import 'widgets/vehicle_selector.dart';

class BookingScreen extends ConsumerStatefulWidget {
  const BookingScreen({
    super.key,
    this.initialPickupAddress,
    this.initialDropoffAddress,
    this.initialVehicleType,
  });

  final String? initialPickupAddress;
  final String? initialDropoffAddress;
  final String? initialVehicleType;

  @override
  ConsumerState<BookingScreen> createState() => _BookingScreenState();
}

class _BookingScreenState extends ConsumerState<BookingScreen> {
  final _pickupController = TextEditingController(text: 'Ma position');
  final _destinationController = TextEditingController();
  final _promoController = TextEditingController();

  String _vehicleType = 'MOTO_TAXI';
  LatLng _pickup = ServiceAreaLocation.defaultCenter;
  LatLng? _dropoff;
  bool _dropoffFromSuggestion = false;
  bool _dropoffFromManualCoords = false;
  Map<String, VehicleEstimate> _estimates = {};
  Map<String, Map<String, dynamic>> _estimateDetails = {};
  Map<String, dynamic>? _selectedEstimate;
  bool _loadingEstimate = false;
  bool _loadingConfirm = false;
  bool _loadingGps = false;
  String? _error;
  String? _validationError;
  bool _pickupFromGps = true;
  bool _pickupFromSuggestion = false;
  List<Map<String, dynamic>> _poiPlaces = [];
  String? _poiCategoryFilter;
  int _poiLoadGeneration = 0;

  static const _poiFilters = [
    (null, 'Tous'),
    ('MARKET', 'Marchés'),
    ('HOSPITAL', 'Hôpitaux'),
    ('UNIVERSITY', 'Universités'),
    ('PHARMACY', 'Pharmacies'),
  ];

  @override
  void initState() {
    super.initState();
    if (widget.initialPickupAddress != null && widget.initialPickupAddress!.trim().isNotEmpty) {
      _pickupController.text = widget.initialPickupAddress!.trim();
      _pickupFromGps = false;
    }
    if (widget.initialDropoffAddress != null && widget.initialDropoffAddress!.trim().isNotEmpty) {
      _destinationController.text = widget.initialDropoffAddress!.trim();
    }
    if (widget.initialVehicleType != null && widget.initialVehicleType!.trim().isNotEmpty) {
      _vehicleType = widget.initialVehicleType!.trim();
    }
    if (!movaDisableAutoGps && widget.initialPickupAddress == null) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _useMyLocation());
    } else {
      WidgetsBinding.instance.addPostFrameCallback((_) => _loadNearbyPoi());
    }
    WidgetsBinding.instance.addPostFrameCallback((_) => _checkUnpaidRide());
  }

  Future<void> _loadNearbyPoi() async {
    final generation = ++_poiLoadGeneration;
    final city = ServiceAreas.cityNameForCoords(_pickup);
    final result = await ref.read(apiClientProvider).geoPlaces(
      city: city,
      lat: _pickup.latitude,
      lng: _pickup.longitude,
      radiusKm: 8,
      skipCache: true,
    );
    if (!mounted || generation != _poiLoadGeneration) return;
    if (result case Success(:final data)) {
      setState(() => _poiPlaces = data);
    }
  }

  Future<void> _checkUnpaidRide() async {
    final api = ref.read(apiClientProvider);
    final result = await api.getUnpaidRide();
    if (!mounted) return;
    if (result case Success(:final data?) when data['id'] != null) {
      final rideId = data['id'].toString();
      final amount = (data['finalFareCdf'] ?? data['estimatedFareCdf'] ?? 0) as int;
      await showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Paiement en attente'),
          content: const Text(
            'Vous avez une course terminée non payée. Réglez le paiement avant d\'en commander une nouvelle.',
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Fermer')),
            FilledButton(
              onPressed: () {
                Navigator.pop(ctx);
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => TrackingScreen(
                      rideId: rideId,
                      estimatedFareCdf: amount,
                    ),
                  ),
                );
              },
              child: const Text('Payer maintenant'),
            ),
          ],
        ),
      );
    }
  }

  @override
  void dispose() {
    _pickupController.dispose();
    _destinationController.dispose();
    _promoController.dispose();
    super.dispose();
  }

  String get _autocompleteCity => ServiceAreas.autocompleteCity(
        coords: _pickup,
        preferredArea: ref.read(selectedServiceAreaProvider),
      );

  void _onPickupSuggestionSelected(Map<String, dynamic> suggestion) {
    final label = suggestion['label']?.toString() ??
        suggestion['address']?.toString() ??
        '';
    final lat = (suggestion['lat'] as num?)?.toDouble();
    final lng = (suggestion['lng'] as num?)?.toDouble();
    if (lat == null || lng == null) return;
    setState(() {
      _pickup = ServiceAreaLocation.ensureInServiceArea(LatLng(lat, lng), address: label);
      _pickupController.text = label;
      _pickupFromSuggestion = true;
      _pickupFromGps = false;
      _selectedEstimate = null;
      _estimates = {};
    });
    if (_destinationController.text.trim().isNotEmpty) {
      _fetchAllEstimates();
    }
    _loadNearbyPoi();
  }

  void _onPickupUserInput() {
    setState(() {
      _pickupFromGps = false;
      _pickupFromSuggestion = false;
      _validationError = null;
      _selectedEstimate = null;
      _estimates = {};
    });
  }

  void _onDestinationUserInput() {
    setState(() {
      _selectedEstimate = null;
      _estimates = {};
      _dropoff = null;
      _dropoffFromSuggestion = false;
      _dropoffFromManualCoords = false;
    });
  }

  void _onDestinationSuggestionSelected(Map<String, dynamic> suggestion) {
    final label = suggestion['label']?.toString() ??
        suggestion['address']?.toString() ??
        '';
    _destinationController.text = label;
    _dropoff = ServiceAreaLocation.ensureInServiceArea(
      LatLng(
        (suggestion['lat'] as num?)?.toDouble() ?? MarketConfig.defaultLat - 0.03,
        (suggestion['lng'] as num?)?.toDouble() ?? MarketConfig.defaultLng + 0.04,
      ),
      address: label,
    );
    setState(() {
      _dropoffFromSuggestion = true;
      _dropoffFromManualCoords = false;
    });
    _fetchAllEstimates();
  }

  int get _visiblePoiCount {
    if (_poiCategoryFilter == null) return _poiPlaces.length;
    return _poiPlaces.where((p) => p['category']?.toString() == _poiCategoryFilter).length;
  }

  void _setDropoffFromCoords(LatLng coords, String label) {
    _dropoff = ServiceAreaLocation.ensureInServiceArea(coords, address: label);
    _destinationController.text = label;
    setState(() {
      _dropoffFromSuggestion = false;
      _dropoffFromManualCoords = true;
      _selectedEstimate = null;
      _estimates = {};
    });
    _fetchAllEstimates();
  }

  Future<void> _onMapDropoffTap(LatLng raw) async {
    if (!ServiceAreaLocation.isInBounds(raw)) {
      if (mounted) setState(() => _validationError = ServiceAreaLocation.outOfAreaMessage());
      return;
    }
    final coords = raw;
    _setDropoffFromCoords(coords, LocationService.coordsLabel(coords));
    final label = await ServiceAreaLocation.labelForCoords(coords);
    if (!mounted || !_dropoffFromManualCoords) return;
    _destinationController.text = label;
    setState(() {});
  }

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
    setState(() {
      _loadingGps = false;
      _pickup = ServiceAreaLocation.ensureInServiceArea(
        result.position,
        address: result.label,
      );
      _pickupController.text = result.label;
      _pickupFromGps = true;
      _pickupFromSuggestion = false;
      _selectedEstimate = null;
      _estimates = {};
    });
    if (_destinationController.text.trim().isNotEmpty) {
      await _fetchAllEstimates();
    }
    await _loadNearbyPoi();
  }

  Future<String?> _resolveCoords() async {
    if (!_pickupFromGps) {
      if (_pickupFromSuggestion && ServiceAreaLocation.isInBounds(_pickup)) {
        _pickup = ServiceAreaLocation.ensureInServiceArea(
          _pickup,
          address: _pickupController.text,
        );
      } else {
        var resolved = ServiceAreaLocation.coordsFromAddress(
          _pickupController.text,
          near: _pickup,
        );
        if (!ServiceAreaLocation.isInBounds(resolved)) {
          final api = ref.read(apiClientProvider);
          final result = await api.geoAutocomplete(
            _pickupController.text.trim(),
            city: ServiceAreas.cityNameForCoords(_pickup),
          );
          if (result case Success(:final data) when data.isNotEmpty) {
            final s = data.first;
            resolved = LatLng(
              (s['lat'] as num?)?.toDouble() ?? MarketConfig.defaultLat,
              (s['lng'] as num?)?.toDouble() ?? MarketConfig.defaultLng,
            );
            if (ServiceAreaLocation.isInBounds(resolved)) {
              _pickup = resolved;
              _pickupFromSuggestion = true;
            } else {
              return 'Point de départ hors zone SENGA.';
            }
          } else {
            return 'Adresse de départ introuvable — choisissez une suggestion ou utilisez le GPS.';
          }
        }
        _pickup = ServiceAreaLocation.ensureInServiceArea(
          resolved,
          address: _pickupController.text,
        );
      }
    } else {
      _pickup = ServiceAreaLocation.ensureInServiceArea(
        _pickup,
        address: _pickupController.text,
      );
    }

    if (_dropoffFromManualCoords && _dropoff != null && ServiceAreaLocation.isInBounds(_dropoff!)) {
      return null;
    }

    final fromTextCoords = DestinationCoords.parseText(_destinationController.text);
    if (fromTextCoords != null && ServiceAreaLocation.isInBounds(fromTextCoords)) {
      _dropoff = fromTextCoords;
      _dropoffFromManualCoords = true;
      _dropoffFromSuggestion = false;
      return null;
    }

    if (_dropoff == null || !ServiceAreaLocation.isInBounds(_dropoff!)) {
      var resolved = ServiceAreaLocation.coordsFromAddress(
        _destinationController.text,
        near: _pickup,
      );
      if (!ServiceAreaLocation.destinationInServiceArea(
        _destinationController.text,
        coords: resolved,
        fromSuggestion: _dropoffFromSuggestion,
      )) {
        final api = ref.read(apiClientProvider);
        final result = await api.geoAutocomplete(
          _destinationController.text.trim(),
          city: ServiceAreas.cityNameForCoords(_pickup),
        );
        if (result case Success(:final data) when data.isNotEmpty) {
          final s = data.first;
          resolved = LatLng(
            (s['lat'] as num?)?.toDouble() ?? MarketConfig.defaultLat,
            (s['lng'] as num?)?.toDouble() ?? MarketConfig.defaultLng,
          );
          if (ServiceAreaLocation.isInBounds(resolved)) {
            _dropoff = resolved;
            _dropoffFromSuggestion = true;
            return null;
          }
        }
        return ServiceAreaLocation.outOfAreaMessage();
      }
      _dropoff = ServiceAreaLocation.ensureInServiceArea(
        resolved,
        address: _destinationController.text,
      );
    } else if (!ServiceAreaLocation.destinationInServiceArea(
      _destinationController.text,
      coords: _dropoff,
      fromSuggestion: _dropoffFromSuggestion,
    )) {
      return ServiceAreaLocation.outOfAreaMessage();
    }
    return null;
  }

  Map<String, dynamic> _estimatePayload(String vehicleType) {
    final dropoff = _dropoff ?? ServiceAreaLocation.defaultDropoffOffset(near: _pickup);
    return {
      'pickupLat': _pickup.latitude,
      'pickupLng': _pickup.longitude,
      'dropoffLat': dropoff.latitude,
      'dropoffLng': dropoff.longitude,
      'vehicleType': MarketConfig.apiVehicleType(vehicleType),
      if (_promoController.text.trim().isNotEmpty) 'promoCode': _promoController.text.trim(),
    };
  }

  String? _validate() {
    if (_pickupController.text.trim().isEmpty) {
      return 'Indiquez le point de départ.';
    }
    if (_destinationController.text.trim().isEmpty) {
      return 'Indiquez votre destination.';
    }
    return null;
  }

  Future<void> _fetchAllEstimates() async {
    final validation = _validate();
    if (validation != null) {
      setState(() => _validationError = validation);
      return;
    }
    setState(() {
      _loadingEstimate = true;
      _error = null;
      _validationError = null;
      _estimates = {
        for (final v in MarketConfig.vehicleTypes)
          v.id: VehicleEstimate(vehicleType: v.id, loading: true),
      };
    });
    try {
      final coordError = await _resolveCoords();
      if (!mounted) return;
      if (coordError != null) {
        setState(() {
          _loadingEstimate = false;
          _validationError = coordError;
          _estimates = {};
        });
        return;
      }

      final api = ref.read(apiClientProvider);
      await api.checkHealth();

      final results = await Future.wait(
        MarketConfig.vehicleTypes.map((v) async {
          final payload = _estimatePayload(v.id);
          final result = await api.post('/rides/estimate', payload);
          return (v.id, result);
        }),
      );

      if (!mounted) return;
      final estimates = <String, VehicleEstimate>{};
      Map<String, dynamic>? selectedData;
      String? errorMessage;
      for (final (type, result) in results) {
        switch (result) {
          case Success(:final data):
            final price = (data['estimatedFareCdf'] ?? data['estimatedPriceCdf']) as int?;
            final enriched = Map<String, dynamic>.from(data);
            estimates[type] = VehicleEstimate(vehicleType: type, priceCdf: price);
            _estimateDetails[type] = enriched;
            if (type == _vehicleType) selectedData = enriched;
          case Failure(:final error):
            estimates[type] = VehicleEstimate(vehicleType: type);
            errorMessage ??= error.message;
        }
      }
      if (selectedData == null) {
        errorMessage ??= 'Estimation indisponible. Réessayez.';
      }

      setState(() {
        _loadingEstimate = false;
        _estimates = estimates;
        _selectedEstimate = selectedData;
        _error = selectedData == null ? errorMessage : null;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loadingEstimate = false;
        _estimates = {};
        _error = 'Estimation indisponible. Réessayez.';
      });
    }
  }

  void _onVehicleSelected(String type) {
    setState(() {
      _vehicleType = type;
      _selectedEstimate = _estimateDetails[type];
    });
  }

  String _selectedVehicleLabel() {
    for (final v in MarketConfig.vehicleTypes) {
      if (v.id == _vehicleType) return v.label;
    }
    return _vehicleType;
  }

  Future<void> _confirmRide() async {
    final validation = _validate();
    if (validation != null) {
      setState(() => _validationError = validation);
      return;
    }
    if (_selectedEstimate == null) {
      await _fetchAllEstimates();
      if (_selectedEstimate == null) {
        setState(() => _validationError = 'Estimation indisponible. Réessayez.');
        return;
      }
    }

    final coordError = await _resolveCoords();
    if (!mounted) return;
    if (coordError != null) {
      setState(() => _validationError = coordError);
      return;
    }

    setState(() {
      _loadingConfirm = true;
      _error = null;
      _validationError = null;
    });

    final api = ref.read(apiClientProvider);
    final result = await api.createRide({
      ..._estimatePayload(_vehicleType),
      'vehicleType': MarketConfig.apiVehicleType(_vehicleType),
      'pickupAddress': _pickupController.text.trim(),
      'dropoffAddress': _destinationController.text.trim(),
    });

    if (!mounted) return;
    setState(() => _loadingConfirm = false);

    switch (result) {
      case Success(:final data):
        final rideId = data['id'] as String?;
        if (rideId != null) {
          Navigator.pushReplacement(
            context,
            MaterialPageRoute(
              builder: (_) => MatchingScreen(
                rideId: rideId,
                pickupAddress: _pickupController.text.trim(),
                dropoffAddress: _destinationController.text.trim(),
                estimatedFareCdf: (_selectedEstimate?['estimatedFareCdf'] ??
                        _selectedEstimate?['estimatedPriceCdf']) as int? ??
                    0,
              ),
            ),
          );
        }
      case Failure(:final error):
        setState(() => _error = error.message);
    }
  }

  String? get _peakLabel {
    final multiplier = (_selectedEstimate?['surchargeMultiplier'] as num?)?.toDouble();
    if (multiplier != null && multiplier > 1.0) {
      final pct = ((multiplier - 1) * 100).round();
      return 'Heure de pointe (+$pct %)';
    }
    return _selectedEstimate?['peakHourLabel']?.toString();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final distance = (_selectedEstimate?['distanceKm'] as num?)?.toDouble();
    final duration = (_selectedEstimate?['durationMin'] ?? _selectedEstimate?['etaMinutes']) as num?;
    final total = (_selectedEstimate?['estimatedFareCdf'] ??
        _selectedEstimate?['estimatedPriceCdf']) as int?;
    final api = ref.read(apiClientProvider);
    final autocompleteCity = _autocompleteCity;

    return MovaScreen(
      title: 'Taxi / Moto-taxi',
      scrollable: false,
      padding: EdgeInsets.zero,
      actions: [
        IconButton(
          icon: const Icon(Icons.add_location_alt_outlined),
          tooltip: 'Suggérer un lieu',
          onPressed: () {
            Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const SuggestPlaceScreen()),
            );
          },
        ),
      ],
      child: MovaMapFormLayout(
        maxMapHeight: 190,
        mapBuilder: (height) => MovaRideMap(
          pickup: _pickup,
          dropoff: _dropoff,
          height: height,
          onDropoffTap: _onMapDropoffTap,
          dropoffEditable: true,
          pickupLabel: _pickupController.text,
          dropoffLabel: _destinationController.text,
          places: _poiPlaces,
          placesCategoryFilter: _poiCategoryFilter,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  ..._poiFilters.map((f) {
                  final selected = _poiCategoryFilter == f.$1;
                  return Padding(
                    padding: const EdgeInsets.only(right: 8, bottom: 8),
                    child: FilterChip(
                      label: Text(f.$2),
                      selected: selected,
                      onSelected: (on) => setState(() => _poiCategoryFilter = on ? f.$1 : null),
                    ),
                  );
                }),
                  ActionChip(
                    avatar: const Icon(Icons.add_location_alt_outlined, size: 18, color: MovaColors.green),
                    label: const Text('Suggérer un lieu'),
                    onPressed: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(builder: (_) => const SuggestPlaceScreen()),
                      );
                    },
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text(
                _poiPlaces.isEmpty
                    ? 'Lieux d\'intérêt : aucun repère à proximité (rayon 8 km). Activez le GPS ou suggérez un lieu.'
                    : 'Lieux sur la carte : $_visiblePoiCount affiché(s) — filtrent les marqueurs orange uniquement.',
                style: const TextStyle(fontSize: 11, color: MovaColors.textSecondary),
              ),
            ),
            GeoAutocompleteField(
              controller: _pickupController,
              api: api,
              city: autocompleteCity,
              label: 'Départ',
              hint: 'Point de prise en charge',
              prefixIcon: Icons.my_location,
              onUserInput: _onPickupUserInput,
              onSelected: _onPickupSuggestionSelected,
              suffixIcon: IconButton(
                icon: const Icon(Icons.gps_fixed, color: MovaColors.violet),
                tooltip: 'Ma position',
                onPressed: _loadingGps ? null : _useMyLocation,
              ),
            ),
            const SizedBox(height: 12),
            GeoAutocompleteField(
              controller: _destinationController,
              api: api,
              city: autocompleteCity,
              label: 'Destination',
              hint: 'Ex: Gombe, Limete, Masina…',
              prefixIcon: Icons.place,
              onUserInput: _onDestinationUserInput,
              onSelected: _onDestinationSuggestionSelected,
            ),
                  DestinationCoordPanel(
                    initialLat: _dropoff?.latitude,
                    initialLng: _dropoff?.longitude,
                    onApply: _setDropoffFromCoords,
                  ),
                  const SizedBox(height: 16),
                  Text('Choisissez votre véhicule', style: theme.textTheme.titleSmall),
                  const SizedBox(height: 8),
                  VehicleSelector(
                    selected: _vehicleType,
                    estimates: _estimates,
                    onSelected: _onVehicleSelected,
                  ),
                  if (_selectedEstimate != null && total != null) ...[
                    const SizedBox(height: 16),
                    MovaCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: Text(
                                  'Estimation · ${_selectedVehicleLabel()}',
                                  style: const TextStyle(fontSize: 16),
                                ),
                              ),
                              Flexible(
                                child: Text(
                                  MarketConfig.formatCdf(total),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  textAlign: TextAlign.end,
                                  style: const TextStyle(
                                    fontSize: 20,
                                    fontWeight: FontWeight.bold,
                                    color: MovaColors.green,
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          _breakdownRow(
                            'Base',
                            (_selectedEstimate!['baseFareCdf'] as num?)?.toInt(),
                          ),
                          _breakdownRow(
                            'Distance',
                            (_selectedEstimate!['distanceFareCdf'] as num?)?.toInt(),
                          ),
                          _breakdownRow(
                            'Durée',
                            (_selectedEstimate!['durationFareCdf'] as num?)?.toInt(),
                          ),
                          if (((_selectedEstimate!['discountCdf'] as num?)?.toInt() ?? 0) > 0) ...[
                            _breakdownRow(
                              'Code promo${_selectedEstimate!['promoCode'] != null ? ' (${_selectedEstimate!['promoCode']})' : ''}',
                              -((_selectedEstimate!['discountCdf'] as num).toInt()),
                            ),
                          ],
                          if (distance != null || duration != null) ...[
                            const Divider(height: 16),
                            Row(
                              children: [
                                if (distance != null) ...[
                                  const Icon(Icons.straighten, size: 16, color: MovaColors.textSecondary),
                                  const SizedBox(width: 4),
                                  Flexible(
                                    child: Text(
                                      '${distance.toStringAsFixed(1)} km',
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ),
                                  const SizedBox(width: 12),
                                ],
                                if (duration != null) ...[
                                  const Icon(Icons.schedule, size: 16, color: MovaColors.textSecondary),
                                  const SizedBox(width: 4),
                                  Flexible(
                                    child: Text(
                                      '${duration.ceil()} min',
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ),
                                ],
                              ],
                            ),
                          ],
                          if (_peakLabel != null) ...[
                            const SizedBox(height: 8),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                              decoration: BoxDecoration(
                                color: MovaColors.orange.withValues(alpha: 0.12),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  const Icon(Icons.access_time_filled, size: 14, color: MovaColors.orange),
                                  const SizedBox(width: 6),
                                  Text(
                                    _peakLabel!,
                                    style: const TextStyle(
                                      color: MovaColors.orange,
                                      fontWeight: FontWeight.w600,
                                      fontSize: 12,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ],
                  if (_validationError != null) ...[
                    const SizedBox(height: 12),
                    MovaErrorBanner(message: _validationError!),
                  ],
                  const SizedBox(height: 16),
                  PromoCodeField(
                    controller: _promoController,
                    onChanged: () => setState(() {
                      _estimates = {};
                      _selectedEstimate = null;
                    }),
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 12),
                    MovaErrorBanner(message: _error!, onRetry: _fetchAllEstimates),
                  ],
                  const SizedBox(height: 16),
                  if (_selectedEstimate == null)
                    MovaButton(
                      label: 'Estimer le prix',
                      isLoading: _loadingEstimate,
                      icon: Icons.calculate_outlined,
                      onPressed: _loadingEstimate ? null : _fetchAllEstimates,
                    )
                  else
                    MovaButton(
                      label: 'Confirmer la course',
                      isLoading: _loadingConfirm,
                      icon: Icons.check_circle_outline,
                      onPressed: _loadingConfirm ? null : _confirmRide,
                    ),
          ],
        ),
      ),
    );
  }

  Widget _breakdownRow(String label, int? amount) {
    if (amount == null) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(color: MovaColors.textSecondary, fontSize: 13)),
          Text(MarketConfig.formatCdf(amount), style: const TextStyle(fontSize: 13)),
        ],
      ),
    );
  }
}

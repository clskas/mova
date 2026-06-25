import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:latlong2/latlong.dart';
import '../../core/api/api_client.dart';
import '../../core/config/test_runtime_config.dart';
import '../../core/location/destination_coords.dart';
import '../../core/location/destination_field_sync.dart';
import '../../core/location/location_service.dart';
import '../../core/widgets/destination_coord_panel.dart';
import '../../core/location/service_area_location.dart';
import '../../core/location/service_areas.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import 'matching_screen.dart';
import 'tracking_screen.dart';
import 'widgets/mova_ride_map.dart';
import 'widgets/vehicle_selector.dart';

class BookingScreen extends ConsumerStatefulWidget {
  const BookingScreen({super.key});

  @override
  ConsumerState<BookingScreen> createState() => _BookingScreenState();
}

class _BookingScreenState extends ConsumerState<BookingScreen> {
  final _pickupController = TextEditingController(text: 'Ma position');
  final _destinationController = TextEditingController();

  String _vehicleType = 'MOTO_TAXI';
  LatLng _pickup = ServiceAreaLocation.defaultCenter;
  LatLng? _dropoff;
  bool _dropoffFromSuggestion = false;
  bool _dropoffFromManualCoords = false;
  Map<String, VehicleEstimate> _estimates = {};
  Map<String, dynamic>? _selectedEstimate;
  List<Map<String, dynamic>> _suggestions = [];
  Timer? _debounce;
  bool _loadingEstimate = false;
  bool _loadingConfirm = false;
  bool _loadingSuggestions = false;
  bool _loadingGps = false;
  String? _error;
  String? _validationError;
  bool _showSuggestions = false;

  @override
  void initState() {
    super.initState();
    _destinationController.addListener(_onDestinationChanged);
    if (!movaDisableAutoGps) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _useMyLocation());
    }
    WidgetsBinding.instance.addPostFrameCallback((_) => _checkUnpaidRide());
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
    _debounce?.cancel();
    _destinationController.removeListener(_onDestinationChanged);
    _pickupController.dispose();
    _destinationController.dispose();
    super.dispose();
  }

  void _onDestinationChanged() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), _fetchSuggestions);
    setState(() {
      _selectedEstimate = null;
      _estimates = {};
      _dropoff = null;
      _dropoffFromSuggestion = false;
      _dropoffFromManualCoords = false;
    });
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
      _selectedEstimate = null;
      _estimates = {};
    });
    if (_destinationController.text.trim().isNotEmpty) {
      await _fetchAllEstimates();
    }
  }

  Future<void> _fetchSuggestions() async {
    final query = _destinationController.text.trim();
    if (query.length < 2) {
      setState(() {
        _suggestions = [];
        _showSuggestions = false;
      });
      return;
    }
    setState(() => _loadingSuggestions = true);
    final api = ref.read(apiClientProvider);
    final nearCity = ServiceAreas.cityNameForCoords(_pickup);
    final result = await api.geoAutocomplete(query, city: nearCity);
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
    final label = suggestion['label']?.toString() ??
        suggestion['address']?.toString() ??
        '';
    DestinationFieldSync.setText(_destinationController, _onDestinationChanged, label);
    _dropoff = ServiceAreaLocation.ensureInServiceArea(
      LatLng(
        (suggestion['lat'] as num?)?.toDouble() ?? MarketConfig.defaultLat - 0.03,
        (suggestion['lng'] as num?)?.toDouble() ?? MarketConfig.defaultLng + 0.04,
      ),
      address: label,
    );
    setState(() {
      _showSuggestions = false;
      _suggestions = [];
      _dropoffFromSuggestion = true;
      _dropoffFromManualCoords = false;
    });
    _fetchAllEstimates();
  }

  void _setDropoffFromCoords(LatLng coords, String label) {
    _dropoff = ServiceAreaLocation.ensureInServiceArea(coords, address: label);
    DestinationFieldSync.setText(_destinationController, _onDestinationChanged, label);
    setState(() {
      _showSuggestions = false;
      _suggestions = [];
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
    DestinationFieldSync.setText(_destinationController, _onDestinationChanged, label);
    setState(() {});
  }

  Future<String?> _resolveCoords() async {
    _pickup = ServiceAreaLocation.ensureInServiceArea(
      _pickup,
      address: _pickupController.text,
    );

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

  Future<void> _onVehicleSelected(String type) async {
    setState(() => _vehicleType = type);
    if (_destinationController.text.trim().isNotEmpty) {
      await _fetchAllEstimates();
    }
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

    return MovaScreen(
      title: 'Taxi / Moto-taxi',
      scrollable: false,
      padding: EdgeInsets.zero,
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
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TextField(
                    controller: _pickupController,
                    decoration: InputDecoration(
                      labelText: 'Départ',
                      hintText: 'Point de prise en charge',
                      prefixIcon: const Icon(Icons.my_location, color: MovaColors.green),
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
                              icon: const Icon(Icons.gps_fixed, color: MovaColors.violet),
                              tooltip: 'Ma position',
                              onPressed: _loadingGps ? null : _useMyLocation,
                            ),
                    ),
                    onChanged: (_) => setState(() => _validationError = null),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _destinationController,
                    decoration: InputDecoration(
                      labelText: 'Destination',
                      hintText: 'Ex: Gombe, Limete, Masina…',
                      prefixIcon: const Icon(Icons.place, color: MovaColors.violet),
                      suffixIcon: _loadingSuggestions
                          ? const Padding(
                              padding: EdgeInsets.all(12),
                              child: SizedBox(
                                width: 18,
                                height: 18,
                                child: CircularProgressIndicator(strokeWidth: 2),
                              ),
                            )
                          : null,
                    ),
                    onTap: () => setState(() => _showSuggestions = _suggestions.isNotEmpty),
                  ),
                  if (_showSuggestions && _suggestions.isNotEmpty)
                    MovaCard(
                      margin: const EdgeInsets.only(top: 4),
                      padding: EdgeInsets.zero,
                      child: Column(
                        children: _suggestions.map((s) {
                          final label = s['label']?.toString() ?? s['address']?.toString() ?? '';
                          return Material(
                            color: Colors.transparent,
                            child: ListTile(
                              dense: true,
                              leading: const Icon(Icons.location_on_outlined, size: 20),
                              title: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis),
                              onTap: () => _selectSuggestion(s),
                            ),
                          );
                        }).toList(),
                      ),
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
                              const Expanded(
                                child: Text('Estimation', style: TextStyle(fontSize: 16)),
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

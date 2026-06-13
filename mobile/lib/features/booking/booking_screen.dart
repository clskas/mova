import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:latlong2/latlong.dart';
import '../../core/api/api_client.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import 'matching_screen.dart';
import 'widgets/mova_ride_map.dart';
import 'widgets/vehicle_selector.dart';

class BookingScreen extends ConsumerStatefulWidget {
  const BookingScreen({super.key});

  @override
  ConsumerState<BookingScreen> createState() => _BookingScreenState();
}

class _BookingScreenState extends ConsumerState<BookingScreen> {
  final _pickupController =
      TextEditingController(text: 'Ma position, ${MarketConfig.defaultCity}');
  final _destinationController = TextEditingController();

  String _vehicleType = 'MOTO_TAXI';
  final LatLng _pickup = MovaRideMap.kinshasaDefault();
  LatLng? _dropoff;
  Map<String, VehicleEstimate> _estimates = {};
  Map<String, dynamic>? _selectedEstimate;
  List<Map<String, dynamic>> _suggestions = [];
  Timer? _debounce;
  bool _loadingEstimate = false;
  bool _loadingConfirm = false;
  bool _loadingSuggestions = false;
  String? _error;
  String? _validationError;
  bool _showSuggestions = false;

  @override
  void initState() {
    super.initState();
    _destinationController.addListener(_onDestinationChanged);
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
    });
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
    final result = await api.geoAutocomplete(query);
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
    _destinationController.text = label;
    _dropoff = LatLng(
      (suggestion['lat'] as num?)?.toDouble() ?? MarketConfig.defaultLat - 0.03,
      (suggestion['lng'] as num?)?.toDouble() ?? MarketConfig.defaultLng + 0.04,
    );
    setState(() {
      _showSuggestions = false;
      _suggestions = [];
    });
    _fetchAllEstimates();
  }

  Map<String, dynamic> _estimatePayload(String vehicleType) => {
        'pickupLat': _pickup.latitude,
        'pickupLng': _pickup.longitude,
        'dropoffLat': _dropoff?.latitude ?? MarketConfig.defaultLat - 0.03,
        'dropoffLng': _dropoff?.longitude ?? MarketConfig.defaultLng + 0.04,
        'vehicleType': MarketConfig.apiVehicleType(vehicleType),
      };

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
    final api = ref.read(apiClientProvider);
    await api.checkHealth();
    final useMockTypes = api.isMockMode;

    final results = await Future.wait(
      MarketConfig.vehicleTypes.map((v) async {
        final payload = _estimatePayload(v.id);
        payload['vehicleType'] = useMockTypes
            ? v.id
            : (v.id == 'VIP' ? 'COMFORT' : v.id);
        final result = await api.post('/rides/estimate', payload);
        return (v.id, result);
      }),
    );

    if (!mounted) return;
    final estimates = <String, VehicleEstimate>{};
    Map<String, dynamic>? selectedData;
    for (final (type, result) in results) {
      switch (result) {
        case Success(:final data):
          var price = (data['estimatedFareCdf'] ?? data['estimatedPriceCdf']) as int?;
          var enriched = Map<String, dynamic>.from(data);
          if (type == 'VIP' && price != null && !useMockTypes) {
            price = (price * 1.35).ceil();
            enriched['estimatedFareCdf'] = price;
          }
          estimates[type] = VehicleEstimate(vehicleType: type, priceCdf: price);
          if (type == _vehicleType) selectedData = enriched;
        case Failure():
          estimates[type] = VehicleEstimate(vehicleType: type);
      }
    }

    setState(() {
      _loadingEstimate = false;
      _estimates = estimates;
      _selectedEstimate = selectedData;
    });
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

    setState(() {
      _loadingConfirm = true;
      _error = null;
      _validationError = null;
    });

    final api = ref.read(apiClientProvider);
    final result = await api.post('/rides', {
      ..._estimatePayload(_vehicleType),
      'vehicleType': MarketConfig.apiVehicleType(_vehicleType),
      'pickupAddress': _pickupController.text.trim(),
      'dropoffAddress': _destinationController.text.trim(),
    });

    if (!mounted) return;
    setState(() => _loadingConfirm = false);

    switch (result) {
      case Success(:final data):
        final ride = data['ride'] as Map<String, dynamic>?;
        if (ride != null) {
          Navigator.pushReplacement(
            context,
            MaterialPageRoute(
              builder: (_) => MatchingScreen(
                rideId: ride['id'] as String,
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
    final duration = (_selectedEstimate?['durationMin'] as num?)?.toDouble();
    final total = (_selectedEstimate?['estimatedFareCdf'] ??
        _selectedEstimate?['estimatedPriceCdf']) as int?;

    return MovaScreen(
      title: 'Taxi / Moto-taxi',
      scrollable: false,
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          MovaRideMap(pickup: _pickup, dropoff: _dropoff),
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  TextField(
                    controller: _pickupController,
                    decoration: const InputDecoration(
                      labelText: 'Départ',
                      hintText: 'Point de prise en charge',
                      prefixIcon: Icon(Icons.my_location, color: MovaColors.green),
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
                          return ListTile(
                            dense: true,
                            leading: const Icon(Icons.location_on_outlined, size: 20),
                            title: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis),
                            onTap: () => _selectSuggestion(s),
                          );
                        }).toList(),
                      ),
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
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              const Text('Estimation', style: TextStyle(fontSize: 16)),
                              Text(
                                MarketConfig.formatCdf(total),
                                style: const TextStyle(
                                  fontSize: 20,
                                  fontWeight: FontWeight.bold,
                                  color: MovaColors.green,
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
                                  Text('${distance.toStringAsFixed(1)} km'),
                                  const SizedBox(width: 16),
                                ],
                                if (duration != null) ...[
                                  const Icon(Icons.schedule, size: 16, color: MovaColors.textSecondary),
                                  const SizedBox(width: 4),
                                  Text('${duration.ceil()} min'),
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
          ),
        ],
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

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:latlong2/latlong.dart';
import '../../core/api/api_client.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/location/service_area_location.dart';
import '../../core/location/destination_coords.dart';
import '../../core/location/location_service.dart';
import '../../core/widgets/destination_coord_panel.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
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
  LatLng _pickup = MovaRideMap.mapDefaultCenter();
  LatLng? _dropoff;
  bool _dropoffFromManualCoords = false;
  int? _estimatedPrice;
  bool _loading = false;
  bool _loadingGps = false;
  String? _error;
  String? _validationError;

  @override
  void dispose() {
    _pickupController.dispose();
    _dropoffController.dispose();
    super.dispose();
  }

  void _setDropoffFromCoords(LatLng coords, String label) {
    _dropoff = ServiceAreaLocation.ensureInServiceArea(coords, address: label);
    _dropoffController.text = label;
    setState(() {
      _estimatedPrice = null;
      _dropoffFromManualCoords = true;
    });
  }

  void _onMapDropoffTap(LatLng raw) {
    final coords = ServiceAreaLocation.ensureInServiceArea(raw);
    if (!ServiceAreaLocation.isInBounds(coords)) {
      setState(() => _validationError = ServiceAreaLocation.outOfAreaMessage());
      return;
    }
    _setDropoffFromCoords(coords, 'Point sélectionné sur la carte');
  }

  Future<void> _resolveCoords() async {
    _pickup = ServiceAreaLocation.ensureInServiceArea(
      _pickup,
      address: _pickupController.text,
    );
    if (_dropoffFromManualCoords && _dropoff != null && ServiceAreaLocation.isInBounds(_dropoff!)) {
      return;
    }
    final fromTextCoords = DestinationCoords.parseText(_dropoffController.text);
    if (fromTextCoords != null && ServiceAreaLocation.isInBounds(fromTextCoords)) {
      _dropoff = fromTextCoords;
      _dropoffFromManualCoords = true;
      return;
    }
    if (_dropoff == null || !ServiceAreaLocation.isInBounds(_dropoff!)) {
      var resolved = ServiceAreaLocation.coordsFromAddress(_dropoffController.text);
      if (!ServiceAreaLocation.isInBounds(resolved)) {
        final api = ref.read(apiClientProvider);
        final result = await api.geoAutocomplete(_dropoffController.text.trim());
        if (result case Success(:final data) when data.isNotEmpty) {
          final s = data.first;
          resolved = LatLng(
            (s['lat'] as num?)?.toDouble() ?? MarketConfig.defaultLat,
            (s['lng'] as num?)?.toDouble() ?? MarketConfig.defaultLng,
          );
        }
      }
      _dropoff = ServiceAreaLocation.ensureInServiceArea(
        resolved,
        address: _dropoffController.text,
      );
    } else {
      _dropoff = ServiceAreaLocation.ensureInServiceArea(
        _dropoff!,
        address: _dropoffController.text,
      );
    }
  }

  Map<String, dynamic> _payload() {
    final dropoff = _dropoff ?? ServiceAreaLocation.defaultDropoffOffset();
    return {
      'pickupLat': _pickup.latitude,
      'pickupLng': _pickup.longitude,
      'pickupAddress': _pickupController.text.trim(),
      'dropoffLat': dropoff.latitude,
      'dropoffLng': dropoff.longitude,
      'dropoffAddress': _dropoffController.text.trim(),
      'weightCategory': 'SMALL',
      'express': true,
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
        _estimatedPrice = null;
      }
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
    await _resolveCoords();
    if (!mounted) return;
    setState(() {});
    final api = ref.read(apiClientProvider);
    await api.checkHealth();
    final result = await api.post('/express/estimate', _payload());
    if (!mounted) return;
    setState(() {
      _loading = false;
      switch (result) {
        case Success(:final data):
          _estimatedPrice = data['estimatedPriceCdf'] as int?;
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
    await _resolveCoords();
    if (!mounted) return;
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
                    onChanged: (_) => setState(() => _estimatedPrice = null),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _dropoffController,
                    decoration: const InputDecoration(
                      labelText: 'Livraison',
                      hintText: 'Ex: Gombe, Limete…',
                      prefixIcon: Icon(Icons.place_outlined),
                    ),
                    onChanged: (_) => setState(() {
                      _estimatedPrice = null;
                      _dropoff = null;
                      _dropoffFromManualCoords = false;
                    }),
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
                    MovaCard(
                      child: Row(
                        children: [
                          const Expanded(child: Text('Tarif express')),
                          Flexible(
                            child: Text(
                              MarketConfig.formatCdf(_estimatedPrice!),
                              style: const TextStyle(
                                fontSize: 18,
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
                    ),
                  ],
                  if (_validationError != null) ...[
                    const SizedBox(height: 16),
                    MovaErrorBanner(message: _validationError!),
                  ],
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

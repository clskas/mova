import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:latlong2/latlong.dart';
import '../../core/api/api_client.dart';
import '../../core/billing/service_price_display.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/location/service_area_location.dart';
import '../../core/location/service_area_prefs.dart';
import '../../core/location/service_areas.dart';
import '../../core/location/destination_coords.dart';
import '../../core/location/location_service.dart';
import '../../core/widgets/destination_coord_panel.dart';
import '../../core/widgets/geo_autocomplete_field.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import '../../widgets/promo_code_field.dart';
import '../booking/widgets/mova_ride_map.dart';
import 'parcel_tracking_screen.dart';

const _weightCategories = [
  ('DOCUMENTS', 'Documents', 'Enveloppe, dossier'),
  ('SMALL', 'Petit colis', '< 1 kg'),
  ('MEDIUM', 'Moyen', '1 – 5 kg'),
  ('LARGE', 'Grand', '> 5 kg'),
];

class ParcelDeliveryScreen extends ConsumerStatefulWidget {
  const ParcelDeliveryScreen({
    super.key,
    this.initialPickupAddress,
    this.initialDropoffAddress,
    this.initialWeightCategory,
  });

  final String? initialPickupAddress;
  final String? initialDropoffAddress;
  final String? initialWeightCategory;

  @override
  ConsumerState<ParcelDeliveryScreen> createState() => _ParcelDeliveryScreenState();
}

class _ParcelDeliveryScreenState extends ConsumerState<ParcelDeliveryScreen> {
  final _pickupController = TextEditingController(text: 'Ma position');
  final _dropoffController = TextEditingController();
  final _promoController = TextEditingController();
  final _picker = ImagePicker();

  String _weightCategory = 'DOCUMENTS';
  LatLng _pickup = MovaRideMap.mapDefaultCenter();
  LatLng? _dropoff;
  bool _dropoffFromManualCoords = false;
  File? _photoFile;
  int? _estimatedPrice;
  Map<String, dynamic>? _priceBreakdown;
  double? _distanceKm;
  double? _durationMin;
  Timer? _debounce;
  bool _loading = false;
  bool _loadingGps = false;
  bool _loadingDropoffGps = false;
  bool _pickupFromSuggestion = false;
  bool _pickupFromGps = false;
  String? _error;
  String? _validationError;

  @override
  void initState() {
    super.initState();
    if (widget.initialPickupAddress != null) {
      _pickupController.text = widget.initialPickupAddress!;
    }
    if (widget.initialDropoffAddress != null) {
      _dropoffController.text = widget.initialDropoffAddress!;
    }
    if (widget.initialWeightCategory != null) {
      _weightCategory = widget.initialWeightCategory!;
    }
    WidgetsBinding.instance.addPostFrameCallback((_) => _useMyLocation());
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _pickupController.dispose();
    _dropoffController.dispose();
    _promoController.dispose();
    super.dispose();
  }

  String get _autocompleteCity => ServiceAreas.autocompleteCity(
        coords: _pickup,
        preferredArea: ref.read(selectedServiceAreaProvider),
      );

  void _onPickupUserInput() {
    setState(() {
      _estimatedPrice = null;
      _pickupFromSuggestion = false;
      _pickupFromGps = false;
    });
  }

  void _onDropoffUserInput() {
    setState(() {
      _estimatedPrice = null;
      _distanceKm = null;
      _durationMin = null;
      _dropoffFromManualCoords = false;
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
      _estimatedPrice = null;
      _pickupFromSuggestion = true;
      _pickupFromGps = false;
    });
  }

  void _selectSuggestion(Map<String, dynamic> suggestion) {
    final label = suggestion['label']?.toString() ??
        suggestion['address']?.toString() ??
        '';
    _dropoffController.text = label;
    _dropoff = ServiceAreaLocation.ensureInServiceArea(
      LatLng(
        (suggestion['lat'] as num?)?.toDouble() ?? MarketConfig.defaultLat - 0.03,
        (suggestion['lng'] as num?)?.toDouble() ?? MarketConfig.defaultLng + 0.04,
      ),
      address: label,
    );
    setState(() {
      _estimatedPrice = null;
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
      _pickupController.text = ServiceAreaLocation.isInBounds(result.position)
          ? result.label
          : 'Ma position';
      _pickupFromSuggestion = false;
      _pickupFromGps = true;
      _estimatedPrice = null;
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
    _dropoffController.text = label;
    setState(() {
      _loadingDropoffGps = false;
      _dropoff = coords;
      _dropoffFromManualCoords = true;
      _estimatedPrice = null;
      _distanceKm = null;
      _durationMin = null;
    });
  }

  void _setDropoffFromCoords(LatLng coords, String label) {
    _dropoff = ServiceAreaLocation.ensureInServiceArea(coords, address: label);
    _dropoffController.text = label;
    setState(() {
      _estimatedPrice = null;
      _dropoffFromManualCoords = true;
    });
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
        return 'Adresse d\'enlèvement non reconnue — utilisez le GPS, l\'autocomplétion SENGA ou les coordonnées.';
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
      return null;
    }
    final fromTextCoords = DestinationCoords.parseText(_dropoffController.text);
    if (fromTextCoords != null && ServiceAreaLocation.isInBounds(fromTextCoords)) {
      _dropoff = fromTextCoords;
      _dropoffFromManualCoords = true;
      return null;
    }
    if (_dropoff == null || !ServiceAreaLocation.isInBounds(_dropoff!)) {
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
      } else {
        return 'Adresse non reconnue — utilisez le GPS, l\'autocomplétion SENGA ou les coordonnées.';
      }
    } else {
      _dropoff = ServiceAreaLocation.ensureInServiceArea(
        _dropoff!,
        address: _dropoffController.text,
      );
    }
    return null;
  }

  Map<String, dynamic> _parcelPayload({bool includePhoto = false}) {
    final dropoff = _dropoff ?? ServiceAreaLocation.defaultDropoffOffset(near: _pickup);
    final payload = {
      'pickupAddress': _pickupController.text.trim(),
      'dropoffAddress': _dropoffController.text.trim(),
      'weightCategory': _weightCategory,
      'pickupLat': _pickup.latitude,
      'pickupLng': _pickup.longitude,
      'dropoffLat': dropoff.latitude,
      'dropoffLng': dropoff.longitude,
      if (_promoController.text.trim().isNotEmpty) 'promoCode': _promoController.text.trim(),
    };
    if (includePhoto && _photoFile != null) {
      payload['photoUrl'] = _photoFile!.path;
    }
    return payload;
  }

  String? _validate() {
    if (_pickupController.text.trim().isEmpty) {
      return 'Indiquez l\'adresse d\'enlèvement.';
    }
    if (_dropoffController.text.trim().isEmpty) {
      return 'Indiquez l\'adresse de livraison.';
    }
    return null;
  }

  Future<void> _pickPhoto(ImageSource source) async {
    try {
      final picked = await _picker.pickImage(
        source: source,
        maxWidth: 1280,
        imageQuality: 85,
        preferredCameraDevice: CameraDevice.rear,
      );
      if (picked != null) {
        setState(() => _photoFile = File(picked.path));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Impossible d\'accéder à la caméra ou à la galerie.'),
          ),
        );
      }
    }
  }

  Future<void> _showPhotoOptions() async {
    await showModalBottomSheet<void>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_camera_outlined),
              title: const Text('Prendre une photo'),
              onTap: () {
                Navigator.pop(ctx);
                _pickPhoto(ImageSource.camera);
              },
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('Choisir dans la galerie'),
              onTap: () {
                Navigator.pop(ctx);
                _pickPhoto(ImageSource.gallery);
              },
            ),
            if (_photoFile != null)
              ListTile(
                leading: const Icon(Icons.delete_outline, color: MovaColors.orange),
                title: const Text('Supprimer la photo'),
                onTap: () {
                  Navigator.pop(ctx);
                  setState(() => _photoFile = null);
                },
              ),
          ],
        ),
      ),
    );
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
    final result = await api.post('/deliveries/parcel/estimate', _parcelPayload());
    if (!mounted) return;
    setState(() {
      _loading = false;
      switch (result) {
        case Success(:final data):
          _estimatedPrice = (data['estimatedPriceCdf'] as num?)?.toInt();
          _priceBreakdown = data['priceBreakdown'] is Map
              ? Map<String, dynamic>.from(data['priceBreakdown'] as Map)
              : null;
          _distanceKm = (data['distanceKm'] as num?)?.toDouble();
          _durationMin = (data['durationMin'] as num?)?.toDouble();
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
    setState(() {});
    final api = ref.read(apiClientProvider);
    String? photoUrl;
    if (_photoFile != null) {
      final upload = await api.uploadParcelPhoto(_photoFile!);
      switch (upload) {
        case Success(:final data):
          photoUrl = data;
        case Failure(:final error):
          if (!mounted) return;
          setState(() {
            _loading = false;
            _error = error.message;
          });
          return;
      }
    }
    final payload = _parcelPayload();
    if (photoUrl != null) payload['photoUrl'] = photoUrl;
    final result = await api.post('/deliveries/parcel', payload);
    if (!mounted) return;
    setState(() => _loading = false);
    switch (result) {
      case Success(:final data):
        final delivery = data['delivery'] as Map<String, dynamic>?;
        if (delivery != null && mounted) {
          Navigator.pushReplacement(
            context,
            MaterialPageRoute(
              builder: (_) => ParcelTrackingScreen(
                parcelId: delivery['id'] as String,
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
    final api = ref.read(apiClientProvider);
    final autocompleteCity = _autocompleteCity;

    return MovaScreen(
      title: 'Livraison colis',
      scrollable: false,
      padding: EdgeInsets.zero,
      child: MovaMapFormLayout(
        maxMapHeight: 170,
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
                  GeoAutocompleteField(
                    controller: _pickupController,
                    api: api,
                    city: autocompleteCity,
                    label: 'Adresse d\'enlèvement',
                    hint: 'Ma position ou nom du lieu',
                    prefixIcon: Icons.upload_outlined,
                    onUserInput: _onPickupUserInput,
                    onSelected: _selectPickupSuggestion,
                    suffixIcon: IconButton(
                      icon: const Icon(Icons.gps_fixed, color: MovaColors.violet),
                      tooltip: 'Ma position',
                      onPressed: _loadingGps ? null : _useMyLocation,
                    ),
                  ),
                  const SizedBox(height: 12),
                  GeoAutocompleteField(
                    controller: _dropoffController,
                    api: api,
                    city: autocompleteCity,
                    label: 'Adresse de livraison',
                    hint: 'Ex: Gombe, Limete, Masina…',
                    prefixIcon: Icons.place_outlined,
                    textInputAction: TextInputAction.done,
                    onUserInput: _onDropoffUserInput,
                    onSelected: _selectSuggestion,
                    suffixIcon: IconButton(
                      icon: const Icon(Icons.gps_fixed, color: MovaColors.violet),
                      tooltip: 'Ma position',
                      onPressed: _loadingDropoffGps ? null : _useMyLocationForDropoff,
                    ),
                  ),
                  DestinationCoordPanel(
                    initialLat: _dropoff?.latitude,
                    initialLng: _dropoff?.longitude,
                    onApply: _setDropoffFromCoords,
                  ),
                  const SizedBox(height: 16),
                  Text('Catégorie de poids', style: theme.textTheme.titleSmall),
                  const SizedBox(height: 4),
                  ..._weightCategories.map((cat) {
                    return RadioListTile<String>(
                      contentPadding: EdgeInsets.zero,
                      title: Text(cat.$2),
                      subtitle: Text(cat.$3, style: const TextStyle(fontSize: 12)),
                      value: cat.$1,
                      groupValue: _weightCategory,
                      onChanged: (val) {
                        setState(() {
                          _weightCategory = val!;
                          _estimatedPrice = null;
                        });
                      },
                    );
                  }),
                  const SizedBox(height: 8),
                  OutlinedButton.icon(
                    onPressed: _showPhotoOptions,
                    icon: Icon(
                      _photoFile != null ? Icons.check_circle : Icons.add_a_photo_outlined,
                    ),
                    label: Text(
                      _photoFile != null
                          ? 'Photo ajoutée (optionnel)'
                          : 'Ajouter une photo (optionnel)',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  if (_photoFile != null) ...[
                    const SizedBox(height: 12),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(12),
                      child: Image.file(
                        _photoFile!,
                        height: 120,
                        width: double.infinity,
                        fit: BoxFit.cover,
                      ),
                    ),
                  ],
                  if (_estimatedPrice != null) ...[
                    const SizedBox(height: 16),
                    ServicePriceDisplay.estimateCard(
                      totalCdf: _estimatedPrice!,
                      discountCdf: null,
                      priceBreakdown: _priceBreakdown,
                      totalLabel: 'Frais de livraison',
                    ),
                    if (_distanceKm != null || _durationMin != null) ...[
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 4,
                        runSpacing: 4,
                        children: [
                          if (_distanceKm != null) ...[
                            const Icon(Icons.straighten, size: 16, color: MovaColors.textSecondary),
                            Text('${_distanceKm!.toStringAsFixed(1)} km'),
                          ],
                          if (_durationMin != null) ...[
                            const Icon(Icons.schedule, size: 16, color: MovaColors.textSecondary),
                            Text('${_durationMin!.ceil()} min'),
                          ],
                        ],
                      ),
                    ],
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
                    label: _estimatedPrice == null ? 'Estimer le prix' : 'Confirmer l\'envoi',
                    isLoading: _loading,
                    icon: _estimatedPrice == null
                        ? Icons.calculate_outlined
                        : Icons.local_shipping_outlined,
                    onPressed: _loading ? null : (_estimatedPrice == null ? _estimate : _confirm),
                  ),
          ],
        ),
      ),
    );
  }
}

import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
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
  final _picker = ImagePicker();

  String _weightCategory = 'DOCUMENTS';
  LatLng _pickup = MovaRideMap.mapDefaultCenter();
  LatLng? _dropoff;
  bool _dropoffFromManualCoords = false;
  File? _photoFile;
  int? _estimatedPrice;
  double? _distanceKm;
  double? _durationMin;
  List<Map<String, dynamic>> _suggestions = [];
  Timer? _debounce;
  bool _loading = false;
  bool _loadingGps = false;
  bool _loadingSuggestions = false;
  bool _showSuggestions = false;
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
    _dropoffController.addListener(_onDropoffChanged);
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _dropoffController.removeListener(_onDropoffChanged);
    _pickupController.dispose();
    _dropoffController.dispose();
    super.dispose();
  }

  void _onDropoffChanged() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), _fetchSuggestions);
    setState(() {
      _estimatedPrice = null;
      _distanceKm = null;
      _durationMin = null;
      _dropoff = null;
      _dropoffFromManualCoords = false;
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
    _dropoffController.text = label;
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
      _estimatedPrice = null;
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
      _estimatedPrice = null;
    });
  }

  void _setDropoffFromCoords(LatLng coords, String label) {
    _dropoff = ServiceAreaLocation.ensureInServiceArea(coords, address: label);
    _dropoffController.text = label;
    setState(() {
      _showSuggestions = false;
      _suggestions = [];
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

  Map<String, dynamic> _parcelPayload({bool includePhoto = false}) {
    final dropoff = _dropoff ?? ServiceAreaLocation.defaultDropoffOffset();
    final payload = {
      'pickupAddress': _pickupController.text.trim(),
      'dropoffAddress': _dropoffController.text.trim(),
      'weightCategory': _weightCategory,
      'pickupLat': _pickup.latitude,
      'pickupLng': _pickup.longitude,
      'dropoffLat': dropoff.latitude,
      'dropoffLng': dropoff.longitude,
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
    await _resolveCoords();
    if (!mounted) return;
    setState(() {});
    final api = ref.read(apiClientProvider);
    await api.checkHealth();
    final result = await api.post('/deliveries/parcel/estimate', _parcelPayload());
    if (!mounted) return;
    setState(() {
      _loading = false;
      switch (result) {
        case Success(:final data):
          _estimatedPrice = data['estimatedPriceCdf'] as int?;
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
    await _resolveCoords();
    if (!mounted) return;
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
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
                  TextField(
                    controller: _pickupController,
                    decoration: InputDecoration(
                      labelText: 'Adresse d\'enlèvement',
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
                              icon: const Icon(Icons.gps_fixed, color: MovaColors.violet),
                              tooltip: 'Ma position',
                              onPressed: _loadingGps ? null : _useMyLocation,
                            ),
                    ),
                    onChanged: (_) => setState(() => _estimatedPrice = null),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _dropoffController,
                    decoration: InputDecoration(
                      labelText: 'Adresse de livraison',
                      hintText: 'Ex: Limete, Masina…',
                      prefixIcon: const Icon(Icons.place_outlined),
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
                          final label =
                              s['label']?.toString() ?? s['address']?.toString() ?? '';
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
                                  MarketConfig.formatCdf(_estimatedPrice!),
                                  style: const TextStyle(
                                    fontSize: 20,
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
                          if (_distanceKm != null || _durationMin != null) ...[
                            const SizedBox(height: 8),
                            Wrap(
                              spacing: 4,
                              runSpacing: 4,
                              crossAxisAlignment: WrapCrossAlignment.center,
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

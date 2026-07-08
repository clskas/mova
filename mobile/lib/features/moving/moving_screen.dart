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
import '../../core/location/destination_coords.dart';
import '../../core/location/destination_field_sync.dart';
import '../../core/location/location_service.dart';
import '../../core/location/service_area_location.dart';
import '../../core/location/service_areas.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/destination_coord_panel.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import '../../widgets/promo_code_field.dart';
import '../booking/widgets/mova_ride_map.dart';
import '../history/history_detail_dialog.dart';
import 'moving_tracking_screen.dart';

const _volumeOptions = [
  ('STUDIO', 'Studio / chambre unique', '~4 m³ — pas de pièces supplémentaires'),
  ('APARTMENT', 'Appartement', 'Volume selon le nombre de pièces'),
  ('HOUSE', 'Maison', 'Volume selon le nombre de pièces'),
  ('OFFICE', 'Bureau / local commercial', 'Volume selon la surface et les postes'),
];

const _vehicleCategories = [
  ('CAMIONNETTE', 'Camionnette / pick-up', 'Jusqu\'à ~6 m³'),
  ('CAMION_15M3', 'Camion ~15 m³', 'Appartement T2–T3'),
  ('CAMION_30M3', 'Camion ~30 m³', 'Maison, gros volume'),
  ('CAMION_50M3', 'Gros camion ~50 m³', 'Bureau, déménagement complet'),
];

class _MovingPhoto {
  _MovingPhoto({this.localPath, this.remoteUrl});
  final String? localPath;
  final String? remoteUrl;
}

String recommendedVehicleForVolume(int volumeM3) {
  if (volumeM3 <= 6) return 'CAMIONNETTE';
  if (volumeM3 <= 18) return 'CAMION_15M3';
  if (volumeM3 <= 35) return 'CAMION_30M3';
  return 'CAMION_50M3';
}

class MovingScreen extends ConsumerStatefulWidget {
  const MovingScreen({super.key});

  @override
  ConsumerState<MovingScreen> createState() => _MovingScreenState();
}

class _MovingScreenState extends ConsumerState<MovingScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;

  final _fromController = TextEditingController(text: 'Ma position');
  final _toController = TextEditingController();
  final _itemController = TextEditingController();
  final _promoController = TextEditingController();
  String _volume = 'APARTMENT';
  String _vehicleCategory = 'CAMION_15M3';
  int _rooms = 2;
  int _officeDesks = 8;
  final List<String> _items = [];
  final List<_MovingPhoto> _photos = [];
  final _picker = ImagePicker();

  LatLng _pickup = MovaRideMap.mapDefaultCenter();
  LatLng? _dropoff;
  bool _dropoffFromManualCoords = false;
  List<Map<String, dynamic>> _suggestions = [];
  Timer? _debounce;
  bool _loadingSuggestions = false;
  bool _showSuggestions = false;
  bool _loadingGps = false;

  bool _uploadingPhoto = false;
  int? _estimatedPrice;
  Map<String, dynamic>? _estimateBreakdown;
  double? _distanceKm;
  bool _loading = false;
  bool _loadingRequests = true;
  List<Map<String, dynamic>> _myRequests = [];
  String? _error;
  String? _validationError;
  Timer? _pollTimer;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _toController.addListener(_onDropoffChanged);
    _loadMyRequests();
    _pollTimer = Timer.periodic(const Duration(seconds: 12), (_) => _loadMyRequests(silent: true));
    WidgetsBinding.instance.addPostFrameCallback((_) => _useMyLocation());
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _debounce?.cancel();
    _tabController.dispose();
    _toController.removeListener(_onDropoffChanged);
    _fromController.dispose();
    _toController.dispose();
    _itemController.dispose();
    _promoController.dispose();
    super.dispose();
  }

  void _onDropoffChanged() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), _fetchSuggestions);
    setState(() {
      _estimatedPrice = null;
      _estimateBreakdown = null;
      _distanceKm = null;
      _dropoff = null;
      _dropoffFromManualCoords = false;
    });
  }

  Future<void> _fetchSuggestions() async {
    final query = _toController.text.trim();
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
    DestinationFieldSync.setText(_toController, _onDropoffChanged, label);
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
      _estimateBreakdown = null;
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
      _pickup = ServiceAreaLocation.ensureInServiceArea(result.position, address: result.label);
      _fromController.text =
          ServiceAreaLocation.isInBounds(result.position) ? result.label : 'Ma position';
      _estimatedPrice = null;
      _estimateBreakdown = null;
      _distanceKm = null;
    });
  }

  void _setDropoffFromCoords(LatLng coords, String label) {
    _dropoff = ServiceAreaLocation.ensureInServiceArea(coords, address: label);
    DestinationFieldSync.setText(_toController, _onDropoffChanged, label);
    setState(() {
      _showSuggestions = false;
      _suggestions = [];
      _estimatedPrice = null;
      _estimateBreakdown = null;
      _dropoffFromManualCoords = true;
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
    DestinationFieldSync.setText(_toController, _onDropoffChanged, label);
    setState(() {});
  }

  Future<void> _resolveCoords() async {
    _pickup = ServiceAreaLocation.ensureInServiceArea(_pickup, address: _fromController.text);
    if (_dropoffFromManualCoords && _dropoff != null && ServiceAreaLocation.isInBounds(_dropoff!)) {
      return;
    }
    final fromTextCoords = DestinationCoords.parseText(_toController.text);
    if (fromTextCoords != null && ServiceAreaLocation.isInBounds(fromTextCoords)) {
      _dropoff = fromTextCoords;
      _dropoffFromManualCoords = true;
      return;
    }
    if (_dropoff == null || !ServiceAreaLocation.isInBounds(_dropoff!)) {
      var resolved = ServiceAreaLocation.coordsFromAddress(_toController.text, near: _pickup);
      if (!ServiceAreaLocation.isInBounds(resolved)) {
        final api = ref.read(apiClientProvider);
        final result = await api.geoAutocomplete(
          _toController.text.trim(),
          city: ServiceAreas.cityNameForCoords(_pickup),
        );
        if (result case Success(:final data) when data.isNotEmpty) {
          final s = data.first;
          resolved = LatLng(
            (s['lat'] as num?)?.toDouble() ?? MarketConfig.defaultLat,
            (s['lng'] as num?)?.toDouble() ?? MarketConfig.defaultLng,
          );
        }
      }
      _dropoff = ServiceAreaLocation.ensureInServiceArea(resolved, address: _toController.text);
    } else {
      _dropoff = ServiceAreaLocation.ensureInServiceArea(_dropoff!, address: _toController.text);
    }
  }

  Future<void> _loadMyRequests({bool silent = false}) async {
    if (!silent) setState(() => _loadingRequests = true);
    final api = ref.read(apiClientProvider);
    final result = await api.get('/moving');
    if (!mounted) return;
    setState(() {
      _loadingRequests = silent ? _loadingRequests : false;
      if (result case Success(:final data)) {
        final list = data is List
            ? data
            : (data is Map ? (data['data'] as List? ?? data['movings'] as List? ?? []) : []);
        _myRequests = list.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
      }
    });
  }

  int _volumeM3() {
    return switch (_volume) {
      'STUDIO' => 4,
      'APARTMENT' => (8 + (_rooms - 1) * 3).clamp(8, 35),
      'HOUSE' => (18 + (_rooms - 3) * 4).clamp(18, 50),
      'OFFICE' => (10 + (_officeDesks * 2)).clamp(12, 50),
      _ => 10,
    };
  }

  void _onHousingTypeChanged(String volume) {
    _volume = volume;
    switch (volume) {
      case 'STUDIO':
        _rooms = 1;
      case 'APARTMENT':
        _rooms = _rooms.clamp(1, 6);
      case 'HOUSE':
        _rooms = _rooms.clamp(3, 10);
      case 'OFFICE':
        _officeDesks = _officeDesks.clamp(2, 40);
    }
    _vehicleCategory = recommendedVehicleForVolume(_volumeM3());
    _estimatedPrice = null;
    _estimateBreakdown = null;
    _distanceKm = null;
  }

  void _addItem() {
    final text = _itemController.text.trim();
    if (text.isEmpty) return;
    setState(() {
      _items.add(text);
      _itemController.clear();
      _estimatedPrice = null;
      _estimateBreakdown = null;
    });
  }

  void _removeItem(int index) {
    setState(() {
      _items.removeAt(index);
      _estimatedPrice = null;
      _estimateBreakdown = null;
    });
  }

  Future<void> _addPhoto() async {
    final file = await _picker.pickImage(source: ImageSource.camera, imageQuality: 75);
    if (file == null) return;
    final localPath = file.path;
    setState(() {
      _uploadingPhoto = true;
      _photos.add(_MovingPhoto(localPath: localPath));
    });
    final api = ref.read(apiClientProvider);
    await api.checkHealth();
    final result = await api.uploadMovingPhoto(File(localPath));
    if (!mounted) return;
    setState(() => _uploadingPhoto = false);
    switch (result) {
      case Success(:final data):
        final idx = _photos.indexWhere((p) => p.localPath == localPath);
        if (idx >= 0) {
          setState(() {
            _photos[idx] = _MovingPhoto(localPath: localPath, remoteUrl: data);
          });
        }
      case Failure(:final error):
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Photo non envoyée : ${error.message}')),
        );
    }
  }

  List<String> get _uploadedPhotoUrls =>
      _photos.map((p) => p.remoteUrl).whereType<String>().where((u) => u.isNotEmpty).toList();

  Map<String, dynamic> _payload() {
    final dropoff = _dropoff ?? ServiceAreaLocation.defaultDropoffOffset(near: _pickup);
    return {
      'pickupAddress': _fromController.text.trim(),
      'pickupLat': _pickup.latitude,
      'pickupLng': _pickup.longitude,
      'dropoffAddress': _toController.text.trim(),
      'dropoffLat': dropoff.latitude,
      'dropoffLng': dropoff.longitude,
      'volumeM3': _volumeM3(),
      'vehicleCategory': _vehicleCategory,
      if (_items.isNotEmpty) 'itemsNotes': _items.join(', '),
      if (_uploadedPhotoUrls.isNotEmpty) 'photoUrls': _uploadedPhotoUrls,
      if (_promoController.text.trim().isNotEmpty) 'promoCode': _promoController.text.trim(),
    };
  }

  String? _validate() {
    if (_fromController.text.trim().isEmpty) return 'Indiquez l\'adresse de départ.';
    if (_toController.text.trim().length < 3) return 'Indiquez l\'adresse d\'arrivée.';
    if (_items.isEmpty) return 'Listez au moins un meuble ou carton.';
    return null;
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
    final api = ref.read(apiClientProvider);
    await api.checkHealth();
    final result = await api.post('/moving/estimate', _payload());
    setState(() {
      _loading = false;
      switch (result) {
        case Success(:final data):
          _estimatedPrice = data['estimatedPriceCdf'] as int?;
          _estimateBreakdown = Map<String, dynamic>.from(data);
          _distanceKm = (data['distanceKm'] as num?)?.toDouble();
        case Failure(:final error):
          _error = error.message;
      }
    });
  }

  Future<void> _request() async {
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
    final api = ref.read(apiClientProvider);
    final result = await api.post('/moving', _payload());
    setState(() => _loading = false);
    switch (result) {
      case Success(:final data):
        if (mounted) {
          final request = data['moving'] as Map<String, dynamic>? ??
              data['request'] as Map<String, dynamic>? ??
              data;
          await _loadMyRequests();
          if (!mounted) return;
          _tabController.animateTo(1);
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => MovingTrackingScreen(
                movingId: request['id']?.toString() ?? '',
                fromAddress: _fromController.text.trim(),
                toAddress: _toController.text.trim(),
                estimatedPrice: _estimatedPrice ?? request['estimatedPriceCdf'] as int? ?? 0,
              ),
            ),
          );
        }
      case Failure(:final error):
        setState(() => _error = error.message);
    }
  }

  void _openRequestDetail(Map<String, dynamic> request) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => MovingTrackingScreen(
          movingId: request['id']?.toString() ?? '',
          fromAddress: request['pickupAddress']?.toString() ?? '',
          toAddress: request['dropoffAddress']?.toString() ?? '',
          estimatedPrice: request['estimatedPriceCdf'] as int? ?? 0,
        ),
      ),
    ).then((_) => _loadMyRequests());
  }

  Widget _newRequestTab(ThemeData theme) {
    final recommended = recommendedVehicleForVolume(_volumeM3());
    final dropoff = _dropoff ?? ServiceAreaLocation.defaultDropoffOffset(near: _pickup);

    return SingleChildScrollView(
      physics: kMovaScrollPhysics,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Comme sur Uber Freight ou Dolly : volume + trajet + camion adapté. '
            'L\'estimation inclut la distance, le volume (m³) et le type d\'engin.',
            style: theme.textTheme.bodyMedium?.copyWith(color: MovaColors.textSecondary),
          ),
          const SizedBox(height: 16),
          MovaRideMap(
            pickup: _pickup,
            dropoff: dropoff,
            onDropoffTap: _onMapDropoffTap,
            height: 160,
            pickupLabel: _fromController.text,
            dropoffLabel: _toController.text.isEmpty ? null : _toController.text,
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _fromController,
                  decoration: const InputDecoration(
                    labelText: 'Adresse de départ',
                    prefixIcon: Icon(Icons.home_outlined),
                  ),
                  onChanged: (_) => setState(() {
                    _estimatedPrice = null;
                    _estimateBreakdown = null;
                    _distanceKm = null;
                  }),
                ),
              ),
              IconButton(
                onPressed: _loadingGps ? null : _useMyLocation,
                icon: _loadingGps
                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.my_location),
                tooltip: 'Ma position GPS',
              ),
            ],
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _toController,
            decoration: InputDecoration(
              labelText: 'Adresse d\'arrivée',
              hintText: 'Rechercher une commune, quartier…',
              prefixIcon: const Icon(Icons.place_outlined),
              suffixIcon: _loadingSuggestions
                  ? const Padding(
                      padding: EdgeInsets.all(12),
                      child: SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)),
                    )
                  : null,
            ),
          ),
          if (_showSuggestions && _suggestions.isNotEmpty)
            Card(
              margin: const EdgeInsets.only(top: 4),
              child: Column(
                children: _suggestions.take(5).map((s) {
                  final label = s['label']?.toString() ?? s['address']?.toString() ?? '';
                  return ListTile(
                    dense: true,
                    leading: const Icon(Icons.location_on_outlined, size: 20),
                    title: Text(label, maxLines: 2, overflow: TextOverflow.ellipsis),
                    onTap: () => _selectSuggestion(s),
                  );
                }).toList(),
              ),
            ),
          DestinationCoordPanel(
            onApply: (coords, label) => _setDropoffFromCoords(coords, label),
          ),
          const SizedBox(height: 16),
          Text('Type de logement', style: theme.textTheme.titleSmall),
          const SizedBox(height: 8),
          ..._volumeOptions.map((v) {
            return RadioListTile<String>(
              title: Text(v.$2),
              subtitle: Text(v.$3, style: const TextStyle(fontSize: 12)),
              value: v.$1,
              groupValue: _volume,
              onChanged: (val) => setState(() => _onHousingTypeChanged(val!)),
            );
          }),
          if (_volume == 'APARTMENT' || _volume == 'HOUSE') ...[
            const SizedBox(height: 8),
            Text(
              _volume == 'HOUSE' ? 'Nombre de pièces (maison)' : 'Nombre de pièces (hors cuisine/SDB)',
              style: theme.textTheme.titleSmall,
            ),
            Slider(
              value: _rooms.toDouble(),
              min: _volume == 'HOUSE' ? 3 : 1,
              max: _volume == 'HOUSE' ? 10 : 6,
              divisions: _volume == 'HOUSE' ? 7 : 5,
              label: '$_rooms',
              onChanged: (v) => setState(() {
                _rooms = v.round();
                _vehicleCategory = recommendedVehicleForVolume(_volumeM3());
                _estimatedPrice = null;
                _estimateBreakdown = null;
                _distanceKm = null;
              }),
            ),
          ],
          if (_volume == 'OFFICE') ...[
            const SizedBox(height: 8),
            Text('Nombre de postes / bureaux à déménager', style: theme.textTheme.titleSmall),
            Slider(
              value: _officeDesks.toDouble(),
              min: 2,
              max: 40,
              divisions: 19,
              label: '$_officeDesks',
              onChanged: (v) => setState(() {
                _officeDesks = v.round();
                _vehicleCategory = recommendedVehicleForVolume(_volumeM3());
                _estimatedPrice = null;
                _estimateBreakdown = null;
                _distanceKm = null;
              }),
            ),
          ],
          Text(
            'Volume estimé : ${_volumeM3()} m³',
            style: theme.textTheme.bodySmall?.copyWith(color: MovaColors.textSecondary),
          ),
          const SizedBox(height: 12),
          Text('Type d\'engin', style: theme.textTheme.titleSmall),
          const SizedBox(height: 4),
          Text(
            'Pré-sélection selon le volume — vous pouvez ajuster si vous avez des meubles encombrants.',
            style: theme.textTheme.bodySmall?.copyWith(color: MovaColors.textSecondary),
          ),
          const SizedBox(height: 8),
          ..._vehicleCategories.map((v) {
            final isRecommended = v.$1 == recommended;
            return RadioListTile<String>(
              title: Row(
                children: [
                  Expanded(child: Text(v.$2)),
                  if (isRecommended)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: MovaColors.violet.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: const Text(
                        'Recommandé',
                        style: TextStyle(fontSize: 11, color: MovaColors.violet, fontWeight: FontWeight.w600),
                      ),
                    ),
                ],
              ),
              subtitle: Text(v.$3, style: const TextStyle(fontSize: 12)),
              value: v.$1,
              groupValue: _vehicleCategory,
              onChanged: (val) => setState(() {
                _vehicleCategory = val!;
                _estimatedPrice = null;
                _estimateBreakdown = null;
              }),
            );
          }),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: Text('Photos inventaire (${_photos.length})', style: theme.textTheme.titleSmall),
              ),
              TextButton.icon(
                onPressed: _uploadingPhoto ? null : _addPhoto,
                icon: _uploadingPhoto
                    ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.camera_alt_outlined),
                label: const Text('Ajouter'),
              ),
            ],
          ),
          if (_photos.isNotEmpty)
            SizedBox(
              height: 88,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: _photos.length,
                separatorBuilder: (_, __) => const SizedBox(width: 8),
                itemBuilder: (_, i) => movingPhotoThumbnail(
                  localPath: _photos[i].localPath,
                  remoteUrl: _photos[i].remoteUrl,
                  onRemove: () => setState(() {
                    _photos.removeAt(i);
                    _estimatedPrice = null;
                    _estimateBreakdown = null;
                  }),
                ),
              ),
            ),
          const SizedBox(height: 8),
          Text('Meubles / cartons', style: theme.textTheme.titleSmall),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _itemController,
                  decoration: const InputDecoration(
                    hintText: 'Ex: Canapé, Cartons x10…',
                    isDense: true,
                  ),
                  onSubmitted: (_) => _addItem(),
                ),
              ),
              IconButton(
                icon: const Icon(Icons.add_circle, color: MovaColors.violet),
                onPressed: _addItem,
              ),
            ],
          ),
          ...List.generate(_items.length, (i) {
            return Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: MovaCard(
                child: Row(
                  children: [
                    Expanded(child: Text(_items[i], maxLines: 2, overflow: TextOverflow.ellipsis)),
                    IconButton(icon: const Icon(Icons.close, size: 20), onPressed: () => _removeItem(i)),
                  ],
                ),
              ),
            );
          }),
          if (_estimatedPrice != null) ...[
            const SizedBox(height: 16),
            ServicePriceDisplay.movingEstimateCard(
              _estimateBreakdown ?? {'estimatedPriceCdf': _estimatedPrice, 'type': 'MOVING'},
            ),
            if (_distanceKm != null) ...[
              const SizedBox(height: 8),
              Text(
                'Distance : ${_distanceKm!.toStringAsFixed(1)} km — volume ${_volumeM3()} m³',
                style: theme.textTheme.bodySmall?.copyWith(color: MovaColors.textSecondary),
              ),
            ],
          ],
          if (_validationError != null) ...[
            const SizedBox(height: 16),
            MovaErrorBanner(message: _validationError!),
          ],
          PromoCodeField(
            controller: _promoController,
            onChanged: () => setState(() {
              _estimatedPrice = null;
              _estimateBreakdown = null;
            }),
          ),
          if (_error != null) ...[
            const SizedBox(height: 16),
            MovaErrorBanner(message: _error!, onRetry: _estimate),
          ],
          const SizedBox(height: 24),
          MovaButton(
            label: _estimatedPrice == null ? 'Estimer le déménagement' : 'Demander un devis',
            isLoading: _loading,
            icon: _estimatedPrice == null ? Icons.calculate_outlined : Icons.local_shipping_outlined,
            onPressed: _loading ? null : (_estimatedPrice == null ? _estimate : _request),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  Widget _myRequestsTab(ThemeData theme) {
    if (_loadingRequests) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_myRequests.isEmpty) {
      return RefreshIndicator(
        onRefresh: _loadMyRequests,
        child: ListView(
          physics: kMovaScrollPhysics,
          children: [
            const SizedBox(height: 48),
            Icon(Icons.inventory_2_outlined, size: 48, color: MovaColors.textSecondary.withValues(alpha: 0.5)),
            const SizedBox(height: 16),
            Text(
              'Aucune demande de déménagement',
              textAlign: TextAlign.center,
              style: theme.textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            Text(
              'Créez une nouvelle demande dans l\'onglet « Nouvelle demande ».',
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium?.copyWith(color: MovaColors.textSecondary),
            ),
          ],
        ),
      );
    }
    return RefreshIndicator(
      onRefresh: _loadMyRequests,
      child: ListView.separated(
        physics: kMovaScrollPhysics,
        padding: const EdgeInsets.only(bottom: 24),
        itemCount: _myRequests.length,
        separatorBuilder: (_, __) => const SizedBox(height: 8),
        itemBuilder: (_, i) {
          final r = _myRequests[i];
          return MovaCard(
            onTap: () => _openRequestDetail(r),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '${r['pickupAddress'] ?? ''} → ${r['dropoffAddress'] ?? ''}',
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        historyStatusLabel(r['status']?.toString()),
                        style: const TextStyle(color: MovaColors.violet, fontSize: 13),
                      ),
                      if (r['estimatedPriceCdf'] != null)
                        Text(
                          MarketConfig.formatCdf(r['estimatedPriceCdf'] as int),
                          style: theme.textTheme.bodySmall,
                        ),
                    ],
                  ),
                ),
                const Icon(Icons.chevron_right),
              ],
            ),
          );
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return MovaScreen(
      title: 'Déménagement',
      scrollable: false,
      child: Column(
        children: [
          TabBar(
            controller: _tabController,
            labelColor: MovaColors.violet,
            tabs: [
              const Tab(text: 'Nouvelle demande'),
              Tab(text: 'Mes demandes${_myRequests.isNotEmpty ? ' (${_myRequests.length})' : ''}'),
            ],
          ),
          Expanded(
            child: TabBarView(
              controller: _tabController,
              children: [
                RefreshIndicator(
                  onRefresh: () async {
                    await _useMyLocation();
                    await _loadMyRequests(silent: true);
                  },
                  child: _newRequestTab(Theme.of(context)),
                ),
                _myRequestsTab(Theme.of(context)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

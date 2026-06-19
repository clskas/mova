import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import '../../core/api/api_client.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import '../history/history_detail_dialog.dart';
import 'moving_tracking_screen.dart';

const _volumeOptions = [
  ('STUDIO', 'Studio / chambre', '1–5 m³'),
  ('APARTMENT', 'Appartement', '5–15 m³'),
  ('HOUSE', 'Maison', '15–30 m³'),
  ('OFFICE', 'Bureau', 'Sur devis'),
];

class _MovingPhoto {
  _MovingPhoto({this.localPath, this.remoteUrl});
  final String? localPath;
  final String? remoteUrl;
}

class MovingScreen extends ConsumerStatefulWidget {
  const MovingScreen({super.key});

  @override
  ConsumerState<MovingScreen> createState() => _MovingScreenState();
}

class _MovingScreenState extends ConsumerState<MovingScreen> {
  final _fromController = TextEditingController(text: 'Bandal, Kinshasa');
  final _toController = TextEditingController();
  final _itemController = TextEditingController();
  String _volume = 'APARTMENT';
  int _rooms = 2;
  final List<String> _items = [];
  final List<_MovingPhoto> _photos = [];
  final _picker = ImagePicker();
  bool _uploadingPhoto = false;
  int? _estimatedPrice;
  bool _loading = false;
  bool _loadingRequests = true;
  List<Map<String, dynamic>> _myRequests = [];
  String? _error;
  String? _validationError;
  Timer? _pollTimer;

  static const _fromLat = MarketConfig.defaultLat + 0.01;
  static const _fromLng = MarketConfig.defaultLng - 0.01;
  static const _toLat = MarketConfig.defaultLat - 0.04;
  static const _toLng = MarketConfig.defaultLng + 0.05;

  @override
  void initState() {
    super.initState();
    _loadMyRequests();
    _pollTimer = Timer.periodic(const Duration(seconds: 12), (_) => _loadMyRequests(silent: true));
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _fromController.dispose();
    _toController.dispose();
    _itemController.dispose();
    super.dispose();
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
            : (data is Map
                ? (data['data'] as List? ?? data['movings'] as List? ?? [])
                : []);
        _myRequests = list.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
      }
    });
  }

  void _addItem() {
    final text = _itemController.text.trim();
    if (text.isEmpty) return;
    setState(() {
      _items.add(text);
      _itemController.clear();
      _estimatedPrice = null;
    });
  }

  void _removeItem(int index) {
    setState(() {
      _items.removeAt(index);
      _estimatedPrice = null;
    });
  }

  int _volumeM3() {
    final base = switch (_volume) {
      'STUDIO' => 3,
      'APARTMENT' => 10,
      'HOUSE' => 22,
      'OFFICE' => 15,
      _ => 10,
    };
    return (base + (_rooms - 1) * 2).clamp(1, 50);
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
    final result = await api.uploadParcelPhoto(File(localPath));
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
    return {
      'pickupAddress': _fromController.text.trim(),
      'pickupLat': _fromLat,
      'pickupLng': _fromLng,
      'dropoffAddress': _toController.text.trim(),
      'dropoffLat': _toLat,
      'dropoffLng': _toLng,
      'volumeM3': _volumeM3(),
      if (_items.isNotEmpty) 'itemsNotes': _items.join(', '),
      if (_uploadedPhotoUrls.isNotEmpty) 'photoUrls': _uploadedPhotoUrls,
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
    final api = ref.read(apiClientProvider);
    await api.checkHealth();
    final result = await api.post('/moving/estimate', _payload());
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

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return MovaScreen(
      title: 'Déménagement',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Décrivez votre déménagement — camion + manutention. '
            'MOVA assigne une équipe après validation admin.',
            style: theme.textTheme.bodyMedium?.copyWith(color: MovaColors.textSecondary),
          ),
          const SizedBox(height: 16),
          if (_loadingRequests)
            const LinearProgressIndicator(minHeight: 2)
          else if (_myRequests.isNotEmpty) ...[
            Text('Mes demandes', style: theme.textTheme.titleSmall),
            const SizedBox(height: 8),
            ..._myRequests.take(5).map((r) {
              return Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: MovaCard(
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
                            Text(
                              historyStatusLabel(r['status']?.toString()),
                              style: const TextStyle(color: MovaColors.violet, fontSize: 13),
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
            const Divider(height: 24),
            Text('Nouvelle demande', style: theme.textTheme.titleSmall),
            const SizedBox(height: 12),
          ],
          TextField(
            controller: _fromController,
            decoration: const InputDecoration(
              labelText: 'Adresse de départ',
              prefixIcon: Icon(Icons.home_outlined),
            ),
            onChanged: (_) => setState(() => _estimatedPrice = null),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _toController,
            decoration: const InputDecoration(
              labelText: 'Adresse d\'arrivée',
              hintText: 'Ex: Ngaliema, Gombe…',
              prefixIcon: Icon(Icons.place_outlined),
            ),
            onChanged: (_) => setState(() => _estimatedPrice = null),
          ),
          const SizedBox(height: 16),
          Text('Nombre de pièces', style: theme.textTheme.titleSmall),
          Slider(
            value: _rooms.toDouble(),
            min: 1,
            max: 8,
            divisions: 7,
            label: '$_rooms',
            onChanged: (v) => setState(() {
              _rooms = v.round();
              _estimatedPrice = null;
            }),
          ),
          Text(
            'Volume estimé : ${_volumeM3()} m³',
            style: theme.textTheme.bodySmall?.copyWith(color: MovaColors.textSecondary),
          ),
          const SizedBox(height: 8),
          Text('Volume / type de logement', style: theme.textTheme.titleSmall),
          const SizedBox(height: 8),
          ..._volumeOptions.map((v) {
            return RadioListTile<String>(
              title: Text(v.$2),
              subtitle: Text(v.$3, style: const TextStyle(fontSize: 12)),
              value: v.$1,
              groupValue: _volume,
              onChanged: (val) => setState(() {
                _volume = val!;
                _estimatedPrice = null;
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
                    Expanded(
                      child: Text(_items[i], maxLines: 2, overflow: TextOverflow.ellipsis),
                    ),
                    IconButton(
                      icon: const Icon(Icons.close, size: 20),
                      onPressed: () => _removeItem(i),
                    ),
                  ],
                ),
              ),
            );
          }),
          if (_estimatedPrice != null) ...[
            const SizedBox(height: 16),
            MovaCard(
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Expanded(child: Text('Estimation (camion + équipe)')),
                  Text(
                    MarketConfig.formatCdf(_estimatedPrice!),
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: MovaColors.green,
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
            label: _estimatedPrice == null ? 'Estimer le déménagement' : 'Demander un devis',
            isLoading: _loading,
            icon: _estimatedPrice == null ? Icons.calculate_outlined : Icons.local_shipping_outlined,
            onPressed: _loading ? null : (_estimatedPrice == null ? _estimate : _request),
          ),
        ],
      ),
    );
  }
}

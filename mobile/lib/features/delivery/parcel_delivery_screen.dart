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
import 'parcel_tracking_screen.dart';

const _weightCategories = [
  ('DOCUMENTS', 'Documents', 'Enveloppe, dossier'),
  ('SMALL', 'Petit colis', '< 1 kg'),
  ('MEDIUM', 'Moyen', '1 – 5 kg'),
  ('LARGE', 'Grand', '> 5 kg'),
];

class ParcelDeliveryScreen extends ConsumerStatefulWidget {
  const ParcelDeliveryScreen({super.key});

  @override
  ConsumerState<ParcelDeliveryScreen> createState() => _ParcelDeliveryScreenState();
}

class _ParcelDeliveryScreenState extends ConsumerState<ParcelDeliveryScreen> {
  final _pickupController = TextEditingController(text: 'Ma position, Kinshasa');
  final _dropoffController = TextEditingController();
  final _picker = ImagePicker();
  String _weightCategory = 'DOCUMENTS';
  File? _photoFile;
  int? _estimatedPrice;
  bool _loading = false;
  String? _error;
  String? _validationError;

  static const _pickupLat = MarketConfig.defaultLat;
  static const _pickupLng = MarketConfig.defaultLng;
  static const _dropoffLat = MarketConfig.defaultLat - 0.03;
  static const _dropoffLng = MarketConfig.defaultLng + 0.04;

  @override
  void dispose() {
    _pickupController.dispose();
    _dropoffController.dispose();
    super.dispose();
  }

  Map<String, dynamic> _parcelPayload({bool includePhoto = false}) {
    final payload = {
      'pickupAddress': _pickupController.text.trim(),
      'dropoffAddress': _dropoffController.text.trim(),
      'weightCategory': _weightCategory,
      'pickupLat': _pickupLat,
      'pickupLng': _pickupLng,
      'dropoffLat': _dropoffLat,
      'dropoffLng': _dropoffLng,
    };
    if (includePhoto && _photoFile != null) {
      // Stub local — upload Cloudinary non configuré côté mobile
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
      );
      if (picked != null) {
        setState(() => _photoFile = File(picked.path));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Impossible d\'accéder à la caméra ou à la galerie.')),
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
    final api = ref.read(apiClientProvider);
    await api.checkHealth();
    final result = await api.post('/deliveries/parcel/estimate', _parcelPayload());
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
    final api = ref.read(apiClientProvider);
    final result = await api.post('/deliveries/parcel', _parcelPayload(includePhoto: true));
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
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
            controller: _pickupController,
            decoration: const InputDecoration(
              labelText: 'Adresse d\'enlèvement',
              prefixIcon: Icon(Icons.upload_outlined),
            ),
            onChanged: (_) => setState(() => _estimatedPrice = null),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _dropoffController,
            decoration: const InputDecoration(
              labelText: 'Adresse de livraison',
              hintText: 'Ex: Limete, Masina…',
              prefixIcon: Icon(Icons.place_outlined),
            ),
            onChanged: (_) => setState(() => _estimatedPrice = null),
          ),
          const SizedBox(height: 16),
          Text('Catégorie de poids', style: theme.textTheme.titleSmall),
          const SizedBox(height: 8),
          ..._weightCategories.map((cat) {
            return RadioListTile<String>(
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
            icon: Icon(_photoFile != null ? Icons.check_circle : Icons.add_a_photo_outlined),
            label: Text(
              _photoFile != null ? 'Photo ajoutée (optionnel)' : 'Ajouter une photo (optionnel)',
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
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('Estimation', style: TextStyle(fontSize: 16)),
                  Text(
                    MarketConfig.formatCdf(_estimatedPrice!),
                    style: const TextStyle(
                      fontSize: 20,
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
            label: _estimatedPrice == null ? 'Estimer le prix' : 'Confirmer l\'envoi',
            isLoading: _loading,
            icon: _estimatedPrice == null ? Icons.calculate_outlined : Icons.local_shipping_outlined,
            onPressed: _loading
                ? null
                : (_estimatedPrice == null ? _estimate : _confirm),
          ),
        ],
      ),
    );
  }
}

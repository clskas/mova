import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_client.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import 'parcel_tracking_screen.dart';

const _weightCategories = [
  ('LIGHT', 'Léger', '< 1 kg'),
  ('MEDIUM', 'Moyen', '1 – 5 kg'),
  ('HEAVY', 'Lourd', '5 – 15 kg'),
  ('VERY_HEAVY', 'Très lourd', '> 15 kg'),
];

class ParcelDeliveryScreen extends ConsumerStatefulWidget {
  const ParcelDeliveryScreen({super.key});

  @override
  ConsumerState<ParcelDeliveryScreen> createState() => _ParcelDeliveryScreenState();
}

class _ParcelDeliveryScreenState extends ConsumerState<ParcelDeliveryScreen> {
  final _pickupController = TextEditingController(text: 'Ma position, Kinshasa');
  final _dropoffController = TextEditingController();
  String _weightCategory = 'LIGHT';
  bool _hasPhoto = false;
  int? _estimatedPrice;
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _pickupController.dispose();
    _dropoffController.dispose();
    super.dispose();
  }

  Future<void> _estimate() async {
    if (_dropoffController.text.trim().isEmpty) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    final api = ref.read(apiClientProvider);
    await api.loadToken();
    await api.checkHealth();
    final result = await api.post('/deliveries/parcel/estimate', {
      'pickupAddress': _pickupController.text.trim(),
      'dropoffAddress': _dropoffController.text.trim(),
      'weightCategory': _weightCategory,
    });
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
    setState(() {
      _loading = true;
      _error = null;
    });
    final api = ref.read(apiClientProvider);
    final result = await api.post('/deliveries/parcel', {
      'pickupAddress': _pickupController.text.trim(),
      'dropoffAddress': _dropoffController.text.trim(),
      'weightCategory': _weightCategory,
      'hasPhoto': _hasPhoto,
      'pickupLat': MarketConfig.defaultLat,
      'pickupLng': MarketConfig.defaultLng,
      'dropoffLat': MarketConfig.defaultLat - 0.03,
      'dropoffLng': MarketConfig.defaultLng + 0.04,
    });
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
            onPressed: () => setState(() => _hasPhoto = !_hasPhoto),
            icon: Icon(_hasPhoto ? Icons.check_circle : Icons.add_a_photo_outlined),
            label: Text(
              _hasPhoto ? 'Photo ajoutée (optionnel)' : 'Ajouter une photo (optionnel)',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
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
          if (_error != null) ...[
            const SizedBox(height: 16),
            MovaErrorBanner(message: _error!, onRetry: _estimate),
          ],
          const SizedBox(height: 24),
          MovaButton(
            label: _estimatedPrice == null ? 'Estimer le prix' : 'Confirmer l\'envoi',
            isLoading: _loading,
            icon: _estimatedPrice == null ? Icons.calculate_outlined : Icons.local_shipping_outlined,
            onPressed: _estimatedPrice == null ? _estimate : _confirm,
          ),
        ],
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_client.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import 'moving_tracking_screen.dart';

const _volumeOptions = [
  ('STUDIO', 'Studio / chambre', '1–5 m³'),
  ('APARTMENT', 'Appartement', '5–15 m³'),
  ('HOUSE', 'Maison', '15–30 m³'),
  ('OFFICE', 'Bureau', 'Sur devis'),
];

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
  final List<String> _items = [];
  int? _estimatedPrice;
  bool _loading = false;
  String? _error;
  String? _validationError;

  static const _fromLat = MarketConfig.defaultLat + 0.01;
  static const _fromLng = MarketConfig.defaultLng - 0.01;
  static const _toLat = MarketConfig.defaultLat - 0.04;
  static const _toLng = MarketConfig.defaultLng + 0.05;

  @override
  void dispose() {
    _fromController.dispose();
    _toController.dispose();
    _itemController.dispose();
    super.dispose();
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

  int _volumeM3() => switch (_volume) {
        'STUDIO' => 3,
        'APARTMENT' => 10,
        'HOUSE' => 22,
        'OFFICE' => 15,
        _ => 10,
      };

  Map<String, dynamic> _payload() => {
        'pickupAddress': _fromController.text.trim(),
        'pickupLat': _fromLat,
        'pickupLng': _fromLng,
        'dropoffAddress': _toController.text.trim(),
        'dropoffLat': _toLat,
        'dropoffLng': _toLng,
        'volumeM3': _volumeM3(),
        if (_items.isNotEmpty) 'notes': _items.join(', '),
      };

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
          final request = data['request'] as Map<String, dynamic>? ??
              data['moving'] as Map<String, dynamic>? ??
              data;
          Navigator.pushReplacement(
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

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return MovaScreen(
      title: 'Déménagement',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Décrivez votre déménagement — camion + manutention.',
            style: theme.textTheme.bodyMedium?.copyWith(color: MovaColors.textSecondary),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 16),
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
          Text('Volume estimé', style: theme.textTheme.titleSmall),
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
                      child: Text(
                        _items[i],
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
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

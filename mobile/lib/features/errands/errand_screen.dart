import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_client.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';

class ErrandScreen extends ConsumerStatefulWidget {
  const ErrandScreen({super.key});

  @override
  ConsumerState<ErrandScreen> createState() => _ErrandScreenState();
}

class _ErrandScreenState extends ConsumerState<ErrandScreen> {
  final _addressController = TextEditingController(text: 'Ma position, Kinshasa');
  final _itemController = TextEditingController();
  final List<String> _items = [];
  int? _estimatedPrice;
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _addressController.dispose();
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

  Future<void> _estimate() async {
    if (_items.isEmpty || _addressController.text.trim().isEmpty) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    final api = ref.read(apiClientProvider);
    await api.loadToken();
    await api.checkHealth();
    final result = await api.post('/deliveries/errand/estimate', {
      'deliveryAddress': _addressController.text.trim(),
      'items': _items,
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
    final result = await api.post('/deliveries/errand', {
      'deliveryAddress': _addressController.text.trim(),
      'items': _items,
      'deliveryLat': MarketConfig.defaultLat,
      'deliveryLng': MarketConfig.defaultLng,
    });
    setState(() => _loading = false);
    switch (result) {
      case Success(:final data):
        if (mounted) {
          final errand = data['errand'] as Map<String, dynamic>?;
          showDialog<void>(
            context: context,
            builder: (ctx) => AlertDialog(
              title: const Text('Course envoyée'),
              content: Text(
                'Votre liste a été transmise à un livreur.\n'
                'Réf. : ${errand?['id'] ?? ''}\n'
                'Total : ${MarketConfig.formatCdf(errand?['priceCdf'] as int? ?? _estimatedPrice ?? 0)}',
                maxLines: 5,
                overflow: TextOverflow.ellipsis,
              ),
              actions: [
                TextButton(
                  onPressed: () {
                    Navigator.pop(ctx);
                    Navigator.pop(context);
                  },
                  child: const Text('OK'),
                ),
              ],
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
      title: 'Courses & commissions',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Listez vos achats — un livreur s\'en charge pour vous.',
            style: theme.textTheme.bodyMedium?.copyWith(color: MovaColors.textSecondary),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _addressController,
            decoration: const InputDecoration(
              labelText: 'Adresse de livraison',
              prefixIcon: Icon(Icons.home_outlined),
            ),
            onChanged: (_) => setState(() => _estimatedPrice = null),
          ),
          const SizedBox(height: 16),
          Text('Liste de courses', style: theme.textTheme.titleSmall),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _itemController,
                  decoration: const InputDecoration(
                    hintText: 'Ex: Riz 5 kg, Pain, Savon…',
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
          if (_items.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: Text(
                'Ajoutez au moins un article',
                style: theme.textTheme.bodySmall?.copyWith(color: MovaColors.textSecondary),
              ),
            )
          else
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
                  const Text('Estimation (service + achats approx.)'),
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
          if (_error != null) ...[
            const SizedBox(height: 16),
            MovaErrorBanner(message: _error!, onRetry: _estimate),
          ],
          const SizedBox(height: 24),
          MovaButton(
            label: _estimatedPrice == null ? 'Estimer le prix' : 'Envoyer au livreur',
            isLoading: _loading,
            icon: _estimatedPrice == null ? Icons.calculate_outlined : Icons.send_outlined,
            onPressed: _items.isEmpty
                ? null
                : (_estimatedPrice == null ? _estimate : _confirm),
          ),
        ],
      ),
    );
  }
}

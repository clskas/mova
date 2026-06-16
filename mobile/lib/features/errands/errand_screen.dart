import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_client.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/location/location_service.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import 'errand_tracking_screen.dart';

class ErrandScreen extends ConsumerStatefulWidget {
  const ErrandScreen({super.key});

  @override
  ConsumerState<ErrandScreen> createState() => _ErrandScreenState();
}

class _ErrandScreenState extends ConsumerState<ErrandScreen> {
  final _pickupController = TextEditingController(text: 'Commerce / pharmacie, Gombe');
  final _dropoffController = TextEditingController(text: 'Ma position');
  final _itemController = TextEditingController();
  final List<String> _items = [];
  final _budgetController = TextEditingController();
  int? _estimatedPrice;
  bool _loading = false;
  bool _loadingGps = false;
  double? _deliveryLat;
  double? _deliveryLng;
  String? _error;
  String? _validationError;

  @override
  void dispose() {
    _pickupController.dispose();
    _dropoffController.dispose();
    _itemController.dispose();
    _budgetController.dispose();
    super.dispose();
  }

  void _addItem() {
    final text = _itemController.text.trim();
    if (text.isEmpty) return;
    setState(() {
      _items.add(text);
      _itemController.clear();
      _estimatedPrice = null;
      _validationError = null;
    });
  }

  void _removeItem(int index) {
    setState(() {
      _items.removeAt(index);
      _estimatedPrice = null;
    });
  }

  String _buildDescription() => _items.join(', ');

  Future<void> _useMyLocation() async {
    setState(() => _loadingGps = true);
    final result = await LocationService.getCurrentLocation();
    if (!mounted) return;
    setState(() {
      _loadingGps = false;
      if (result != null) {
        _dropoffController.text = result.label;
        _deliveryLat = result.position.latitude;
        _deliveryLng = result.position.longitude;
        _estimatedPrice = null;
      }
    });
  }

  Map<String, dynamic> _errandPayload() {
    final items = List<String>.from(_items);
    final budget = int.tryParse(_budgetController.text.trim());
    if (budget != null && budget > 0) {
      items.insert(0, 'Budget max: ${MarketConfig.formatCdf(budget)}');
    }
    return {
      'pickupAddress': _pickupController.text.trim(),
      'deliveryAddress': _dropoffController.text.trim(),
      'deliveryLat': _deliveryLat ?? MarketConfig.defaultLat,
      'deliveryLng': _deliveryLng ?? MarketConfig.defaultLng,
      'items': items,
    };
  }

  String? _validate() {
    if (_items.isEmpty) return 'Ajoutez au moins un article à la liste.';
    if (_pickupController.text.trim().isEmpty) {
      return 'Indiquez l\'adresse du commerce ou point de retrait.';
    }
    if (_dropoffController.text.trim().isEmpty) {
      return 'Indiquez l\'adresse de livraison.';
    }
    if (_buildDescription().length < 5) {
      return 'Décrivez vos achats (minimum 5 caractères).';
    }
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
    final result = await api.post('/deliveries/errand/estimate', _errandPayload());
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
    await api.checkHealth();
    final result = await api.post('/deliveries/errand', _errandPayload());
    setState(() => _loading = false);
    switch (result) {
      case Success(:final data):
        if (mounted) {
          final order = data['errand'] as Map<String, dynamic>? ??
              data['order'] as Map<String, dynamic>?;
          Navigator.pushReplacement(
            context,
            MaterialPageRoute(
              builder: (_) => ErrandTrackingScreen(
                errandId: order?['id']?.toString() ?? '',
                deliveryAddress: _dropoffController.text.trim(),
                items: List<String>.from(_items),
                totalCdf: order?['estimatedPriceCdf'] as int? ?? _estimatedPrice ?? 0,
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
            controller: _pickupController,
            decoration: const InputDecoration(
              labelText: 'Point de retrait (commerce)',
              hintText: 'Ex: Pharmacie du coin, Marché…',
              prefixIcon: Icon(Icons.store_outlined),
            ),
            onChanged: (_) => setState(() => _estimatedPrice = null),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _dropoffController,
            decoration: InputDecoration(
              labelText: 'Adresse de livraison',
              prefixIcon: const Icon(Icons.home_outlined),
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
            onChanged: (_) => setState(() {
              _estimatedPrice = null;
              _deliveryLat = null;
              _deliveryLng = null;
            }),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _budgetController,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(
              labelText: 'Budget achats max (FC, optionnel)',
              hintText: 'Ex: 50000',
              prefixIcon: Icon(Icons.account_balance_wallet_outlined),
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
                  const Expanded(
                    child: Text('Estimation (service + trajet)'),
                  ),
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
            label: _estimatedPrice == null ? 'Estimer le prix' : 'Envoyer au livreur',
            isLoading: _loading,
            icon: _estimatedPrice == null ? Icons.calculate_outlined : Icons.send_outlined,
            onPressed: _loading
                ? null
                : (_estimatedPrice == null ? _estimate : _confirm),
          ),
        ],
      ),
    );
  }
}

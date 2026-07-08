import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_client.dart';
import '../../core/billing/service_price_display.dart';
import '../../core/error/result.dart';
import '../../core/location/location_service.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import '../../widgets/promo_code_field.dart';
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
  final _promoController = TextEditingController();
  int? _estimatedPrice;
  int? _estimatedPurchaseCdf;
  bool _loading = false;
  bool _loadingGps = false;
  bool _loadingPickupSuggestions = false;
  bool _loadingDropoffSuggestions = false;
  bool _showPickupSuggestions = false;
  bool _showDropoffSuggestions = false;
  List<Map<String, dynamic>> _pickupSuggestions = [];
  List<Map<String, dynamic>> _dropoffSuggestions = [];
  double? _pickupLat;
  double? _pickupLng;
  double? _deliveryLat;
  double? _deliveryLng;
  String? _error;
  String? _validationError;
  Timer? _pickupDebounce;
  Timer? _dropoffDebounce;

  @override
  void dispose() {
    _pickupDebounce?.cancel();
    _dropoffDebounce?.cancel();
    _pickupController.dispose();
    _dropoffController.dispose();
    _itemController.dispose();
    _budgetController.dispose();
    _promoController.dispose();
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
    final budget = int.tryParse(_budgetController.text.trim());
    return {
      'pickupAddress': _pickupController.text.trim(),
      if (_pickupLat != null) 'pickupLat': _pickupLat,
      if (_pickupLng != null) 'pickupLng': _pickupLng,
      'deliveryAddress': _dropoffController.text.trim(),
      if (_deliveryLat != null) 'deliveryLat': _deliveryLat,
      if (_deliveryLng != null) 'deliveryLng': _deliveryLng,
      'items': List<String>.from(_items),
      if (budget != null && budget > 0) 'budgetCdf': budget,
      if (_promoController.text.trim().isNotEmpty) 'promoCode': _promoController.text.trim(),
    };
  }

  void _onPickupChanged(String value) {
    _pickupDebounce?.cancel();
    _pickupDebounce = Timer(const Duration(milliseconds: 350), () => _fetchPickupSuggestions(value));
    setState(() {
      _estimatedPrice = null;
      _estimatedPurchaseCdf = null;
      _pickupLat = null;
      _pickupLng = null;
    });
  }

  Future<void> _fetchPickupSuggestions(String query) async {
    if (query.trim().length < 2) {
      setState(() {
        _pickupSuggestions = [];
        _showPickupSuggestions = false;
      });
      return;
    }
    setState(() => _loadingPickupSuggestions = true);
    final result = await ref.read(apiClientProvider).geoAutocomplete(query.trim());
    if (!mounted) return;
    setState(() {
      _loadingPickupSuggestions = false;
      switch (result) {
        case Success(:final data):
          _pickupSuggestions = data;
          _showPickupSuggestions = data.isNotEmpty;
        case Failure():
          _pickupSuggestions = [];
          _showPickupSuggestions = false;
      }
    });
  }

  void _selectPickupSuggestion(Map<String, dynamic> suggestion) {
    final label = suggestion['label']?.toString() ?? suggestion['address']?.toString() ?? '';
    _pickupController.text = label;
    setState(() {
      _pickupLat = (suggestion['lat'] as num?)?.toDouble();
      _pickupLng = (suggestion['lng'] as num?)?.toDouble();
      _showPickupSuggestions = false;
      _pickupSuggestions = [];
      _estimatedPrice = null;
      _estimatedPurchaseCdf = null;
    });
  }

  void _onDropoffChanged(String value) {
    _dropoffDebounce?.cancel();
    _dropoffDebounce = Timer(const Duration(milliseconds: 350), () => _fetchDropoffSuggestions(value));
    setState(() {
      _estimatedPrice = null;
      _estimatedPurchaseCdf = null;
      _deliveryLat = null;
      _deliveryLng = null;
    });
  }

  Future<void> _fetchDropoffSuggestions(String query) async {
    if (query.trim().length < 2) {
      setState(() {
        _dropoffSuggestions = [];
        _showDropoffSuggestions = false;
      });
      return;
    }
    setState(() => _loadingDropoffSuggestions = true);
    final result = await ref.read(apiClientProvider).geoAutocomplete(query.trim());
    if (!mounted) return;
    setState(() {
      _loadingDropoffSuggestions = false;
      switch (result) {
        case Success(:final data):
          _dropoffSuggestions = data;
          _showDropoffSuggestions = data.isNotEmpty;
        case Failure():
          _dropoffSuggestions = [];
          _showDropoffSuggestions = false;
      }
    });
  }

  void _selectDropoffSuggestion(Map<String, dynamic> suggestion) {
    final label = suggestion['label']?.toString() ?? suggestion['address']?.toString() ?? '';
    _dropoffController.text = label;
    setState(() {
      _deliveryLat = (suggestion['lat'] as num?)?.toDouble();
      _deliveryLng = (suggestion['lng'] as num?)?.toDouble();
      _showDropoffSuggestions = false;
      _dropoffSuggestions = [];
      _estimatedPrice = null;
      _estimatedPurchaseCdf = null;
    });
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
          _estimatedPurchaseCdf = data['estimatedPurchaseCdf'] as int?;
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
            decoration: InputDecoration(
              labelText: 'Point de retrait (commerce)',
              hintText: 'Ex: Pharmacie, Marché Central…',
              prefixIcon: const Icon(Icons.store_outlined),
              suffixIcon: _loadingPickupSuggestions
                  ? const Padding(
                      padding: EdgeInsets.all(12),
                      child: SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)),
                    )
                  : null,
            ),
            onChanged: _onPickupChanged,
          ),
          if (_showPickupSuggestions)
            Card(
              margin: const EdgeInsets.only(top: 4),
              child: Column(
                children: _pickupSuggestions.take(6).map((s) {
                  final source = s['source']?.toString();
                  final icon = source == 'poi' ? Icons.place : Icons.location_on_outlined;
                  return ListTile(
                    dense: true,
                    leading: Icon(icon, color: MovaColors.violet, size: 20),
                    title: Text(s['label']?.toString() ?? '', maxLines: 2, overflow: TextOverflow.ellipsis),
                    onTap: () => _selectPickupSuggestion(s),
                  );
                }).toList(),
              ),
            ),
          const SizedBox(height: 12),
          TextField(
            controller: _dropoffController,
            decoration: InputDecoration(
              labelText: 'Adresse de livraison',
              prefixIcon: const Icon(Icons.home_outlined),
              suffixIcon: _loadingDropoffSuggestions
                  ? const Padding(
                      padding: EdgeInsets.all(12),
                      child: SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)),
                    )
                  : _loadingGps
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
            onChanged: _onDropoffChanged,
          ),
          if (_showDropoffSuggestions)
            Card(
              margin: const EdgeInsets.only(top: 4),
              child: Column(
                children: _dropoffSuggestions.take(6).map((s) {
                  final source = s['source']?.toString();
                  final icon = source == 'poi' ? Icons.place : Icons.location_on_outlined;
                  return ListTile(
                    dense: true,
                    leading: Icon(icon, color: MovaColors.violet, size: 20),
                    title: Text(s['label']?.toString() ?? '', maxLines: 2, overflow: TextOverflow.ellipsis),
                    onTap: () => _selectDropoffSuggestion(s),
                  );
                }).toList(),
              ),
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
            ServicePriceDisplay.passengerCard(
              {
                'type': 'ERRAND',
                'serviceFeeCdf': _estimatedPrice,
                'purchaseTotalCdf': _estimatedPurchaseCdf ?? 0,
                'totalPriceCdf': _estimatedPrice! + (_estimatedPurchaseCdf ?? 0),
              },
              totalLabel: 'Total estimé',
            ),
          ],
          if (_validationError != null) ...[
            const SizedBox(height: 16),
            MovaErrorBanner(message: _validationError!),
          ],
          PromoCodeField(
            controller: _promoController,
            onChanged: () => setState(() {
              _estimatedPrice = null;
              _estimatedPurchaseCdf = null;
            }),
          ),
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

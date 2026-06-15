import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/api/api_client.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';

class ActiveDeliveryScreen extends ConsumerStatefulWidget {
  const ActiveDeliveryScreen({super.key, required this.delivery});

  final Map<String, dynamic> delivery;

  @override
  ConsumerState<ActiveDeliveryScreen> createState() => _ActiveDeliveryScreenState();
}

class _ActiveDeliveryScreenState extends ConsumerState<ActiveDeliveryScreen> {
  late Map<String, dynamic> _delivery;
  bool _loading = false;
  String? _error;

  String get _deliveryId => _delivery['id']?.toString() ?? '';
  String get _status => _delivery['status']?.toString() ?? 'PENDING';

  String get _typeLabel {
    return switch (_delivery['type']?.toString()) {
      'FOOD' => 'Livraison repas',
      'EXPRESS' => 'Express',
      'PARCEL' => 'Colis',
      _ => 'Livraison',
    };
  }

  @override
  void initState() {
    super.initState();
    _delivery = Map<String, dynamic>.from(widget.delivery);
  }

  Future<void> _refresh() async {
    final result = await ref.read(apiClientProvider).get('/deliveries/$_deliveryId');
    if (!mounted) return;
    if (result case Success(:final data)) {
      setState(() => _delivery = data['delivery'] as Map<String, dynamic>? ?? data);
    }
  }

  Future<void> _advanceStatus(String nextStatus, String successMessage) async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final result = await ref.read(apiClientProvider).updateDeliveryStatus(_deliveryId, nextStatus);
    if (!mounted) return;
    setState(() => _loading = false);
    switch (result) {
      case Success(:final data):
        setState(() => _delivery = data['delivery'] as Map<String, dynamic>? ?? data);
        if (nextStatus == 'DELIVERED') {
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(successMessage)));
          Navigator.pop(context, true);
        } else {
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(successMessage)));
        }
      case Failure(:final error):
        setState(() => _error = error.message);
    }
  }

  Future<void> _openMaps() async {
    final lat = _delivery['dropoffLat'] as num? ?? _delivery['deliveryLat'] as num?;
    final lng = _delivery['dropoffLng'] as num? ?? _delivery['deliveryLng'] as num?;
    if (lat == null || lng == null) return;
    final uri = Uri.parse('https://www.google.com/maps/dir/?api=1&destination=$lat,$lng');
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  String? get _nextAction {
    return switch (_status) {
      'PICKED_UP' => 'IN_TRANSIT',
      'IN_TRANSIT' => 'DELIVERED',
      _ => null,
    };
  }

  String get _actionLabel {
    return switch (_status) {
      'PICKED_UP' => 'En route vers le client',
      'IN_TRANSIT' => 'Marquer comme livré',
      _ => 'Actualiser',
    };
  }

  @override
  Widget build(BuildContext context) {
    final price = _delivery['estimatedPriceCdf'] as int? ?? _delivery['priceCdf'] as int? ?? 0;

    return MovaScreen(
      title: 'Livraison active',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          MovaCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(_typeLabel, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
                const SizedBox(height: 8),
                Text('${_delivery['pickupAddress'] ?? '—'} → ${_delivery['dropoffAddress'] ?? _delivery['deliveryAddress'] ?? '—'}'),
                const SizedBox(height: 8),
                Text(MarketConfig.formatCdf(price), style: const TextStyle(color: MovaColors.green, fontWeight: FontWeight.bold)),
                const SizedBox(height: 4),
                Text('Statut : $_status', style: const TextStyle(color: MovaColors.textSecondary, fontSize: 13)),
              ],
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            MovaErrorBanner(message: _error!),
          ],
          const SizedBox(height: 16),
          if (_nextAction != null)
            MovaButton(
              label: _actionLabel,
              icon: Icons.delivery_dining,
              onPressed: _loading
                  ? null
                  : () => _advanceStatus(
                        _nextAction!,
                        _nextAction == 'DELIVERED' ? 'Livraison terminée' : 'Statut mis à jour',
                      ),
            ),
          const SizedBox(height: 8),
          MovaButton(
            label: 'Ouvrir la navigation',
            isSecondary: true,
            icon: Icons.map_outlined,
            onPressed: _openMaps,
          ),
          const SizedBox(height: 8),
          MovaButton(
            label: 'Actualiser',
            isSecondary: true,
            icon: Icons.refresh,
            onPressed: _loading ? null : _refresh,
          ),
        ],
      ),
    );
  }
}

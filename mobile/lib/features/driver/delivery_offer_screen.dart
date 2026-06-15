import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_client.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';

class DeliveryOfferScreen extends ConsumerStatefulWidget {
  const DeliveryOfferScreen({super.key, required this.offer});

  final Map<String, dynamic> offer;

  @override
  ConsumerState<DeliveryOfferScreen> createState() => _DeliveryOfferScreenState();
}

class _DeliveryOfferScreenState extends ConsumerState<DeliveryOfferScreen> {
  int _countdown = 30;
  bool _loading = false;
  String? _error;
  Timer? _timer;

  String get _deliveryId => widget.offer['id']?.toString() ?? '';

  String get _typeLabel {
    return switch (widget.offer['type']?.toString()) {
      'FOOD' => 'Livraison repas',
      'PARCEL' => 'Colis',
      'EXPRESS' => 'Express',
      _ => 'Livraison',
    };
  }

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      if (_countdown <= 0) {
        _timer?.cancel();
        Navigator.pop(context);
        return;
      }
      setState(() => _countdown--);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _accept() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final api = ref.read(apiClientProvider);
    final result = await api.acceptDelivery(_deliveryId);
    if (!mounted) return;
    setState(() => _loading = false);
    switch (result) {
      case Success():
        _timer?.cancel();
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Livraison acceptée')),
          );
          Navigator.pop(context, true);
        }
      case Failure(:final error):
        setState(() => _error = error.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final price = widget.offer['estimatedPriceCdf'] as int? ??
        widget.offer['priceCdf'] as int? ??
        0;
    final distance = widget.offer['distanceKm'];

    return MovaScreen(
      title: 'Nouvelle livraison',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          MovaCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(_typeLabel, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
                if (widget.offer['restaurantName'] != null)
                  Text(
                    widget.offer['restaurantName']?.toString() ?? '',
                    style: const TextStyle(color: MovaColors.textSecondary),
                  ),
                const SizedBox(height: 12),
                Text(
                  '${widget.offer['pickupAddress'] ?? '—'} → ${widget.offer['dropoffAddress'] ?? widget.offer['deliveryAddress'] ?? '—'}',
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 12),
                Text(
                  MarketConfig.formatCdf(price),
                  style: const TextStyle(
                    fontWeight: FontWeight.bold,
                    color: MovaColors.green,
                    fontSize: 22,
                  ),
                ),
                if (distance != null)
                  Text(
                    'À $distance km',
                    style: const TextStyle(color: MovaColors.textSecondary),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Text(
            'Expire dans $_countdown s',
            textAlign: TextAlign.center,
            style: const TextStyle(color: MovaColors.orange, fontWeight: FontWeight.w600),
          ),
          if (_error != null) ...[
            const SizedBox(height: 16),
            MovaErrorBanner(message: _error!),
          ],
          const Spacer(),
          MovaButton(
            label: 'Accepter la livraison',
            isLoading: _loading,
            icon: Icons.delivery_dining,
            onPressed: _loading ? null : _accept,
          ),
          const SizedBox(height: 12),
          MovaButton(
            label: 'Refuser',
            isSecondary: true,
            onPressed: _loading ? null : () => Navigator.pop(context),
          ),
        ],
      ),
    );
  }
}

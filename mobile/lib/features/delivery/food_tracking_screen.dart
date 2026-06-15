import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:latlong2/latlong.dart';
import '../../core/api/api_client.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import 'widgets/delivery_tracking_map.dart';

class FoodTrackingScreen extends ConsumerStatefulWidget {
  const FoodTrackingScreen({
    super.key,
    required this.orderId,
    required this.restaurantName,
    required this.totalCdf,
    this.deliveryAddress,
  });

  final String orderId;
  final String restaurantName;
  final int totalCdf;
  final String? deliveryAddress;

  @override
  ConsumerState<FoodTrackingScreen> createState() => _FoodTrackingScreenState();
}

class _FoodTrackingScreenState extends ConsumerState<FoodTrackingScreen> {
  Map<String, dynamic>? _delivery;
  bool _loading = true;
  String? _error;
  Timer? _pollTimer;

  @override
  void initState() {
    super.initState();
    _load();
    _pollTimer = Timer.periodic(const Duration(seconds: 5), (_) => _load(silent: true));
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }

  Future<void> _load({bool silent = false}) async {
    if (widget.orderId.isEmpty) return;
    if (!silent) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    final api = ref.read(apiClientProvider);
    final result = await api.get('/deliveries/${widget.orderId}');
    if (!mounted) return;
    setState(() {
      _loading = silent ? _loading : false;
      switch (result) {
        case Success(:final data):
          _delivery = data['delivery'] as Map<String, dynamic>? ?? data;
          _error = null;
        case Failure(:final error):
          if (!silent) _error = error.message;
      }
    });
  }

  List<Map<String, dynamic>> get _timeline {
    final raw = _delivery?['timeline'] as List? ?? _delivery?['tracking'] as List?;
    if (raw != null && raw.isNotEmpty) return raw.cast<Map<String, dynamic>>();
    return const [
      {'label': 'Confirmé', 'done': true},
      {'label': 'Préparation', 'done': false},
      {'label': 'En route', 'done': false},
      {'label': 'Livré', 'done': false},
    ];
  }

  int get _totalCdf =>
      _delivery?['estimatedPriceCdf'] as int? ??
      _delivery?['priceCdf'] as int? ??
      widget.totalCdf;

  String get _statusLabel {
    final status = _delivery?['status']?.toString();
    return switch (status) {
      'DELIVERED' => 'Livré',
      'IN_TRANSIT' => 'En livraison',
      'PICKED_UP' => 'Préparation',
      'PENDING' => 'Confirmé',
      _ => 'En cours de livraison',
    };
  }

  LatLng get _pickup => LatLng(
        (_delivery?['pickupLat'] as num?)?.toDouble() ?? MarketConfig.defaultLat,
        (_delivery?['pickupLng'] as num?)?.toDouble() ?? MarketConfig.defaultLng,
      );

  LatLng? get _dropoff {
    final lat = (_delivery?['dropoffLat'] ?? _delivery?['deliveryLat']) as num?;
    final lng = (_delivery?['dropoffLng'] ?? _delivery?['deliveryLng']) as num?;
    if (lat == null || lng == null) return null;
    return LatLng(lat.toDouble(), lng.toDouble());
  }

  @override
  Widget build(BuildContext context) {
    final courier = _delivery?['courier'] as Map<String, dynamic>?;
    final courierLoc = DeliveryTrackingMap.parseLocation(
      _delivery?['courierLocation'] as Map<String, dynamic>?,
    );
    final eta = DeliveryTrackingMap.etaFromDelivery(_delivery);
    final pin = _delivery?['deliveryPin']?.toString();

    return MovaScreen(
      title: 'Suivi commande',
      scrollable: false,
      padding: EdgeInsets.zero,
      actions: [
        IconButton(icon: const Icon(Icons.refresh), onPressed: () => _load()),
      ],
      child: _loading && _delivery == null
          ? const Center(child: CircularProgressIndicator())
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        if (_error != null) ...[
                          MovaErrorBanner(message: _error!, onRetry: _load),
                          const SizedBox(height: 12),
                        ],
                        DeliveryTrackingMap(
                          pickup: _pickup,
                          dropoff: _dropoff,
                          courier: courierLoc,
                          etaMinutes: eta,
                          deliveryPin: pin,
                          courierName: courier?['name']?.toString(),
                          courierRating: (courier?['rating'] as num?)?.toDouble(),
                        ),
                        const SizedBox(height: 12),
                        MovaCard(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                widget.restaurantName,
                                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                              const SizedBox(height: 4),
                              Text(
                                'Commande #${widget.orderId.length > 8 ? widget.orderId.substring(0, 8) : widget.orderId}',
                                style: const TextStyle(color: MovaColors.textSecondary, fontSize: 13),
                              ),
                              if (widget.deliveryAddress != null) ...[
                                const SizedBox(height: 4),
                                Text(
                                  widget.deliveryAddress!,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ],
                              const SizedBox(height: 8),
                              Text(
                                MarketConfig.formatCdf(_totalCdf),
                                style: const TextStyle(
                                  color: MovaColors.green,
                                  fontWeight: FontWeight.bold,
                                  fontSize: 18,
                                ),
                              ),
                              Text(
                                _statusLabel,
                                style: const TextStyle(color: MovaColors.violet, fontWeight: FontWeight.w600),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 20),
                        Text('Statuts', style: Theme.of(context).textTheme.titleSmall),
                        const SizedBox(height: 12),
                        ..._timeline.map((step) {
                          final done = step['done'] == true;
                          return Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Icon(
                                  done ? Icons.check_circle : Icons.radio_button_unchecked,
                                  color: done ? MovaColors.green : MovaColors.textSecondary,
                                  size: 22,
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Text(
                                    step['label']?.toString() ?? '',
                                    style: TextStyle(
                                      fontWeight: done ? FontWeight.w600 : FontWeight.normal,
                                      color: done ? MovaColors.midnight : MovaColors.textSecondary,
                                    ),
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                              ],
                            ),
                          );
                        }),
                      ],
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: MovaButton(
                    label: 'Retour à l\'accueil',
                    isSecondary: true,
                    icon: Icons.home_outlined,
                    onPressed: () => Navigator.popUntil(context, (r) => r.isFirst),
                  ),
                ),
              ],
            ),
    );
  }
}

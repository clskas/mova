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
import '../booking/payment_screen.dart';
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
  bool _cancelling = false;
  bool _paymentNavigated = false;
  bool _ratingInProgress = false;
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
          _maybeGoToPayment();
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

  bool get _canCancel {
    final status = _delivery?['status']?.toString();
    return status == 'PENDING' || status == 'PICKED_UP';
  }

  Future<bool> _showFoodRatingPrompt() async {
    final api = ref.read(apiClientProvider);
    int score = 5;
    String comment = '';
    String? dialogError;
    bool submitting = false;

    final rated = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setState) {
            return AlertDialog(
              title: const Text('Noter le restaurant'),
              content: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: List.generate(
                        5,
                        (i) => IconButton(
                          icon: Icon(
                            i < score ? Icons.star : Icons.star_border,
                            color: Colors.amber,
                            size: 36,
                          ),
                          onPressed: submitting
                              ? null
                              : () => setState(() => score = i + 1),
                        ),
                      ),
                    ),
                    TextField(
                      enabled: !submitting,
                      maxLines: 3,
                      onChanged: (v) => comment = v,
                      decoration: const InputDecoration(
                        labelText: 'Commentaire (optionnel)',
                        hintText: 'Votre avis…',
                      ),
                    ),
                    if (dialogError != null) ...[
                      const SizedBox(height: 12),
                      Text(
                        dialogError!,
                        style: const TextStyle(color: Colors.red),
                      ),
                    ],
                  ],
                ),
              ),
              actions: [
                TextButton(
                  onPressed: submitting ? null : () => Navigator.pop(ctx, false),
                  child: const Text('Plus tard'),
                ),
                ElevatedButton(
                  onPressed: submitting
                      ? null
                      : () async {
                          setState(() {
                            submitting = true;
                            dialogError = null;
                          });
                          final result = await api.post('/deliveries/${widget.orderId}/rate', {
                            'restaurantScore': score,
                            if (comment.trim().isNotEmpty) 'comment': comment.trim(),
                          });
                          if (!ctx.mounted) return;
                          switch (result) {
                            case Success():
                              Navigator.pop(ctx, true);
                            case Failure(:final error):
                              setState(() => dialogError = error.message);
                          }
                          setState(() => submitting = false);
                        },
                  child: submitting ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Envoyer'),
                ),
              ],
            );
          },
        );
      },
    );

    return rated == true;
  }

  Future<void> _maybeGoToPayment() async {
    if (_paymentNavigated || !mounted) return;
    final status = _delivery?['status']?.toString();
    final paymentReady = _delivery?['paymentReady'] == true || status == 'DELIVERED';
    if (!paymentReady) return;

    final alreadyRated = _delivery?['rated'] == true;
    if (_ratingInProgress) return;
    if (!alreadyRated && !_ratingInProgress) {
      _ratingInProgress = true;
      final rated = await _showFoodRatingPrompt();
      _ratingInProgress = false;
      if (rated && mounted) {
        setState(() => _delivery = {...?_delivery, 'rated': true});
      }
    }

    if (_paymentNavigated || !mounted) return;
    _paymentNavigated = true;
    _pollTimer?.cancel();
    Navigator.pushReplacement(
      context,
      MaterialPageRoute(
        builder: (_) => PaymentScreen(
          serviceType: 'DELIVERY',
          serviceId: widget.orderId,
          amountCdf: _totalCdf,
        ),
      ),
    );
  }

  Future<void> _cancelOrder() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Annuler la commande ?'),
        content: const Text('Votre commande sera annulée si le livreur n\'a pas encore pris en charge.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Non')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Oui, annuler')),
        ],
      ),
    );
    if (confirm != true || !mounted) return;
    setState(() => _cancelling = true);
    _pollTimer?.cancel();
    final api = ref.read(apiClientProvider);
    final result = await api.cancelDelivery(widget.orderId);
    if (!mounted) return;
    setState(() => _cancelling = false);
    switch (result) {
      case Success():
        Navigator.popUntil(context, (r) => r.isFirst);
      case Failure(:final error):
        setState(() => _error = error.message);
        _pollTimer = Timer.periodic(const Duration(seconds: 5), (_) => _load(silent: true));
    }
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
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      if (_canCancel)
                        MovaButton(
                          label: 'Annuler la commande',
                          isSecondary: true,
                          isLoading: _cancelling,
                          icon: Icons.cancel_outlined,
                          onPressed: _cancelling ? null : _cancelOrder,
                        ),
                      if (_canCancel) const SizedBox(height: 8),
                      MovaButton(
                        label: 'Retour à l\'accueil',
                        isSecondary: true,
                        icon: Icons.home_outlined,
                        onPressed: () => Navigator.popUntil(context, (r) => r.isFirst),
                      ),
                    ],
                  ),
                ),
              ],
            ),
    );
  }
}

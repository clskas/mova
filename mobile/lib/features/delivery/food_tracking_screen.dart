import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:latlong2/latlong.dart';
import '../../core/api/api_client.dart';
import '../../core/billing/service_price_display.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/home/active_shipments_refresh.dart';
import '../../core/services/cancel_eligibility.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import '../passenger/passenger_alert_service.dart';
import '../booking/payment_screen.dart';
import '../chat/delivery_chat_screen.dart';
import 'delivery_live_tracking.dart';
import 'delivery_payment_state.dart';
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
  String? _lastStatus;
  bool _lastIsPaid = false;
  late final DeliveryLiveTracking _liveTracking;

  @override
  void initState() {
    super.initState();
    _liveTracking = DeliveryLiveTracking(
      deliveryId: widget.orderId,
      ref: ref,
      setState: setState,
      mounted: () => mounted,
      onPaymentCompleted: _handlePaymentCompleted,
    );
    _load();
    _pollTimer = Timer.periodic(const Duration(seconds: 5), (_) => _load(silent: true));
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _pollTimer = null;
    _liveTracking.dispose();
    super.dispose();
  }

  void _handlePaymentCompleted(Map<String, dynamic> payload) {
    if (!mounted) return;
    final wasPaid = deliveryIsPaid(_delivery);
    final method = payload['method']?.toString() ?? _delivery?['paymentMethod']?.toString();
    setState(() {
      _delivery = {
        ...?_delivery,
        'isPaid': true,
        'paymentStatus': payload['paymentStatus']?.toString() ?? 'COMPLETED',
        if (method != null) 'paymentMethod': method,
        'paymentReady': false,
      };
      _lastIsPaid = true;
    });
    if (!wasPaid) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(paymentConfirmedMessage(method: method))),
      );
    }
  }

  void _applyDeliveryPayload(Map<String, dynamic> data) {
    final merged = mergeDeliveryApiPayload(data);
    final hadPrevious = _delivery != null;
    final wasPaid = _lastIsPaid;
    final isPaid = deliveryIsPaid(merged);
    _delivery = merged;
    final newStatus = _delivery?['status']?.toString();
    if (newStatus != null && newStatus != _lastStatus) {
      _lastStatus = newStatus;
      PassengerAlertService.notifyDeliveryStatus(newStatus);
    }
    if (hadPrevious && isPaid && !wasPaid) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            paymentConfirmedMessage(method: merged['paymentMethod']?.toString()),
          ),
        ),
      );
    }
    _lastIsPaid = isPaid;
    _maybeGoToPayment();
    unawaited(_liveTracking.syncWithDelivery(_delivery));
  }

  Future<void> _load({bool silent = false}) async {
    if (!mounted || widget.orderId.isEmpty) return;
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
          _applyDeliveryPayload(data);
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
    final fromApi = _delivery?['statusLabel']?.toString();
    final status = _delivery?['status']?.toString();
    final base = (fromApi != null && fromApi.isNotEmpty)
        ? fromApi
        : switch (status) {
            'PENDING' => 'En attente du restaurant',
            'RESTAURANT_CONFIRMED' => 'En préparation',
            'READY_FOR_PICKUP' => 'Prête — livreur en route',
            'PICKED_UP' => 'Livreur assigné',
            'IN_TRANSIT' => 'En livraison',
            'DELIVERED' => 'Livré',
            'CANCELLED' => 'Annulée',
            _ => 'En cours',
          };
    if (deliveryIsPaid(_delivery)) return '$base · Payée';
    if (deliveryCashPaymentPending(_delivery)) return '$base · Paiement espèces en attente';
    if (_paymentDue) return '$base · Paiement en attente';
    return base;
  }

  bool get _canCancel => CancelEligibility.delivery(_delivery);

  bool get _canChatRestaurant {
    final status = _delivery?['status']?.toString();
    return status != null && status != 'CANCELLED' && status != 'DELIVERED';
  }

  bool get _hasCourier => _delivery?['driverId'] != null || _delivery?['courier'] != null;

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
              scrollable: true,
              insetPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
              title: const Text('Noter le restaurant'),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: List.generate(
                        5,
                        (i) => IconButton(
                          padding: EdgeInsets.zero,
                          visualDensity: VisualDensity.compact,
                          constraints: const BoxConstraints(minWidth: 40, minHeight: 40),
                          icon: Icon(
                            i < score ? Icons.star : Icons.star_border,
                            color: Colors.amber,
                            size: 32,
                          ),
                          onPressed: submitting
                              ? null
                              : () => setState(() => score = i + 1),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    enabled: !submitting,
                    maxLines: 3,
                    onChanged: (v) => comment = v,
                    decoration: const InputDecoration(
                      labelText: 'Commentaire (optionnel)',
                      hintText: 'Votre avis…',
                      isDense: true,
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

  bool get _paymentDue {
    if (deliveryIsPaid(_delivery)) return false;
    final status = _delivery?['status']?.toString();
    return _delivery?['paymentReady'] == true || status == 'DELIVERED';
  }

  bool get _cashPaymentPending => deliveryCashPaymentPending(_delivery);

  Future<void> _openPayment() async {
    if (!mounted) return;
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => PaymentScreen(
          serviceType: 'DELIVERY',
          serviceId: widget.orderId,
          amountCdf: _totalCdf,
          completionPin: _delivery?['deliveryPin']?.toString(),
        ),
      ),
    );
    if (mounted) await _load(silent: true);
  }

  Future<void> _maybeGoToPayment() async {
    if (_paymentNavigated || !mounted || !_paymentDue) return;

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
    _openPayment();
  }

  Future<void> _cancelOrder() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Annuler la commande ?'),
        content: const Text(
          'Annulation possible uniquement tant que le restaurant n\'a pas confirmé votre commande.',
        ),
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
        refreshActiveShipmentsHome(ref);
        if (!mounted) return;
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
    final courierLoc = _liveTracking.effectiveCourier(_delivery);
    final eta = _liveTracking.effectiveEta(_delivery);
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
                        if (_cashPaymentPending && pin != null && pin.isNotEmpty) ...[
                          MovaCard(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                const Text(
                                  'Paiement espèces en attente',
                                  style: TextStyle(fontWeight: FontWeight.w600),
                                ),
                                const SizedBox(height: 4),
                                const Text(
                                  'Remettez le montant au livreur et communiquez-lui ce code PIN :',
                                  style: TextStyle(color: MovaColors.textSecondary, fontSize: 12),
                                ),
                                const SizedBox(height: 8),
                                Text(
                                  pin,
                                  textAlign: TextAlign.center,
                                  style: const TextStyle(
                                    fontSize: 28,
                                    fontWeight: FontWeight.bold,
                                    letterSpacing: 6,
                                    color: MovaColors.green,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 12),
                        ],
                        if (deliveryIsPaid(_delivery)) ...[
                          MovaCard(
                            child: Row(
                              children: [
                                const Icon(Icons.check_circle, color: MovaColors.green),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Text(
                                    _delivery?['paymentMethod']?.toString().toUpperCase() == 'CASH'
                                        ? 'Commande payée (espèces confirmées)'
                                        : 'Commande payée',
                                    style: const TextStyle(fontWeight: FontWeight.w600),
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 12),
                        ],
                        DeliveryTrackingMap(
                          pickup: _pickup,
                          dropoff: _dropoff,
                          courier: courierLoc,
                          routeTrace: _liveTracking.effectiveTrace(_delivery),
                          etaMinutes: eta,
                          deliveryPin: pin,
                          courierName: courier?['name']?.toString(),
                          courierRating: (courier?['rating'] as num?)?.toDouble(),
                          courierPositionEstimated: _liveTracking.effectiveEstimated(_delivery),
                          followCourier: _liveTracking.shouldFollowCourier(_delivery),
                          pickupLabel: _delivery?['pickupAddress']?.toString(),
                          dropoffLabel: _delivery?['dropoffAddress']?.toString(),
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
                              const SizedBox(height: 12),
                              ServicePriceDisplay.passengerCard(
                                _delivery,
                                totalLabel: 'Total commande',
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
                      if (_canChatRestaurant) ...[
                        MovaButton(
                          label: 'Contacter le restaurant',
                          isSecondary: true,
                          icon: Icons.storefront_outlined,
                          onPressed: () {
                            Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (_) => DeliveryChatScreen(
                                  deliveryId: widget.orderId,
                                  myRole: 'passenger',
                                  peerLabel: widget.restaurantName,
                                ),
                              ),
                            );
                          },
                        ),
                        const SizedBox(height: 8),
                      ],
                      if (_hasCourier) ...[
                        MovaButton(
                          label: 'Contacter le livreur',
                          isSecondary: true,
                          icon: Icons.chat_bubble_outline,
                          onPressed: () {
                            final courier = _delivery?['courier'] as Map<String, dynamic>?;
                            Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (_) => DeliveryChatScreen(
                                  deliveryId: widget.orderId,
                                  myRole: 'passenger',
                                  peerLabel: courier?['name']?.toString() ?? 'Livreur',
                                ),
                              ),
                            );
                          },
                        ),
                        const SizedBox(height: 8),
                      ],
                      if (_canCancel)
                        MovaButton(
                          label: 'Annuler la commande',
                          isSecondary: true,
                          isLoading: _cancelling,
                          icon: Icons.cancel_outlined,
                          onPressed: _cancelling ? null : _cancelOrder,
                        ),
                      if (_canCancel) const SizedBox(height: 8),
                      if (_paymentDue) ...[
                        MovaButton(
                          label: 'Payer la commande',
                          icon: Icons.payment_outlined,
                          onPressed: _openPayment,
                        ),
                        const SizedBox(height: 8),
                      ],
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

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
import '../booking/widgets/mova_ride_map.dart';
import '../booking/payment_screen.dart';
import '../chat/errand_chat_screen.dart';
import '../delivery/delivery_live_tracking.dart';
import '../delivery/delivery_payment_state.dart';

class ErrandTrackingScreen extends ConsumerStatefulWidget {
  const ErrandTrackingScreen({
    super.key,
    required this.errandId,
    required this.deliveryAddress,
    required this.items,
    required this.totalCdf,
  });

  final String errandId;
  final String deliveryAddress;
  final List<String> items;
  final int totalCdf;

  @override
  ConsumerState<ErrandTrackingScreen> createState() => _ErrandTrackingScreenState();
}

class _ErrandTrackingScreenState extends ConsumerState<ErrandTrackingScreen> {
  Map<String, dynamic>? _order;
  bool _loading = true;
  bool _cancelling = false;
  bool _paymentNavigated = false;
  bool _ratingInProgress = false;
  String? _error;
  Timer? _pollTimer;
  bool _lastIsPaid = false;
  late final DeliveryLiveTracking _liveTracking;

  static const _defaultTimeline = [
    {'label': 'Commande reçue', 'done': true},
    {'label': 'Achats en cours', 'done': false},
    {'label': 'Livreur en route', 'done': false},
    {'label': 'Livré', 'done': false},
  ];

  @override
  void initState() {
    super.initState();
    _liveTracking = DeliveryLiveTracking(
      deliveryId: widget.errandId,
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
    _liveTracking.dispose();
    super.dispose();
  }

  void _handlePaymentCompleted(Map<String, dynamic> payload) {
    if (!mounted) return;
    final wasPaid = deliveryIsPaid(_order);
    final method = payload['method']?.toString() ?? _order?['paymentMethod']?.toString();
    setState(() {
      _order = {
        ...?_order,
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

  void _applyOrderPayload(Map<String, dynamic> data) {
    final merged = mergeDeliveryApiPayload(data);
    final hadPrevious = _order != null;
    final wasPaid = _lastIsPaid;
    final isPaid = deliveryIsPaid(merged);
    _order = merged;
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
    unawaited(_liveTracking.syncWithDelivery(_order));
  }

  Future<void> _load({bool silent = false}) async {
    if (!silent) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    final api = ref.read(apiClientProvider);
    await api.checkHealth();
    final result = await api.get('/errands/${widget.errandId}');
    if (!mounted) return;
    setState(() {
      _loading = silent ? _loading : false;
      switch (result) {
        case Success(:final data):
          _applyOrderPayload(data);
          _error = null;
        case Failure(:final error):
          if (!silent) _error = error.message;
      }
    });
  }

  List<Map<String, dynamic>> get _timeline {
    final raw = _order?['timeline'] as List? ?? _order?['tracking'] as List?;
    if (raw != null && raw.isNotEmpty) return raw.cast<Map<String, dynamic>>();
    final status = _order?['status']?.toString() ?? 'PENDING';
    final step = switch (status) {
      'DELIVERED' || 'COMPLETED' => 3,
      'IN_TRANSIT' || 'IN_PROGRESS' => 2,
      'ACCEPTED' || 'SHOPPING' || 'ASSIGNED' => 1,
      _ => 0,
    };
    return _defaultTimeline.asMap().entries.map((e) {
      return {'label': e.value['label'], 'done': e.key <= step};
    }).toList();
  }

  bool get _canCancel => CancelEligibility.errand(_order);

  int get _serviceFeeCdf =>
      _order?['serviceFeeCdf'] as int? ??
      _order?['finalPriceCdf'] as int? ??
      _order?['estimatedPriceCdf'] as int? ??
      widget.totalCdf;

  int get _purchaseCdf => _order?['purchaseTotalCdf'] as int? ?? 0;

  int get _totalPriceCdf =>
      _order?['totalPriceCdf'] as int? ?? (_serviceFeeCdf + _purchaseCdf);

  bool get _paymentDue {
    if (deliveryIsPaid(_order)) return false;
    final status = _order?['status']?.toString();
    return _order?['paymentReady'] == true || status == 'COMPLETED';
  }

  bool get _cashPaymentPending => deliveryCashPaymentPending(_order);

  Future<void> _openPayment() async {
    if (!mounted) return;
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => PaymentScreen(
          serviceType: 'ERRAND',
          serviceId: widget.errandId,
          amountCdf: _totalPriceCdf,
          completionPin: _order?['completionPin']?.toString(),
        ),
      ),
    );
    if (mounted) await _load(silent: true);
  }

  Future<bool> _showErrandRatingPrompt() async {
    if (_order?['rated'] == true) return false;
    final api = ref.read(apiClientProvider);
    var score = 5;
    var comment = '';
    var submitting = false;
    String? dialogError;

    final rated = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setDialogState) {
            return AlertDialog(
              title: const Text('Noter le livreur'),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text('Comment s\'est passée votre course & commissions ?'),
                  const SizedBox(height: 12),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: List.generate(
                      5,
                      (i) => IconButton(
                        icon: Icon(
                          i < score ? Icons.star : Icons.star_border,
                          color: Colors.amber,
                          size: 32,
                        ),
                        onPressed: submitting ? null : () => setDialogState(() => score = i + 1),
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
                    Text(dialogError!, style: const TextStyle(color: Colors.red)),
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
                          setDialogState(() {
                            submitting = true;
                            dialogError = null;
                          });
                          final result = await api.rateErrand(
                            widget.errandId,
                            courierScore: score,
                            comment: comment.trim().isNotEmpty ? comment.trim() : null,
                          );
                          if (!ctx.mounted) return;
                          switch (result) {
                            case Success():
                              Navigator.pop(ctx, true);
                            case Failure(:final error):
                              setDialogState(() {
                                dialogError = error.message;
                                submitting = false;
                              });
                          }
                        },
                  child: submitting
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text('Envoyer'),
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
    if (_paymentNavigated || !mounted || !_paymentDue) return;

    final alreadyRated = _order?['rated'] == true;
    if (!_ratingInProgress && !alreadyRated) {
      _ratingInProgress = true;
      final rated = await _showErrandRatingPrompt();
      _ratingInProgress = false;
      if (rated && mounted) {
        setState(() => _order = {...?_order, 'rated': true});
      }
    }

    if (_paymentNavigated || !mounted || !_paymentDue) return;
    _paymentNavigated = true;
    _openPayment();
  }

  Future<void> _cancelErrand() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Annuler la course ?'),
        content: const Text('Votre demande de courses sera annulée si le livreur n\'a pas encore commencé.'),
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
    final result = await api.cancelErrand(widget.errandId);
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

  @override
  Widget build(BuildContext context) {
    final pin = _order?['completionPin']?.toString();
    final proofUrl = _order?['proofPhotoUrl']?.toString();
    final courierPos = _liveTracking.effectiveCourier(_order);
    final followCourier = _liveTracking.shouldFollowCourier(_order);

    return MovaScreen(
      title: 'Suivi courses',
      actions: [
        IconButton(icon: const Icon(Icons.refresh), onPressed: () => _load()),
      ],
      child: _loading && _order == null
          ? const Center(child: CircularProgressIndicator())
          : Column(
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
                if (deliveryIsPaid(_order)) ...[
                  MovaCard(
                    child: Row(
                      children: [
                        const Icon(Icons.check_circle, color: MovaColors.green),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            _order?['paymentMethod']?.toString().toUpperCase() == 'CASH'
                                ? 'Course payée (espèces confirmées)'
                                : 'Course payée',
                            style: const TextStyle(fontWeight: FontWeight.w600),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                ],
                if (_order != null) ...[
                  MovaRideMap(
                    pickup: LatLng(
                      (_order!['pickupLat'] as num?)?.toDouble() ?? MarketConfig.defaultLat,
                      (_order!['pickupLng'] as num?)?.toDouble() ?? MarketConfig.defaultLng,
                    ),
                    dropoff: LatLng(
                      (_order!['dropoffLat'] as num?)?.toDouble() ?? MarketConfig.defaultLat,
                      (_order!['dropoffLng'] as num?)?.toDouble() ?? MarketConfig.defaultLng,
                    ),
                    driver: courierPos,
                    followDriver: followCourier,
                    driverIcon: Icons.delivery_dining,
                    routeTrace: _liveTracking.effectiveTrace(_order),
                    height: 160,
                    pickupLabel: _order!['pickupAddress']?.toString(),
                    dropoffLabel: _order!['dropoffAddress']?.toString(),
                  ),
                  const SizedBox(height: 12),
                ],
                MovaCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Course #${widget.errandId.length > 8 ? widget.errandId.substring(0, 8) : widget.errandId}',
                        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                      ),
                      const SizedBox(height: 4),
                      Text(widget.deliveryAddress, maxLines: 2, overflow: TextOverflow.ellipsis),
                      if (widget.items.isNotEmpty) ...[
                        const SizedBox(height: 4),
                        Text(
                          widget.items.join(', '),
                          style: const TextStyle(color: MovaColors.textSecondary, fontSize: 13),
                          maxLines: 3,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                      const SizedBox(height: 12),
                      ServicePriceDisplay.passengerCard(_order, totalLabel: 'Total à payer'),
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
                      children: [
                        Icon(
                          done ? Icons.check_circle : Icons.radio_button_unchecked,
                          color: done ? MovaColors.green : MovaColors.textSecondary,
                          size: 22,
                        ),
                        const SizedBox(width: 12),
                        Expanded(child: Text(step['label']?.toString() ?? '')),
                      ],
                    ),
                  );
                }),
                if (_order?['status']?.toString() == 'COMPLETED' ||
                    _order?['status']?.toString() == 'DELIVERED') ...[
                  const SizedBox(height: 16),
                  MovaCard(
                    child: Row(
                      children: [
                        Icon(
                          proofUrl != null ? Icons.photo_camera_outlined : Icons.verified_outlined,
                          color: MovaColors.green,
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            proofUrl != null
                                ? 'Preuve d\'achat enregistrée'
                                : 'Livraison confirmée',
                            style: const TextStyle(fontWeight: FontWeight.w600),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
                const SizedBox(height: 24),
                if (_order?['driverId'] != null)
                  MovaButton(
                    label: 'Contacter le livreur',
                    isSecondary: true,
                    icon: Icons.chat_bubble_outline,
                    onPressed: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => ErrandChatScreen(
                            errandId: widget.errandId,
                            myRole: 'passenger',
                            peerLabel: 'Livreur',
                          ),
                        ),
                      );
                    },
                  ),
                if (_order?['driverId'] != null) const SizedBox(height: 8),
                if (_canCancel)
                  MovaButton(
                    label: 'Annuler la course',
                    isSecondary: true,
                    isLoading: _cancelling,
                    icon: Icons.cancel_outlined,
                    onPressed: _cancelling ? null : _cancelErrand,
                  ),
                if (_canCancel) const SizedBox(height: 8),
                if (_paymentDue) ...[
                  MovaButton(
                    label: 'Payer la course',
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
    );
  }
}

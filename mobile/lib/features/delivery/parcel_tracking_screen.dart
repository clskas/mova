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

class ParcelTrackingScreen extends ConsumerStatefulWidget {
  const ParcelTrackingScreen({super.key, required this.parcelId});

  final String parcelId;

  @override
  ConsumerState<ParcelTrackingScreen> createState() => _ParcelTrackingScreenState();
}

class _ParcelTrackingScreenState extends ConsumerState<ParcelTrackingScreen> {
  Map<String, dynamic>? _delivery;
  bool _loading = true;
  bool _cancelling = false;
  bool _paymentNavigated = false;
  String? _error;
  Timer? _pollTimer;
  String? _lastStatus;
  bool _lastIsPaid = false;
  late final DeliveryLiveTracking _liveTracking;

  @override
  void initState() {
    super.initState();
    _liveTracking = DeliveryLiveTracking(
      deliveryId: widget.parcelId,
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
    if (!silent) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    final api = ref.read(apiClientProvider);
    await api.loadToken();
    final result = await api.get('/deliveries/${widget.parcelId}');
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

  String _statusLabel(String? status) {
    final base = switch (status) {
      'PENDING' => 'Commande confirmée',
      'READY_FOR_PICKUP' => 'En attente du livreur',
      'PICKED_UP' => 'Colis pris en charge',
      'IN_TRANSIT' => 'Livreur en route',
      'DELIVERED' => 'Livré',
      _ => status ?? '',
    };
    if (deliveryIsPaid(_delivery)) return '$base · Payée';
    if (deliveryCashPaymentPending(_delivery)) return '$base · Paiement espèces en attente';
    if (_paymentDue) return '$base · Paiement en attente';
    return base;
  }

  List<Map<String, dynamic>> get _timeline {
    final raw = _delivery?['timeline'] as List? ?? _delivery?['tracking'] as List?;
    if (raw != null && raw.isNotEmpty) return raw.cast<Map<String, dynamic>>();
    final status = _delivery?['status']?.toString().toUpperCase() ?? 'PENDING';
    final step = switch (status) {
      'DELIVERED' => 3,
      'IN_TRANSIT' => 2,
      'PICKED_UP' || 'READY_FOR_PICKUP' => 1,
      _ => 0,
    };
    const labels = ['Commande confirmée', 'Pris en charge', 'En route', 'Livré'];
    return labels.asMap().entries.map((e) {
      return {'label': e.value, 'done': e.key <= step};
    }).toList();
  }

  int get _totalCdf =>
      _delivery?['estimatedPriceCdf'] as int? ??
      _delivery?['priceCdf'] as int? ??
      _delivery?['finalPriceCdf'] as int? ??
      0;

  bool get _canCancel => CancelEligibility.delivery(_delivery);

  bool get _paymentDue {
    if (deliveryIsPaid(_delivery)) return false;
    final status = _delivery?['status']?.toString();
    return _delivery?['paymentReady'] == true || status == 'DELIVERED';
  }

  bool get _cashPaymentPending => deliveryCashPaymentPending(_delivery);

  Future<void> _openPayment() async {
    if (!mounted || _totalCdf <= 0) return;
    final api = ref.read(apiClientProvider);
    var pin = _delivery?['deliveryPin']?.toString();
    if (!api.isMockMode) {
      final result = await api.get('/deliveries/${widget.parcelId}');
      if (result case Success(:final data)) {
        final map = data is Map ? Map<String, dynamic>.from(data) : null;
        if (map != null && mounted) {
          final delivery = map['delivery'] is Map
              ? Map<String, dynamic>.from(map['delivery'] as Map)
              : map;
          setState(() => _delivery = delivery);
          pin = delivery['deliveryPin']?.toString() ??
              map['deliveryPin']?.toString() ??
              pin;
        }
      }
    }
    if (!mounted) return;
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => PaymentScreen(
          serviceType: 'DELIVERY',
          serviceId: widget.parcelId,
          amountCdf: _totalCdf,
          completionPin: pin,
        ),
      ),
    );
    if (mounted) await _load(silent: true);
  }

  void _maybeGoToPayment() {
    if (_paymentNavigated || !mounted || !_paymentDue) return;
    _paymentNavigated = true;
    _openPayment();
  }

  Future<void> _cancelDelivery() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Annuler la livraison ?'),
        content: const Text('La livraison sera annulée si le coursier n\'a pas encore pris en charge le colis.'),
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
    final result = await api.cancelDelivery(widget.parcelId);
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
      title: 'Suivi colis',
      scrollable: false,
      padding: EdgeInsets.zero,
      actions: [
        IconButton(icon: const Icon(Icons.refresh), onPressed: () => _load()),
      ],
      child: _loading && _delivery == null
          ? const Center(child: CircularProgressIndicator())
          : _error != null && _delivery == null
              ? Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    children: [
                      MovaErrorBanner(message: _error!, onRetry: _load),
                      const SizedBox(height: 16),
                      MovaButton(
                        label: 'Retour',
                        isSecondary: true,
                        icon: Icons.arrow_back,
                        onPressed: () => Navigator.pop(context),
                      ),
                    ],
                  ),
                )
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Expanded(
                      child: SingleChildScrollView(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
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
                                            ? 'Livraison payée (espèces confirmées)'
                                            : 'Livraison payée',
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
                                    'Colis #${widget.parcelId.length > 8 ? widget.parcelId.substring(0, 8) : widget.parcelId}',
                                    style: const TextStyle(
                                      fontWeight: FontWeight.bold,
                                      fontSize: 16,
                                    ),
                                  ),
                                  const SizedBox(height: 8),
                                  Text(
                                    '${_delivery?['pickupAddress'] ?? 'Enlèvement'} → '
                                    '${_delivery?['dropoffAddress'] ?? 'Livraison'}',
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                  const SizedBox(height: 8),
                                  Text(
                                    _statusLabel(_delivery?['status']?.toString()),
                                    style: const TextStyle(
                                      color: MovaColors.violet,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            if (_delivery != null && _totalCdf > 0) ...[
                              const SizedBox(height: 12),
                              ServicePriceDisplay.passengerCard(
                                _delivery,
                                totalLabel: 'Frais de livraison',
                              ),
                            ],
                            const SizedBox(height: 20),
                            Text('Statuts', style: Theme.of(context).textTheme.titleSmall),
                            const SizedBox(height: 12),
                            ..._timeline.map((map) {
                              final done = map['done'] == true;
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
                                        map['label']?.toString() ?? '',
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
                          if (courier != null || _delivery?['driverId'] != null) ...[
                            MovaButton(
                              label: 'Contacter le livreur',
                              isSecondary: true,
                              icon: Icons.chat_bubble_outline,
                              onPressed: () {
                                Navigator.push(
                                  context,
                                  MaterialPageRoute(
                                    builder: (_) => DeliveryChatScreen(
                                      deliveryId: widget.parcelId,
                                      myRole: 'passenger',
                                      peerLabel: courier?['firstName']?.toString() ?? 'Livreur',
                                    ),
                                  ),
                                );
                              },
                            ),
                            const SizedBox(height: 8),
                          ],
                          if (_canCancel)
                            MovaButton(
                              label: 'Annuler la livraison',
                              isSecondary: true,
                              isLoading: _cancelling,
                              icon: Icons.cancel_outlined,
                              onPressed: _cancelling ? null : _cancelDelivery,
                            ),
                          if (_canCancel) const SizedBox(height: 8),
                          if (_paymentDue) ...[
                            MovaButton(
                              label: 'Payer la livraison',
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

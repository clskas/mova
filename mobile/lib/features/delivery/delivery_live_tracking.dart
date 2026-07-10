import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:latlong2/latlong.dart';

import '../../core/api/api_client.dart';
import '../../core/api/ride_socket.dart';
import '../booking/widgets/mova_ride_map.dart';
import 'delivery_payment_state.dart';
import 'widgets/delivery_tracking_map.dart';

const _terminalStatuses = {'DELIVERED', 'CANCELLED', 'COMPLETED'};
const _activeCourierStatuses = {
  'READY_FOR_PICKUP',
  'PICKED_UP',
  'IN_TRANSIT',
  'ASSIGNED',
  'IN_PROGRESS',
  'SHOPPING',
  'ACCEPTED',
};

/// Suivi WebSocket temps réel du livreur (passager — livraisons repas/colis).
class DeliveryLiveTracking {
  DeliveryLiveTracking({
    required this.deliveryId,
    required this.ref,
    required this.setState,
    required this.mounted,
    this.referenceType = 'DELIVERY',
    this.onPaymentCompleted,
  });

  final String deliveryId;
  final WidgetRef ref;
  final void Function(VoidCallback fn) setState;
  final bool Function() mounted;
  final String referenceType;
  void Function(Map<String, dynamic> payload)? onPaymentCompleted;

  LatLng? liveCourierPos;
  List<LatLng> liveTrace = [];
  RideSocket? _socket;

  void dispose() {
    _socket?.clearHandlers();
    _socket = null;
    liveCourierPos = null;
    liveTrace = [];
  }

  bool _shouldConnect(Map<String, dynamic>? delivery) {
    if (_paymentPending(delivery)) return true;
    final status = delivery?['status']?.toUpperCase() ?? '';
    if (_terminalStatuses.contains(status)) return false;
    return _activeCourierStatuses.contains(status) || liveCourierPos != null;
  }

  bool _paymentPending(Map<String, dynamic>? delivery) {
    if (deliveryIsPaid(delivery)) return false;
    return delivery?['paymentStatus']?.toString().toUpperCase() == 'PENDING';
  }

  Future<void> syncWithDelivery(Map<String, dynamic>? delivery) async {
    final api = ref.read(apiClientProvider);
    if (api.isMockMode || !_shouldConnect(delivery)) {
      if (!_paymentPending(delivery)) {
        _socket?.clearHandlers();
      }
      if (api.isMockMode || !_paymentPending(delivery)) return;
    }
    await _connectSocket();
  }

  Future<void> _connectSocket() async {
    final api = ref.read(apiClientProvider);
    if (api.isMockMode) return;
    final token = await api.authToken();
    if (!mounted()) return;

    final socket = ref.read(rideSocketProvider);
    _socket = socket;
    socket.connectDelivery(
      deliveryId: deliveryId,
      token: token,
      referenceType: referenceType,
      onLocation: (payload) {
        final lat = payload['lat'] as num?;
        final lng = payload['lng'] as num?;
        if (lat == null || lng == null || !mounted()) return;
        final pos = LatLng(lat.toDouble(), lng.toDouble());
        setState(() {
          liveCourierPos = pos;
          _appendTracePoint(pos);
        });
      },
      onPaymentCompleted: (payload) {
        onPaymentCompleted?.call(payload);
      },
      onDisconnected: () {
        if (!mounted()) return;
        // Le polling HTTP reprend automatiquement côté écran.
      },
    );
  }

  void _appendTracePoint(LatLng pos) {
    if (liveTrace.isNotEmpty) {
      final last = liveTrace.last;
      final moved = (last.latitude - pos.latitude).abs() > 0.00001 ||
          (last.longitude - pos.longitude).abs() > 0.00001;
      if (!moved) return;
    }
    liveTrace = [...liveTrace, pos];
  }

  LatLng? effectiveCourier(Map<String, dynamic>? delivery) {
    if (liveCourierPos != null) return liveCourierPos;
    return DeliveryTrackingMap.parseLocation(
      delivery?['courierLocation'] as Map<String, dynamic>?,
    );
  }

  List<LatLng> effectiveTrace(Map<String, dynamic>? delivery) {
    final apiTrace = MovaRideMap.parseGpsTrace(delivery?['gpsTrace']);
    if (liveTrace.isEmpty) return apiTrace;
    if (apiTrace.isEmpty) return liveTrace;
    if (liveTrace.length <= apiTrace.length) return apiTrace;
    return [...apiTrace, ...liveTrace.skip(apiTrace.length)];
  }

  bool effectiveEstimated(Map<String, dynamic>? delivery) {
    if (liveCourierPos != null) return false;
    return delivery?['courierPositionEstimated'] == true ||
        delivery?['courierPositionSource']?.toString() == 'estimated';
  }

  int? effectiveEta(Map<String, dynamic>? delivery) {
    final courier = effectiveCourier(delivery);
    if (courier == null) return DeliveryTrackingMap.etaFromDelivery(delivery);
    final merged = {
      ...?delivery,
      'courierLocation': {'lat': courier.latitude, 'lng': courier.longitude},
      'courierPositionEstimated': false,
    };
    return DeliveryTrackingMap.etaFromDelivery(merged);
  }

  bool shouldFollowCourier(Map<String, dynamic>? delivery) {
    final status = delivery?['status']?.toString().toUpperCase() ?? '';
    if (_terminalStatuses.contains(status)) return false;
    return effectiveCourier(delivery) != null && _activeCourierStatuses.contains(status);
  }
}

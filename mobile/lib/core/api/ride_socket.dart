import 'dart:async';
import 'dart:math' as math;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import '../config/market_config.dart';

final rideSocketProvider = Provider((ref) => RideSocket());

/// WebSocket GPS + chat via api-gateway → ride-service (`/tracking` namespace).
class RideSocket {
  io.Socket? _socket;
  String? _rideId;
  String? _referenceType;
  String? _driverUserId;
  String? _token;
  bool isConnected = false;
  bool connectionFailed = false;
  Timer? _reconnectTimer;
  int _reconnectAttempt = 0;
  static const _maxReconnectAttempts = 8;

  void Function(Map<String, dynamic> payload)? _onLocation;
  void Function(Map<String, dynamic> payload)? _onStatus;
  void Function(Map<String, dynamic> payload)? _onChat;
  void Function(Map<String, dynamic> payload)? _onCashPending;
  void Function(Map<String, dynamic> payload)? _onPaymentCompleted;
  void Function()? _onConnected;
  void Function()? _onDisconnected;
  final List<Completer<bool>> _connectWaiters = [];

  set onChat(void Function(Map<String, dynamic> payload)? handler) => _onChat = handler;
  set onCashPending(void Function(Map<String, dynamic> payload)? handler) => _onCashPending = handler;
  set onPaymentCompleted(void Function(Map<String, dynamic> payload)? handler) => _onPaymentCompleted = handler;

  /// Retire les callbacks sans couper la connexion (écran fermé).
  void clearHandlers({bool chatOnly = false}) {
    if (chatOnly) {
      _onChat = null;
      return;
    }
    _onLocation = null;
    _onStatus = null;
    _onChat = null;
    _onCashPending = null;
    _onPaymentCompleted = null;
    _onConnected = null;
    _onDisconnected = null;
  }

  void resetFailure() {
    connectionFailed = false;
    _reconnectAttempt = 0;
  }

  /// Attend que le socket soit connecté (ou échoue après [timeout]).
  Future<bool> ensureConnected({Duration timeout = const Duration(seconds: 15)}) async {
    if (_socket?.connected == true && isConnected) return true;
    if (connectionFailed) return false;
    final waiter = Completer<bool>();
    _connectWaiters.add(waiter);
    Future.delayed(timeout, () {
      if (!waiter.isCompleted) waiter.complete(false);
    });
    return waiter.future;
  }

  void _completeConnectWaiters(bool ok) {
    for (final w in _connectWaiters) {
      if (!w.isCompleted) w.complete(ok);
    }
    _connectWaiters.clear();
  }

  void connect({
    required String rideId,
    String? token,
    void Function(Map<String, dynamic> payload)? onLocation,
    void Function(Map<String, dynamic> payload)? onStatus,
    void Function(Map<String, dynamic> payload)? onChat,
    void Function(Map<String, dynamic> payload)? onPaymentCompleted,
    void Function()? onConnected,
    void Function()? onDisconnected,
    bool forceReconnect = false,
  }) {
    _rideId = rideId;
    _referenceType = null;
    if (token != null && token.isNotEmpty) _token = token;
    if (onLocation != null) _onLocation = onLocation;
    if (onStatus != null) _onStatus = onStatus;
    if (onChat != null) _onChat = onChat;
    if (onPaymentCompleted != null) _onPaymentCompleted = onPaymentCompleted;
    if (onConnected != null) _onConnected = onConnected;
    if (onDisconnected != null) _onDisconnected = onDisconnected;

    if (!forceReconnect && _socket?.connected == true) {
      _emitSubscribe();
      isConnected = true;
      connectionFailed = false;
      _onConnected?.call();
      _completeConnectWaiters(true);
      return;
    }

    if (forceReconnect) {
      resetFailure();
    }
    _reconnectAttempt = 0;
    connectionFailed = false;
    _openSocket();
  }

  void _emitSubscribe() {
    if (_socket?.connected != true) return;
    if (_driverUserId != null && _driverUserId!.isNotEmpty) {
      _socket?.emit('driver:subscribe', {'userId': _driverUserId});
    }
    if (_rideId == null) return;
    if (_referenceType == 'DELIVERY' || _referenceType == 'ERRAND') {
      _socket?.emit('delivery:subscribe', {'deliveryId': _rideId});
      return;
    }
    if (_referenceType != 'DRIVER') {
      _socket?.emit('ride:subscribe', {'rideId': _rideId});
    }
  }

  void _openSocket() {
    _reconnectTimer?.cancel();
    _socket?.dispose();
    _socket = null;
    isConnected = false;

    try {
      _socket = io.io(
        '${MarketConfig.effectiveWsUrl}/tracking',
        io.OptionBuilder()
            .setPath('/socket.io')
            .setTransports(['polling', 'websocket'])
            .disableAutoConnect()
            .enableReconnection()
            .setReconnectionAttempts(_maxReconnectAttempts)
            .setReconnectionDelay(1500)
            .setReconnectionDelayMax(8000)
            .setAuth({if (_token != null && _token!.isNotEmpty) 'token': _token})
            .build(),
      );
      _socket!
        ..onConnect((_) {
          isConnected = true;
          connectionFailed = false;
          _reconnectAttempt = 0;
          if (_rideId != null) {
            _emitSubscribe();
          }
          _onConnected?.call();
          _completeConnectWaiters(true);
        })
        ..onDisconnect((_) {
          isConnected = false;
          _onDisconnected?.call();
        })
        ..on('driver:location', _handleLocation)
        ..on('ride:location', _handleLocation)
        ..on('courier:location', _handleLocation)
        ..on('ride:status', (data) {
          if (data is Map) {
            _onStatus?.call(Map<String, dynamic>.from(data));
          }
        })
        ..on('ride:chat', (data) {
          if (data is Map) {
            _onChat?.call(Map<String, dynamic>.from(data));
          }
        })
        ..on('delivery:chat', (data) {
          if (data is Map) {
            _onChat?.call(Map<String, dynamic>.from(data));
          }
        })
        ..on('errand:chat', (data) {
          if (data is Map) {
            _onChat?.call(Map<String, dynamic>.from(data));
          }
        })
        ..on('ride:cash-pending', (data) {
          if (data is Map) {
            _onCashPending?.call(Map<String, dynamic>.from(data));
          }
        })
        ..on('delivery:cash-pending', (data) {
          if (data is Map) {
            _onCashPending?.call(Map<String, dynamic>.from(data));
          }
        })
        ..on('delivery:payment-completed', (data) {
          if (data is Map) {
            _onPaymentCompleted?.call(Map<String, dynamic>.from(data));
          }
        })
        ..on('ride:payment-completed', (data) {
          if (data is Map) {
            _onPaymentCompleted?.call(Map<String, dynamic>.from(data));
          }
        })
        ..onConnectError((_) {
          isConnected = false;
          _scheduleReconnect();
        })
        ..onError((_) {
          isConnected = false;
        })
        ..connect();
    } catch (_) {
      _scheduleReconnect();
    }
  }

  void _handleLocation(dynamic data) {
    if (data is Map) {
      _onLocation?.call(Map<String, dynamic>.from(data));
    }
  }

  void _scheduleReconnect() {
    isConnected = false;
    if (_reconnectAttempt >= _maxReconnectAttempts) {
      connectionFailed = true;
      _completeConnectWaiters(false);
      _onDisconnected?.call();
      return;
    }
    _reconnectTimer?.cancel();
    final delaySec = math.min(20, math.pow(2, _reconnectAttempt).toInt());
    _reconnectAttempt++;
    _reconnectTimer = Timer(Duration(seconds: delaySec), _openSocket);
  }

  void dispose() {
    _reconnectTimer?.cancel();
    _reconnectTimer = null;
    clearHandlers();
    _socket?.dispose();
    _socket = null;
    _rideId = null;
    _referenceType = null;
    _driverUserId = null;
    isConnected = false;
    connectionFailed = false;
    _reconnectAttempt = 0;
    _completeConnectWaiters(false);
  }

  void emitDriverLocation({
    required String userId,
    required double lat,
    required double lng,
    String? rideId,
  }) {
    if (_socket?.connected != true) return;
    _socket?.emit('driver:location', {
      'userId': userId,
      'lat': lat,
      'lng': lng,
      if (rideId != null) 'rideId': rideId,
    });
  }

  void connectDriverInbox({
    required String userId,
    String? token,
    void Function(Map<String, dynamic> payload)? onCashPending,
    void Function()? onConnected,
    void Function()? onDisconnected,
  }) {
    _driverUserId = userId;
    _referenceType = 'DRIVER';
    if (token != null && token.isNotEmpty) _token = token;
    if (onCashPending != null) _onCashPending = onCashPending;
    if (onConnected != null) _onConnected = onConnected;
    if (onDisconnected != null) _onDisconnected = onDisconnected;

    if (_socket?.connected == true) {
      _emitSubscribe();
      isConnected = true;
      connectionFailed = false;
      _onConnected?.call();
      _completeConnectWaiters(true);
      return;
    }

    resetFailure();
    _reconnectAttempt = 0;
    connectionFailed = false;
    _openSocket();
  }

  void connectDelivery({
    required String deliveryId,
    String? token,
    String? referenceType,
    String? driverUserId,
    void Function(Map<String, dynamic> payload)? onLocation,
    void Function(Map<String, dynamic> payload)? onPaymentCompleted,
    void Function(Map<String, dynamic> payload)? onCashPending,
    void Function()? onConnected,
    void Function()? onDisconnected,
  }) {
    _rideId = deliveryId;
    _referenceType = referenceType ?? 'DELIVERY';
    if (driverUserId != null && driverUserId.isNotEmpty) _driverUserId = driverUserId;
    if (token != null && token.isNotEmpty) _token = token;
    if (onLocation != null) _onLocation = onLocation;
    if (onPaymentCompleted != null) _onPaymentCompleted = onPaymentCompleted;
    if (onCashPending != null) _onCashPending = onCashPending;
    if (onConnected != null) _onConnected = onConnected;
    if (onDisconnected != null) _onDisconnected = onDisconnected;

    if (_socket?.connected == true) {
      _emitSubscribe();
      isConnected = true;
      connectionFailed = false;
      _onConnected?.call();
      _completeConnectWaiters(true);
      return;
    }

    resetFailure();
    _reconnectAttempt = 0;
    connectionFailed = false;
    _openSocket();
  }

  void emitCourierLocation({
    required String userId,
    required double lat,
    required double lng,
    required String deliveryId,
    String referenceType = 'DELIVERY',
  }) {
    if (_socket?.connected != true) return;
    _socket?.emit('courier:location', {
      'userId': userId,
      'lat': lat,
      'lng': lng,
      'deliveryId': deliveryId,
      'referenceId': deliveryId,
      'referenceType': referenceType,
    });
  }

  void emitChat(Map<String, dynamic> payload) {
    if (_socket?.connected != true) return;
    final rideId = payload['rideId']?.toString();
    if (rideId != null && rideId.isNotEmpty) {
      _socket?.emit('ride:subscribe', {'rideId': rideId});
    }
    _socket?.emit('ride:chat', payload);
  }
}

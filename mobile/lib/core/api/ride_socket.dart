import 'dart:async';
import 'dart:math' as math;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import '../config/market_config.dart';

final rideSocketProvider = Provider((ref) => RideSocket());

/// WebSocket GPS via ride-service (`/tracking` namespace).
class RideSocket {
  io.Socket? _socket;
  String? _rideId;
  String? _token;
  bool isConnected = false;
  bool connectionFailed = false;
  Timer? _reconnectTimer;
  int _reconnectAttempt = 0;
  static const _maxReconnectAttempts = 6;

  void Function(Map<String, dynamic> payload)? _onLocation;
  void Function(Map<String, dynamic> payload)? _onStatus;
  void Function(Map<String, dynamic> payload)? _onChat;
  void Function()? _onConnected;
  void Function()? _onDisconnected;

  set onChat(void Function(Map<String, dynamic> payload)? handler) => _onChat = handler;

  void connect({
    required String rideId,
    String? token,
    void Function(Map<String, dynamic> payload)? onLocation,
    void Function(Map<String, dynamic> payload)? onStatus,
    void Function(Map<String, dynamic> payload)? onChat,
    void Function()? onConnected,
    void Function()? onDisconnected,
    bool forceReconnect = false,
  }) {
    _rideId = rideId;
    if (token != null && token.isNotEmpty) _token = token;
    if (onLocation != null) _onLocation = onLocation;
    if (onStatus != null) _onStatus = onStatus;
    if (onChat != null) _onChat = onChat;
    if (onConnected != null) _onConnected = onConnected;
    if (onDisconnected != null) _onDisconnected = onDisconnected;

    if (!forceReconnect && _socket?.connected == true && _rideId == rideId) {
      _socket?.emit('ride:subscribe', {'rideId': rideId});
      isConnected = true;
      connectionFailed = false;
      _onConnected?.call();
      return;
    }

    _reconnectAttempt = 0;
    connectionFailed = false;
    _openSocket();
  }

  void _openSocket() {
    _reconnectTimer?.cancel();
    _socket?.dispose();
    _socket = null;
    isConnected = false;

    try {
      _socket = io.io(
        '${MarketConfig.wsUrl}/tracking',
        io.OptionBuilder()
            .setTransports(['websocket'])
            .disableAutoConnect()
            .enableReconnection()
            .setReconnectionAttempts(_maxReconnectAttempts)
            .setReconnectionDelay(2000)
            .setReconnectionDelayMax(10000)
            .setAuth({if (_token != null && _token!.isNotEmpty) 'token': _token})
            .build(),
      );
      _socket!
        ..onConnect((_) {
          isConnected = true;
          connectionFailed = false;
          _reconnectAttempt = 0;
          if (_rideId != null) {
            _socket?.emit('ride:subscribe', {'rideId': _rideId});
            _socket?.emit('delivery:subscribe', {'deliveryId': _rideId});
          }
          _onConnected?.call();
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
        ..onConnectError((_) => _scheduleReconnect())
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
      _onDisconnected?.call();
      return;
    }
    _reconnectTimer?.cancel();
    final delaySec = math.min(30, math.pow(2, _reconnectAttempt).toInt());
    _reconnectAttempt++;
    _reconnectTimer = Timer(Duration(seconds: delaySec), _openSocket);
  }

  void dispose() {
    _reconnectTimer?.cancel();
    _reconnectTimer = null;
    _socket?.dispose();
    _socket = null;
    _rideId = null;
    isConnected = false;
    connectionFailed = false;
    _reconnectAttempt = 0;
  }

  void emitDriverLocation({
    required String userId,
    required double lat,
    required double lng,
    String? rideId,
  }) {
    if (!isConnected) return;
    _socket?.emit('driver:location', {
      'userId': userId,
      'lat': lat,
      'lng': lng,
      if (rideId != null) 'rideId': rideId,
    });
  }

  void connectDelivery({
    required String deliveryId,
    String? token,
    String? referenceType,
    void Function(Map<String, dynamic> payload)? onLocation,
    void Function()? onConnected,
    void Function()? onDisconnected,
  }) {
    _rideId = deliveryId;
    if (token != null && token.isNotEmpty) _token = token;
    if (onLocation != null) _onLocation = onLocation;
    if (onConnected != null) _onConnected = onConnected;
    if (onDisconnected != null) _onDisconnected = onDisconnected;
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
    if (!isConnected) return;
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
    if (!isConnected) return;
    _socket?.emit('ride:chat', payload);
  }
}

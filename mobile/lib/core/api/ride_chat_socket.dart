import 'dart:async';
import 'dart:math' as math;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import '../config/market_config.dart';

final rideChatSocketProvider = Provider((ref) => RideChatSocket());

/// Socket dédié au chat course — évite les conflits avec le tracking GPS.
class RideChatSocket {
  io.Socket? _socket;
  String? _rideId;
  String? _token;
  bool connectionFailed = false;
  Timer? _reconnectTimer;
  int _reconnectAttempt = 0;
  static const _maxReconnectAttempts = 8;

  void Function(Map<String, dynamic> payload)? _onChat;
  void Function()? _onConnected;
  void Function()? _onDisconnected;
  final List<Completer<bool>> _connectWaiters = [];

  bool get isConnected => _socket?.connected == true;

  void clearHandlers() {
    _onChat = null;
    _onConnected = null;
    _onDisconnected = null;
  }

  void resetFailure() {
    connectionFailed = false;
    _reconnectAttempt = 0;
  }

  Future<bool> ensureConnected({Duration timeout = const Duration(seconds: 15)}) async {
    if (isConnected) return true;
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
    void Function(Map<String, dynamic> payload)? onChat,
    void Function()? onConnected,
    void Function()? onDisconnected,
    bool forceReconnect = false,
  }) {
    _rideId = rideId;
    if (token != null && token.isNotEmpty) _token = token;
    if (onChat != null) _onChat = onChat;
    if (onConnected != null) _onConnected = onConnected;
    if (onDisconnected != null) _onDisconnected = onDisconnected;

    if (!forceReconnect && isConnected) {
      _socket?.emit('ride:subscribe', {'rideId': rideId});
      _onConnected?.call();
      _completeConnectWaiters(true);
      return;
    }

    if (forceReconnect) resetFailure();
    _reconnectAttempt = 0;
    connectionFailed = false;
    _openSocket();
  }

  void _openSocket() {
    _reconnectTimer?.cancel();
    _socket?.dispose();
    _socket = null;

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
          connectionFailed = false;
          _reconnectAttempt = 0;
          if (_rideId != null) {
            _socket?.emit('ride:subscribe', {'rideId': _rideId});
          }
          _onConnected?.call();
          _completeConnectWaiters(true);
        })
        ..onDisconnect((_) {
          _onDisconnected?.call();
        })
        ..on('ride:chat', (data) {
          if (data is Map) {
            _onChat?.call(Map<String, dynamic>.from(data));
          }
        })
        ..onConnectError((_) {
          _scheduleReconnect();
        })
        ..onError((_) {})
        ..connect();
    } catch (_) {
      _scheduleReconnect();
    }
  }

  void _scheduleReconnect() {
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
    clearHandlers();
    _socket?.dispose();
    _socket = null;
    _rideId = null;
    connectionFailed = false;
    _reconnectAttempt = 0;
    _completeConnectWaiters(false);
  }

  void subscribe(String rideId) {
    _rideId = rideId;
    if (isConnected) {
      _socket?.emit('ride:subscribe', {'rideId': rideId});
    }
  }
}

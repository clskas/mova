import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import '../config/market_config.dart';

final rideSocketProvider = Provider((ref) => RideSocket());

/// WebSocket GPS via ride-service (`/tracking` namespace).
class RideSocket {
  io.Socket? _socket;
  bool mockMode = false;

  void connect({
    required String rideId,
    String? token,
    void Function(Map<String, dynamic> payload)? onLocation,
    void Function(Map<String, dynamic> payload)? onStatus,
    void Function()? onConnected,
    void Function()? onDisconnected,
  }) {
    dispose();
    try {
      _socket = io.io(
        '${MarketConfig.wsUrl}/tracking',
        io.OptionBuilder()
            .setTransports(['websocket'])
            .disableAutoConnect()
            .setAuth({if (token != null && token.isNotEmpty) 'token': token})
            .build(),
      );
      _socket!
        ..onConnect((_) {
          mockMode = false;
          onConnected?.call();
          _socket?.emit('ride:subscribe', {'rideId': rideId});
        })
        ..onDisconnect((_) => onDisconnected?.call())
        ..on('driver:location', (data) {
          if (data is Map) {
            onLocation?.call(Map<String, dynamic>.from(data));
          }
        })
        ..on('ride:status', (data) {
          if (data is Map) {
            onStatus?.call(Map<String, dynamic>.from(data));
          }
        })
        ..onConnectError((_) {
          mockMode = true;
          onDisconnected?.call();
        })
        ..connect();
    } catch (_) {
      mockMode = true;
    }
  }

  void dispose() {
    _socket?.dispose();
    _socket = null;
  }
}

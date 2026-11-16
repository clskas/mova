import 'package:flutter/foundation.dart';

/// Live connection transports for the ride-service sockets (`/tracking`).
///
/// WebSocket first: one connection stays on one server, so the app keeps working when the
/// ride service runs on several instances (HTTP long-polling sends many separate requests
/// that can land on different servers). Some networks block WebSocket: after
/// [failuresBeforeFallback] failed attempts without any success, the app falls back to
/// long-polling (then upgrade) for the rest of the session, as it always did before.
class SocketTransportPolicy {
  SocketTransportPolicy._();

  static const failuresBeforeFallback = 2;

  static bool _pollingFallback = false;
  static int _webSocketFailures = 0;

  static bool get usesPollingFallback => _pollingFallback;

  static List<String> get transports =>
      _pollingFallback ? const ['polling', 'websocket'] : const ['websocket'];

  /// A connection succeeded: WebSocket works on this network.
  static void onConnected() {
    _webSocketFailures = 0;
  }

  /// A connection attempt failed.
  static void onConnectError() {
    if (_pollingFallback) return;
    _webSocketFailures++;
    if (_webSocketFailures >= failuresBeforeFallback) _pollingFallback = true;
  }

  @visibleForTesting
  static void reset() {
    _pollingFallback = false;
    _webSocketFailures = 0;
  }
}

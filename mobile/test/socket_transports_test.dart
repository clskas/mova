import 'package:flutter_test/flutter_test.dart';
import 'package:mova/core/api/socket_transports.dart';

void main() {
  setUp(SocketTransportPolicy.reset);

  test('WebSocket only at first (works with several ride servers)', () {
    expect(SocketTransportPolicy.transports, ['websocket']);
  });

  test('falls back to long-polling after repeated failures, for the session', () {
    SocketTransportPolicy.onConnectError();
    expect(SocketTransportPolicy.transports, ['websocket']);
    SocketTransportPolicy.onConnectError();
    expect(SocketTransportPolicy.transports, ['polling', 'websocket']);
    SocketTransportPolicy.onConnected();
    expect(SocketTransportPolicy.usesPollingFallback, isTrue);
  });

  test('a success resets the failure count', () {
    SocketTransportPolicy.onConnectError();
    SocketTransportPolicy.onConnected();
    SocketTransportPolicy.onConnectError();
    expect(SocketTransportPolicy.transports, ['websocket']);
  });
}

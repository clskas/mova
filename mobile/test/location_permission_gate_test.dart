import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:geolocator/geolocator.dart';
import 'package:mova/core/location/location_permission.dart';

void main() {
  group('LocationPermissionGate (Sentry SENGA-MOBILE-4)', () {
    test('two simultaneous requests share one system prompt', () async {
      var calls = 0;
      final answer = Completer<LocationPermission>();
      Future<LocationPermission> requester() {
        calls++;
        return answer.future;
      }

      final first = LocationPermissionGate.request(requester: requester);
      final second = LocationPermissionGate.request(requester: requester);
      answer.complete(LocationPermission.whileInUse);

      expect(await first, LocationPermission.whileInUse);
      expect(await second, LocationPermission.whileInUse);
      expect(calls, 1);
    });

    test('a later request asks again once the first one is answered', () async {
      var calls = 0;
      Future<LocationPermission> requester() async {
        calls++;
        return LocationPermission.denied;
      }

      await LocationPermissionGate.request(requester: requester);
      await LocationPermissionGate.request(requester: requester);
      expect(calls, 2);
    });

    test(
      'a request already running elsewhere falls back to the current state',
      () async {
        final result = await LocationPermissionGate.request(
          requester: () async =>
              throw const PermissionRequestInProgressException('in progress'),
          checker: () async => LocationPermission.always,
          retryDelay: Duration.zero,
        );
        expect(result, LocationPermission.always);
      },
    );
  });
}

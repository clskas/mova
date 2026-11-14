import 'package:flutter_test/flutter_test.dart';
import 'package:mova/core/offline/sync_queue.dart';

void main() {
  test('driver mission actions are kept while offline', () {
    expect(SyncQueue.shouldQueue('PATCH', '/rides/abc/status'), isTrue);
    expect(SyncQueue.shouldQueue('PATCH', '/moving/abc/driver-status'), isTrue);
    expect(SyncQueue.shouldQueue('PATCH', '/rides/scheduled/abc/driver-status'), isTrue);
    expect(SyncQueue.shouldQueue('POST', '/rides/abc/share-passengers/b1/pickup'), isTrue);
    expect(SyncQueue.shouldQueue('POST', '/rides/abc/share-passengers/b1/dropoff'), isTrue);
  });

  test('money actions are never queued', () {
    expect(SyncQueue.shouldQueue('POST', '/payments/rides/abc'), isFalse);
    expect(SyncQueue.shouldQueue('POST', '/wallet/top-up'), isFalse);
  });
}

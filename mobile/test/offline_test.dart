import 'package:flutter_test/flutter_test.dart';
import 'package:mova/core/cache/unified_history_cache.dart';
import 'package:mova/core/cache/wallet_cache.dart';
import 'package:mova/core/offline/connectivity_service.dart';
import 'package:mova/core/offline/sync_queue.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  setUp(() {
    TestWidgetsFlutterBinding.ensureInitialized();
    SharedPreferences.setMockInitialValues({});
  });

  group('OfflineState', () {
    test('banner messages are distinct for network vs server', () {
      const noNet = OfflineState(reason: OfflineReason.noNetwork);
      const serverDown = OfflineState(reason: OfflineReason.serverUnavailable);

      expect(noNet.bannerMessage, 'Pas de réseau');
      expect(serverDown.bannerMessage, 'Serveur indisponible — mode hors ligne');
      expect(noNet.isOffline, isTrue);
      expect(const OfflineState(reason: OfflineReason.online).isOffline, isFalse);
    });
  });

  group('SyncQueue', () {
    test('shouldQueue accepts create paths only', () {
      expect(SyncQueue.shouldQueue('POST', '/rides'), isTrue);
      expect(SyncQueue.shouldQueue('POST', '/deliveries/parcel'), isTrue);
      expect(SyncQueue.shouldQueue('POST', '/wallet/top-up'), isTrue);
      expect(SyncQueue.shouldQueue('POST', '/rides/estimate'), isFalse);
      expect(SyncQueue.shouldQueue('POST', '/auth/otp/request'), isFalse);
      expect(SyncQueue.shouldQueue('GET', '/rides'), isFalse);
    });

    test('optimisticResponse includes offline metadata', () {
      final data = SyncQueue.optimisticResponse(
        '/rides',
        {'pickupAddress': 'Gombe', 'dropoffAddress': 'Limete'},
        'pending-1',
      );
      expect(data['offline'], isTrue);
      expect(data['message'], contains('hors ligne'));
      expect((data['ride'] as Map)['id'], 'offline-pending-1');
    });
  });

  group('UnifiedHistoryCache', () {
    test('save and load round-trip', () async {
      await UnifiedHistoryCache.save({
        'data': [
          {'id': '1', 'type': 'RIDE', 'title': 'Gombe → Limete'},
        ],
        'currency': 'CDF',
        'city': 'Kinshasa',
      });
      final snapshot = await UnifiedHistoryCache.load();
      expect(snapshot.data, hasLength(1));
      expect(snapshot.currency, 'CDF');
      expect(snapshot.syncedAt, isNotNull);
    });
  });

  group('WalletCache', () {
    test('save and load round-trip', () async {
      await WalletCache.save({
        'balanceCdf': 12000,
        'transactions': [
          {'type': 'CREDIT', 'amountCdf': 5000},
        ],
      });
      final snapshot = await WalletCache.load();
      expect(snapshot.balanceCdf, 12000);
      expect(snapshot.transactions, hasLength(1));
      expect(snapshot.syncedAt, isNotNull);
    });
  });
}

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_client.dart';
import '../error/result.dart';
import 'connectivity_service.dart';
import 'sync_queue.dart';

/// Initialise Hive, connectivité, santé API et synchronisation.
Future<void> bootstrapMovaApp(WidgetRef ref) async {
  final connectivity = ref.read(connectivityServiceProvider);
  final api = ref.read(apiClientProvider);
  final queue = ref.read(syncQueueProvider);

  await connectivity.init();
  await api.loadToken();

  connectivity.onBackOnline = () async {
    await api.checkHealth();
    if (api.canSync) {
      final flushResult = await queue.flush((method, path, body) async {
        return switch (method) {
          'POST' => api.post(path, body, skipOffline: true),
          'PATCH' => api.patch(path, body, skipOffline: true),
          _ => const Failure(NetworkFailure('Méthode non prise en charge.')),
        };
      });
      if (flushResult.synced > 0) {
        connectivity.setPendingSyncCount(queue.pendingCount);
      }
    }
    connectivity.setPendingSyncCount(queue.pendingCount);
  };

  queue.pendingCountStream.listen((count) {
    connectivity.setPendingSyncCount(count);
  });

  connectivity.setPendingSyncCount(queue.pendingCount);

  connectivity.onNetworkRestored = () async {
    connectivity.prepareReconnect();
    await api.checkHealth(resetFailures: true);
  };

  connectivity.prepareReconnect();

  for (var attempt = 0; attempt < 5; attempt++) {
    if (await api.checkHealth()) break;
    if (attempt < 4) {
      await Future.delayed(Duration(seconds: 1 + attempt));
    }
  }

  connectivity.startGatewayHealthRetry(() => api.checkHealth());
}

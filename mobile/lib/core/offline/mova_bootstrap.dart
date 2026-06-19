import 'package:flutter/material.dart';
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
      await queue.flush((method, path, body) async {
        return switch (method) {
          'POST' => api.post(path, body, skipOffline: true),
          'PATCH' => api.patch(path, body, skipOffline: true),
          _ => const Failure(NetworkFailure('Méthode non prise en charge.')),
        };
      });
    }
    connectivity.setPendingSyncCount(queue.pendingCount);
  };

  queue.pendingCountStream.listen((count) {
    connectivity.setPendingSyncCount(count);
  });

  connectivity.setPendingSyncCount(queue.pendingCount);
  await api.checkHealth();
  connectivity.startGatewayHealthRetry(() => api.checkHealth());
}

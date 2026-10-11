import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_client.dart';
import '../error/result.dart';
import '../update/app_update_service.dart';
import 'connectivity_service.dart';
import 'sync_queue.dart';

/// Initialise Hive, connectivité, santé API et synchronisation.
Future<void> bootstrapMovaApp(WidgetRef ref) async {
  final connectivity = ref.read(connectivityServiceProvider);
  final api = ref.read(apiClientProvider);
  final queue = ref.read(syncQueueProvider);

  await connectivity.init();
  await api.loadToken();

  // Anciennes builds empilaient le GPS hors ligne → bannière « N actions ».
  await queue.pruneEphemeral();

  Future<void> flushPending() async {
    if (!api.canSync || queue.pendingCount == 0) {
      connectivity.setPendingSyncCount(queue.pendingCount);
      return;
    }
    await queue.flush((method, path, body) async {
      return switch (method) {
        'POST' => api.post(path, body, skipOffline: true),
        'PATCH' => api.patch(path, body, skipOffline: true),
        _ => const Failure(NetworkFailure('Méthode non prise en charge.')),
      };
    });
    connectivity.setPendingSyncCount(queue.pendingCount);
  }

  connectivity.onBackOnline = () async {
    await api.checkHealth();
    // Passenger cold-start often misses the first app-version probe while offline.
    ref.read(appUpdateServiceProvider.notifier).onAppResumed();
    await flushPending();
  };

  queue.pendingCountStream.listen((count) {
    connectivity.setPendingSyncCount(count);
  });

  connectivity.setPendingSyncCount(queue.pendingCount);
  // File déjà non vide au démarrage (réseau revenu pendant que l'app était fermée).
  unawaited(flushPending());
  // Relance périodique si des actions restent après des échecs transitoires.
  Timer.periodic(const Duration(seconds: 45), (_) {
    unawaited(flushPending());
  });

  connectivity.onNetworkRestored = () async {
    connectivity.prepareReconnect();
    await api.checkHealth(resetFailures: true);
    ref.read(appUpdateServiceProvider.notifier).onAppResumed();
  };

  connectivity.prepareReconnect();

  for (var attempt = 0; attempt < 5; attempt++) {
    if (await api.checkHealth()) break;
    if (attempt < 4) {
      await Future.delayed(Duration(seconds: 1 + attempt));
    }
  }

  connectivity.startGatewayHealthRetry(() => api.checkHealth());
  ref.read(appUpdateServiceProvider.notifier).onAppResumed();
}

import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_client.dart';
import '../error/result.dart';
import '../update/app_update_service.dart';
import 'connectivity_service.dart';
import 'sync_queue.dart';

/// Initialise Hive, connectivité, santé API et synchronisation.
///
/// [ref] appartient à l'écran de démarrage, qui est fermé bien avant que les
/// rappels réseau ci-dessous ne s'exécutent : on passe donc par le conteneur
/// Riverpod de l'app, qui vit aussi longtemps qu'elle (Sentry SENGA-MOBILE-2).
Future<void> bootstrapMovaApp(WidgetRef ref) async {
  final container = ProviderScope.containerOf(ref.context, listen: false);
  final connectivity = container.read(connectivityServiceProvider);
  final api = container.read(apiClientProvider);
  final queue = container.read(syncQueueProvider);
  final updates = container.read(appUpdateServiceProvider.notifier);

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
    updates.onAppResumed();
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
    updates.onAppResumed();
  };

  connectivity.prepareReconnect();

  for (var attempt = 0; attempt < 5; attempt++) {
    if (await api.checkHealth()) break;
    if (attempt < 4) {
      await Future.delayed(Duration(seconds: 1 + attempt));
    }
  }

  connectivity.startGatewayHealthRetry(() => api.checkHealth());
  updates.onAppResumed();
}

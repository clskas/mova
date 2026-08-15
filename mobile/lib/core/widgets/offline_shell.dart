import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_client.dart';
import '../config/market_config.dart';
import '../offline/connectivity_service.dart';
import '../theme/mova_colors.dart';
import '../update/app_update_service.dart';

/// Bannière globale hors ligne + indicateur de file de synchronisation.
class MovaOfflineShell extends ConsumerStatefulWidget {
  const MovaOfflineShell({super.key, required this.child});

  final Widget? child;

  @override
  ConsumerState<MovaOfflineShell> createState() => _MovaOfflineShellState();
}

class _MovaOfflineShellState extends ConsumerState<MovaOfflineShell> {
  @override
  void initState() {
    super.initState();
    ref.read(appUpdateServiceProvider.notifier).start();
  }

  @override
  Widget build(BuildContext context) {
    final offlineAsync = ref.watch(offlineStateProvider);
    final state = offlineAsync.valueOrNull;
    final update = ref.watch(appUpdateServiceProvider);

    return Stack(
      children: [
        widget.child ?? const SizedBox.shrink(),
        if ((state != null && (state.isOffline || state.pendingSyncCount > 0)) ||
            update.showBanner)
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (update.showBanner)
                  Material(
                    color: MovaColors.violet,
                    child: SafeArea(
                      bottom: false,
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(16, 8, 8, 4),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Row(
                              children: [
                                const Icon(Icons.system_update, color: Colors.white, size: 18),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Text(
                                    update.forceUpdate
                                        ? 'Une nouvelle version est requise pour continuer.'
                                        : 'Une nouvelle version est disponible.',
                                    style: const TextStyle(
                                      color: Colors.white,
                                      fontSize: 13,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.end,
                              children: [
                                if (!update.forceUpdate)
                                  TextButton(
                                    onPressed: () =>
                                        ref.read(appUpdateServiceProvider.notifier).dismiss(),
                                    child: const Text(
                                      'Plus tard',
                                      style: TextStyle(color: Colors.white70, fontWeight: FontWeight.w600),
                                    ),
                                  ),
                                TextButton(
                                  onPressed: () =>
                                      ref.read(appUpdateServiceProvider.notifier).openStore(),
                                  child: const Text(
                                    'Mettre à jour',
                                    style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700),
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                if (state != null && state.isOffline)
                  Material(
                    color: state.reason == OfflineReason.noNetwork
                        ? MovaColors.orange
                        : MovaColors.midnight,
                    child: SafeArea(
                      bottom: false,
                      child: InkWell(
                        onTap: state.reason == OfflineReason.serverUnavailable
                            ? () => ref
                                .read(apiClientProvider)
                                .checkHealth(resetFailures: true)
                            : null,
                        child: Padding(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 8,
                          ),
                          child: Row(
                            children: [
                              Icon(
                                state.reason == OfflineReason.noNetwork
                                    ? Icons.wifi_off
                                    : Icons.cloud_off,
                                color: Colors.white,
                                size: 18,
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  kDebugMode && state.reason == OfflineReason.serverUnavailable
                                      ? '${state.bannerMessage}\nAPI: ${MarketConfig.effectiveApiBaseUrl}\nTouchez pour réessayer'
                                      : state.reason == OfflineReason.serverUnavailable
                                          ? '${state.bannerMessage}\nTouchez pour réessayer'
                                          : state.bannerMessage,
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 13,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                if (state != null && state.pendingSyncCount > 0)
                  Material(
                    color: MovaColors.violet.withValues(alpha: 0.95),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 6,
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.sync, size: 16, color: Colors.white),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              '${state.pendingSyncCount} action${state.pendingSyncCount > 1 ? 's' : ''} en attente de synchronisation',
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          ),
      ],
    );
  }
}

String formatLastSync(DateTime? syncedAt) {
  if (syncedAt == null) return '';
  String pad(int n) => n.toString().padLeft(2, '0');
  final d = syncedAt;
  return 'Dernière synchro : ${pad(d.day)}/${pad(d.month)}/${d.year} '
      '${pad(d.hour)}:${pad(d.minute)}';
}

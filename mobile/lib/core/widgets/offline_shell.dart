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

class _MovaOfflineShellState extends ConsumerState<MovaOfflineShell>
    with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    ref.read(appUpdateServiceProvider.notifier).start();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      ref.read(appUpdateServiceProvider.notifier).onAppResumed();
    }
  }

  @override
  Widget build(BuildContext context) {
    final offlineAsync = ref.watch(offlineStateProvider);
    final state = offlineAsync.valueOrNull;
    final update = ref.watch(appUpdateServiceProvider);
    final showSoftBanner = update.showBanner && !update.forceUpdate;

    return Stack(
      fit: StackFit.expand,
      children: [
        widget.child ?? const SizedBox.shrink(),
        if ((state != null && (state.isOffline || state.pendingSyncCount > 0)) ||
            showSoftBanner)
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (showSoftBanner)
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
                                    update.flexibleDownloaded
                                        ? 'La mise à jour de SENGA est prête. Redémarrez pour l\'installer.'
                                        : 'Une nouvelle version de SENGA est disponible.',
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
                                  child: Text(
                                    update.flexibleDownloaded ? 'Redémarrer' : 'Mettre à jour',
                                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700),
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
        if (update.forceUpdate)
          const Positioned.fill(child: _ForceUpdateBarrier()),
      ],
    );
  }
}

class _ForceUpdateBarrier extends ConsumerWidget {
  const _ForceUpdateBarrier();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Material(
      color: MovaColors.midnight.withValues(alpha: 0.72),
      child: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 400),
              child: Card(
                color: Colors.white,
                elevation: 8,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(24, 24, 24, 16),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.system_update, color: MovaColors.violet, size: 40),
                      const SizedBox(height: 16),
                      const Text(
                        'Mise à jour obligatoire',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                          color: MovaColors.midnight,
                        ),
                      ),
                      const SizedBox(height: 8),
                      const Text(
                        'Cette version de SENGA n\'est plus prise en charge. '
                        'Installez la dernière version pour continuer.',
                        textAlign: TextAlign.center,
                        style: TextStyle(fontSize: 14, color: MovaColors.textSecondary, height: 1.4),
                      ),
                      const SizedBox(height: 20),
                      SizedBox(
                        width: double.infinity,
                        child: FilledButton(
                          style: FilledButton.styleFrom(
                            backgroundColor: MovaColors.violet,
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(vertical: 14),
                          ),
                          onPressed: () =>
                              ref.read(appUpdateServiceProvider.notifier).openStore(),
                          child: const Text(
                            'Mettre à jour',
                            style: TextStyle(fontWeight: FontWeight.w700),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
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

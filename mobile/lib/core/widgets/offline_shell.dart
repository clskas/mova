import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../offline/connectivity_service.dart';
import '../theme/mova_colors.dart';

/// Bannière globale hors ligne + indicateur de file de synchronisation.
class MovaOfflineShell extends ConsumerWidget {
  const MovaOfflineShell({super.key, required this.child});

  final Widget? child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final offlineAsync = ref.watch(offlineStateProvider);
    final state = offlineAsync.valueOrNull;

    return Stack(
      children: [
        child ?? const SizedBox.shrink(),
        if (state != null && (state.isOffline || state.pendingSyncCount > 0))
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (state.isOffline)
                  Material(
                    color: state.reason == OfflineReason.noNetwork
                        ? MovaColors.orange
                        : MovaColors.midnight,
                    child: SafeArea(
                      bottom: false,
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
                                state.bannerMessage,
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
                if (state.pendingSyncCount > 0)
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

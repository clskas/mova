import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Raison de l'état hors ligne (réseau vs passerelle).
enum OfflineReason {
  online,
  noNetwork,
  serverUnavailable,
}

class OfflineState {
  const OfflineState({
    required this.reason,
    this.pendingSyncCount = 0,
  });

  final OfflineReason reason;
  final int pendingSyncCount;

  bool get isOffline => reason != OfflineReason.online;

  String get bannerMessage => switch (reason) {
        OfflineReason.online => '',
        OfflineReason.noNetwork => 'Pas de réseau',
        OfflineReason.serverUnavailable =>
          'Serveur indisponible — mode hors ligne',
      };
}

final connectivityServiceProvider = Provider<ConnectivityService>((ref) {
  final service = ConnectivityService();
  ref.onDispose(service.dispose);
  return service;
});

final offlineStateProvider = StreamProvider<OfflineState>((ref) {
  final service = ref.watch(connectivityServiceProvider);
  return service.stream;
});

/// Écoute la connectivité réseau et l'état de la passerelle API.
class ConnectivityService {
  ConnectivityService({Connectivity? connectivity})
      : _connectivity = connectivity ?? Connectivity();

  final Connectivity _connectivity;
  final _controller = StreamController<OfflineState>.broadcast();

  OfflineReason _reason = OfflineReason.online;
  bool _gatewayUp = true;
  bool _hasNetwork = true;
  int _pendingSyncCount = 0;
  StreamSubscription<List<ConnectivityResult>>? _subscription;
  Timer? _healthRetryTimer;
  void Function()? onBackOnline;
  Future<void> Function()? onNetworkRestored;

  Stream<OfflineState> get stream => _controller.stream;
  OfflineReason get reason => _reason;
  bool get hasNetwork => _hasNetwork;
  bool get gatewayUp => _gatewayUp;
  bool get isOnline => _reason == OfflineReason.online;
  bool get isOffline => _reason != OfflineReason.online;

  Future<void> init() async {
    final results = await _connectivity.checkConnectivity();
    _applyConnectivity(results);
    _subscription = _connectivity.onConnectivityChanged.listen(_applyConnectivity);
    _emit();
  }

  /// Réessaie périodiquement la santé de la passerelle tant qu'elle est marquée indisponible.
  void startGatewayHealthRetry(Future<bool> Function() checkHealth) {
    _healthRetryTimer?.cancel();
    Future<void> retryIfNeeded() async {
      if (_hasNetwork && !_gatewayUp) {
        await checkHealth();
      }
    }

    // Premier essai rapide après un échec au démarrage (cold start Docker / appareil lent).
    Future.delayed(const Duration(seconds: 2), retryIfNeeded);
    _healthRetryTimer = Timer.periodic(const Duration(seconds: 5), (_) => retryIfNeeded());
  }

  void setGatewayUp(bool up) {
    _gatewayUp = up;
    _recomputeReason();
  }

  /// Optimiste au retour au premier plan — le health check confirmera ou infirmera.
  void prepareReconnect() {
    _gatewayUp = true;
    _recomputeReason();
  }

  void setPendingSyncCount(int count) {
    _pendingSyncCount = count;
    _emit();
  }

  void _applyConnectivity(List<ConnectivityResult> results) {
    final hadNetwork = _hasNetwork;
    _hasNetwork = results.any((r) => r != ConnectivityResult.none);
    final networkRestored = !hadNetwork && _hasNetwork;
    _recomputeReason();
    if (networkRestored) {
      onNetworkRestored?.call();
    }
  }

  void _recomputeReason() {
    final previous = _reason;
    if (!_hasNetwork) {
      _reason = OfflineReason.noNetwork;
    } else if (!_gatewayUp) {
      _reason = OfflineReason.serverUnavailable;
    } else {
      _reason = OfflineReason.online;
    }

    final cameOnline =
        previous != OfflineReason.online && _reason == OfflineReason.online;
    _emit();
    if (cameOnline) onBackOnline?.call();
  }

  void _emit() {
    if (_controller.isClosed) return;
    _controller.add(
      OfflineState(
        reason: _reason,
        pendingSyncCount: _pendingSyncCount,
      ),
    );
  }

  void dispose() {
    _subscription?.cancel();
    _healthRetryTimer?.cancel();
    _controller.close();
  }
}

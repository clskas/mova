import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api/api_client.dart';
import '../config/app_version.dart';
import '../error/result.dart';

class AppUpdateState {
  const AppUpdateState({
    this.updateAvailable = false,
    this.forceUpdate = false,
    this.storeUrl,
    this.remoteVersion,
  });

  final bool updateAvailable;
  final bool forceUpdate;
  final String? storeUrl;
  final String? remoteVersion;
}

final appUpdateServiceProvider = Provider<AppUpdateService>((ref) {
  final service = AppUpdateService(ref.read(apiClientProvider));
  ref.onDispose(service.dispose);
  return service;
});

final appUpdateStateProvider = StreamProvider<AppUpdateState>((ref) {
  return ref.watch(appUpdateServiceProvider).stream;
});

class AppUpdateService {
  AppUpdateService(this._api);

  final ApiClient _api;
  final _controller = StreamController<AppUpdateState>.broadcast();
  AppUpdateState _state = const AppUpdateState();
  Timer? _timer;
  bool _started = false;

  Stream<AppUpdateState> get stream async* {
    yield _state;
    yield* _controller.stream;
  }

  AppUpdateState get state => _state;

  void start() {
    if (_started) return;
    _started = true;
    unawaited(check());
    _timer = Timer.periodic(const Duration(minutes: 15), (_) => check());
  }

  Future<void> check() async {
    final result = await _api.get('/public/app-version', retries: 1, skipCache: true);
    if (result is! Success) return;
    final data = result.data;
    if (data is! Map) return;
    final flavor = AppFlavor.isDriver ? 'driver' : 'passenger';
    final block = data[flavor];
    if (block is! Map) return;
    final current = block['currentVersion']?.toString() ?? '';
    final min = block['minVersion']?.toString() ?? '1.0.0';
    final storeUrl = block['storeUrl']?.toString();
    if (current.isEmpty) return;
    final behindCurrent = AppVersion.compare(AppVersion.name, current) < 0;
    final belowMin = AppVersion.compare(AppVersion.name, min) < 0;
    final next = AppUpdateState(
      updateAvailable: behindCurrent || belowMin,
      forceUpdate: belowMin,
      storeUrl: storeUrl,
      remoteVersion: current,
    );
    if (next.updateAvailable == _state.updateAvailable &&
        next.forceUpdate == _state.forceUpdate &&
        next.remoteVersion == _state.remoteVersion) {
      return;
    }
    _state = next;
    if (!_controller.isClosed) _controller.add(_state);
  }

  Future<void> openStore() async {
    final raw = _state.storeUrl;
    if (raw == null || raw.isEmpty) return;
    final uri = Uri.tryParse(raw);
    if (uri == null) return;
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  void dispose() {
    _timer?.cancel();
    _controller.close();
  }
}

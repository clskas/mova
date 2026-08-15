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
    this.dismissedVersion,
  });

  final bool updateAvailable;
  final bool forceUpdate;
  final String? storeUrl;
  final String? remoteVersion;
  final String? dismissedVersion;

  bool get showBanner =>
      updateAvailable && (forceUpdate || dismissedVersion != remoteVersion);

  AppUpdateState copyWith({
    bool? updateAvailable,
    bool? forceUpdate,
    String? storeUrl,
    String? remoteVersion,
    String? dismissedVersion,
  }) {
    return AppUpdateState(
      updateAvailable: updateAvailable ?? this.updateAvailable,
      forceUpdate: forceUpdate ?? this.forceUpdate,
      storeUrl: storeUrl ?? this.storeUrl,
      remoteVersion: remoteVersion ?? this.remoteVersion,
      dismissedVersion: dismissedVersion ?? this.dismissedVersion,
    );
  }

  @override
  bool operator ==(Object other) {
    return other is AppUpdateState &&
        other.updateAvailable == updateAvailable &&
        other.forceUpdate == forceUpdate &&
        other.storeUrl == storeUrl &&
        other.remoteVersion == remoteVersion &&
        other.dismissedVersion == dismissedVersion;
  }

  @override
  int get hashCode => Object.hash(
        updateAvailable,
        forceUpdate,
        storeUrl,
        remoteVersion,
        dismissedVersion,
      );
}

final appUpdateServiceProvider =
    NotifierProvider<AppUpdateService, AppUpdateState>(AppUpdateService.new);

class AppUpdateService extends Notifier<AppUpdateState> {
  Timer? _timer;
  Timer? _retryTimer;
  bool _started = false;
  bool _checking = false;

  @override
  AppUpdateState build() {
    ref.onDispose(() {
      _timer?.cancel();
      _retryTimer?.cancel();
    });
    return const AppUpdateState();
  }

  void start() {
    if (_started) return;
    _started = true;
    unawaited(check());
    _retryTimer = Timer(const Duration(seconds: 8), () => unawaited(check()));
    _timer = Timer.periodic(const Duration(minutes: 5), (_) => unawaited(check()));
  }

  Future<void> check() async {
    if (_checking) return;
    _checking = true;
    try {
      final result = await ref.read(apiClientProvider).get(
            '/public/app-version',
            retries: 1,
            skipCache: true,
          );
      if (result is! Success) return;
      final parsed = parseRemote(
        result.data,
        isDriver: AppFlavor.isDriver,
        localVersion: AppVersion.name,
      );
      if (parsed == null) return;
      final next = parsed.copyWith(dismissedVersion: state.dismissedVersion);
      if (next == state) return;
      state = next;
    } finally {
      _checking = false;
    }
  }

  void dismiss() {
    if (!state.updateAvailable || state.forceUpdate) return;
    final next = state.copyWith(dismissedVersion: state.remoteVersion);
    if (next == state) return;
    state = next;
  }

  Future<void> openStore() async {
    final raw = state.storeUrl;
    if (raw == null || raw.isEmpty) return;
    final uri = Uri.tryParse(raw);
    if (uri == null) return;
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  /// Accepte le JSON brut ou un enveloppe `{ data: { passenger, driver } }`.
  static AppUpdateState? parseRemote(
    Object? raw, {
    required bool isDriver,
    required String localVersion,
  }) {
    final root = _asMap(raw);
    if (root == null) return null;
    final flavor = isDriver ? 'driver' : 'passenger';
    var block = _asMap(root[flavor]);
    if (block == null) {
      block = _asMap(_asMap(root['data'])?[flavor]);
    }
    if (block == null) return null;
    final current = block['currentVersion']?.toString().trim() ?? '';
    final min = block['minVersion']?.toString().trim() ?? '1.0.0';
    final storeUrl = block['storeUrl']?.toString();
    if (current.isEmpty) return null;
    final behindCurrent = AppVersion.compare(localVersion, current) < 0;
    final belowMin = AppVersion.compare(localVersion, min) < 0;
    return AppUpdateState(
      updateAvailable: behindCurrent || belowMin,
      forceUpdate: belowMin,
      storeUrl: storeUrl,
      remoteVersion: current,
    );
  }

  static Map<String, dynamic>? _asMap(Object? value) {
    if (value is Map<String, dynamic>) return value;
    if (value is Map) {
      return value.map((key, val) => MapEntry(key.toString(), val));
    }
    return null;
  }
}

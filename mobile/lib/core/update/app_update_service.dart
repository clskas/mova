import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api/api_client.dart';
import '../config/app_version.dart';
import '../error/result.dart';
import 'play_in_app_update.dart';

class AppUpdateState {
  const AppUpdateState({
    this.updateAvailable = false,
    this.forceUpdate = false,
    this.storeUrl,
    this.remoteVersion,
    this.dismissedUntil,
    this.flexibleDownloaded = false,
  });

  static const _unset = Object();

  final bool updateAvailable;
  final bool forceUpdate;
  final String? storeUrl;
  final String? remoteVersion;
  final DateTime? dismissedUntil;
  final bool flexibleDownloaded;

  bool get showBanner {
    if (!updateAvailable) return false;
    if (forceUpdate) return true;
    if (dismissedUntil == null) return true;
    return DateTime.now().isAfter(dismissedUntil!);
  }

  AppUpdateState copyWith({
    bool? updateAvailable,
    bool? forceUpdate,
    String? storeUrl,
    String? remoteVersion,
    Object? dismissedUntil = _unset,
    bool? flexibleDownloaded,
  }) {
    return AppUpdateState(
      updateAvailable: updateAvailable ?? this.updateAvailable,
      forceUpdate: forceUpdate ?? this.forceUpdate,
      storeUrl: storeUrl ?? this.storeUrl,
      remoteVersion: remoteVersion ?? this.remoteVersion,
      dismissedUntil: identical(dismissedUntil, _unset)
          ? this.dismissedUntil
          : dismissedUntil as DateTime?,
      flexibleDownloaded: flexibleDownloaded ?? this.flexibleDownloaded,
    );
  }

  @override
  bool operator ==(Object other) {
    return other is AppUpdateState &&
        other.updateAvailable == updateAvailable &&
        other.forceUpdate == forceUpdate &&
        other.storeUrl == storeUrl &&
        other.remoteVersion == remoteVersion &&
        other.dismissedUntil == dismissedUntil &&
        other.flexibleDownloaded == flexibleDownloaded;
  }

  @override
  int get hashCode => Object.hash(
        updateAvailable,
        forceUpdate,
        storeUrl,
        remoteVersion,
        dismissedUntil,
        flexibleDownloaded,
      );
}

final appUpdateServiceProvider =
    NotifierProvider<AppUpdateService, AppUpdateState>(AppUpdateService.new);

class AppUpdateService extends Notifier<AppUpdateState> {
  static const softDismissDuration = Duration(minutes: 15);

  Timer? _timer;
  Timer? _retryTimer;
  Timer? _softDismissTimer;
  bool _started = false;
  bool _checking = false;
  bool _flexibleKickStarted = false;
  bool _alive = true;

  @override
  AppUpdateState build() {
    _alive = true;
    ref.onDispose(() {
      _alive = false;
      _timer?.cancel();
      _retryTimer?.cancel();
      _softDismissTimer?.cancel();
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

  /// Resume from background: re-check Play / backend and show the soft banner again.
  void onAppResumed() {
    _softDismissTimer?.cancel();
    if (state.dismissedUntil != null && !state.forceUpdate) {
      state = state.copyWith(dismissedUntil: null);
    }
    unawaited(check());
  }

  static String get defaultStoreUrl => AppFlavor.isDriver
      ? 'https://play.google.com/store/apps/details?id=cd.mova.mova.driver'
      : 'https://play.google.com/store/apps/details?id=cd.mova.mova.passenger';

  Future<void> check() async {
    if (_checking) return;
    _checking = true;
    try {
      final result = await ref.read(apiClientProvider).get(
            '/public/app-version',
            retries: 1,
            skipCache: true,
          );
      var next = state;
      if (result is Success) {
        final parsed = parseRemote(
          result.data,
          isDriver: AppFlavor.isDriver,
          localVersion: AppVersion.name,
          localBuild: AppVersion.build,
        );
        if (parsed != null) {
          next = parsed.copyWith(
            dismissedUntil: state.dismissedUntil,
            flexibleDownloaded: state.flexibleDownloaded,
          );
        }
      }
      final playUpdate = await PlayInAppUpdate.hasUpdate();
      if (playUpdate && !next.updateAvailable) {
        next = next.copyWith(
          updateAvailable: true,
          storeUrl: (next.storeUrl == null || next.storeUrl!.isEmpty)
              ? defaultStoreUrl
              : next.storeUrl,
        );
      }
      if (next.storeUrl == null || next.storeUrl!.isEmpty) {
        next = next.copyWith(storeUrl: defaultStoreUrl);
      }
      if (next != state) state = next;
      if (next.updateAvailable) _kickFlexibleDownload();
    } finally {
      _checking = false;
    }
  }

  void _kickFlexibleDownload() {
    if (_flexibleKickStarted || state.forceUpdate || state.flexibleDownloaded) {
      return;
    }
    _flexibleKickStarted = true;
    unawaited(() async {
      final downloaded = await PlayInAppUpdate.startFlexible();
      if (downloaded && _alive) {
        state = state.copyWith(flexibleDownloaded: true);
      } else {
        _flexibleKickStarted = false;
      }
    }());
  }

  void dismiss() {
    if (!state.updateAvailable || state.forceUpdate) return;
    _softDismissTimer?.cancel();
    state = state.copyWith(
      dismissedUntil: DateTime.now().add(softDismissDuration),
    );
    _softDismissTimer = Timer(softDismissDuration, () {
      if (!state.forceUpdate) {
        state = state.copyWith(dismissedUntil: null);
      }
    });
  }

  Future<void> openStore() async {
    if (state.forceUpdate) {
      final immediate = await PlayInAppUpdate.startImmediate();
      if (immediate) return;
    } else if (state.flexibleDownloaded) {
      final done = await PlayInAppUpdate.completeFlexible();
      if (done) return;
    } else {
      unawaited(() async {
        final downloaded = await PlayInAppUpdate.startFlexible();
        if (downloaded && _alive) {
          state = state.copyWith(flexibleDownloaded: true);
        }
      }());
    }
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
    int localBuild = 0,
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
    final remoteCode = _asInt(block['currentVersionCode']);
    final minCode = _asInt(block['minVersionCode']);
    final behindCurrent = AppVersion.compare(localVersion, current) < 0;
    final behindCode = remoteCode > 0 && localBuild > 0 && localBuild < remoteCode;
    final belowMin = AppVersion.compare(localVersion, min) < 0 ||
        (minCode > 0 && localBuild > 0 && localBuild < minCode);
    return AppUpdateState(
      updateAvailable: behindCurrent || behindCode || belowMin,
      forceUpdate: belowMin,
      storeUrl: storeUrl,
      remoteVersion: current,
    );
  }

  static int _asInt(Object? value) {
    if (value is int) return value;
    if (value is num) return value.round();
    return int.tryParse(value?.toString().trim() ?? '') ?? 0;
  }

  static Map<String, dynamic>? _asMap(Object? value) {
    if (value is Map<String, dynamic>) return value;
    if (value is Map) {
      return value.map((key, val) => MapEntry(key.toString(), val));
    }
    return null;
  }
}

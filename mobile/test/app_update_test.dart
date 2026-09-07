import 'package:flutter_test/flutter_test.dart';
import 'package:mova/core/config/app_version.dart';
import 'package:mova/core/update/app_update_service.dart';

void main() {
  group('AppVersion.compare', () {
    test('detects a newer remote version', () {
      expect(AppVersion.compare('1.0.2', '1.0.3'), lessThan(0));
      expect(AppVersion.compare('1.0.2', '1.1.0'), lessThan(0));
      expect(AppVersion.compare('1.0.2', '1.0.2'), 0);
      expect(AppVersion.compare('1.0.3', '1.0.2'), greaterThan(0));
    });

    test('ignores build suffix after +', () {
      expect(AppVersion.compare('1.0.2+7', '1.0.3'), lessThan(0));
    });
  });

  group('AppUpdateService.parseRemote', () {
    const payload = {
      'passenger': {
        'currentVersion': '1.0.3',
        'minVersion': '1.0.0',
        'storeUrl': 'https://play.google.com/store/apps/details?id=cd.mova.mova.passenger',
      },
      'driver': {
        'currentVersion': '1.0.4',
        'minVersion': '1.0.3',
        'storeUrl': 'https://play.google.com/store/apps/details?id=cd.mova.mova.driver',
      },
    };

    test('shows optional update when remote is ahead', () {
      final state = AppUpdateService.parseRemote(
        payload,
        isDriver: false,
        localVersion: '1.0.2',
      );
      expect(state, isNotNull);
      expect(state!.updateAvailable, isTrue);
      expect(state.forceUpdate, isFalse);
      expect(state.showBanner, isTrue);
      expect(state.remoteVersion, '1.0.3');
    });

    test('hides banner when versions match', () {
      final state = AppUpdateService.parseRemote(
        payload,
        isDriver: false,
        localVersion: '1.0.3',
      );
      expect(state!.updateAvailable, isFalse);
      expect(state.showBanner, isFalse);
    });

    test('forces update when below min version', () {
      final state = AppUpdateService.parseRemote(
        payload,
        isDriver: true,
        localVersion: '1.0.2',
      );
      expect(state!.forceUpdate, isTrue);
      expect(state.showBanner, isTrue);
      expect(
        state
            .copyWith(dismissedUntil: DateTime.now().add(const Duration(days: 1)))
            .showBanner,
        isTrue,
      );
    });

    test('unwraps a data envelope', () {
      final state = AppUpdateService.parseRemote(
        {'data': payload},
        isDriver: false,
        localVersion: '1.0.2',
      );
      expect(state!.updateAvailable, isTrue);
      expect(state.remoteVersion, '1.0.3');
    });

    test('Plus tard hides a soft update until snooze expires', () {
      final state = AppUpdateService.parseRemote(
        payload,
        isDriver: false,
        localVersion: '1.0.2',
      )!.copyWith(dismissedUntil: DateTime.now().add(const Duration(minutes: 15)));
      expect(state.showBanner, isFalse);
    });

    test('soft banner returns after snooze expires', () {
      final state = AppUpdateService.parseRemote(
        payload,
        isDriver: false,
        localVersion: '1.0.2',
      )!.copyWith(
        dismissedUntil: DateTime.now().subtract(const Duration(minutes: 1)),
      );
      expect(state.showBanner, isTrue);
    });

    test('matching versionName still shows banner when compile-time build is behind', () {
      final state = AppUpdateService.parseRemote(
        {
          'passenger': {
            'currentVersion': '1.0.3',
            'minVersion': '1.0.0',
            'currentVersionCode': 28,
            'storeUrl': 'https://play.google.com/store/apps/details?id=cd.mova.mova.passenger',
          },
        },
        isDriver: false,
        localVersion: '1.0.3',
        localBuild: 8,
      );
      expect(state!.updateAvailable, isTrue);
      expect(state.showBanner, isTrue);
    });

    test('older versionName shows banner even with a stale compile-time build', () {
      final state = AppUpdateService.parseRemote(
        {
          'passenger': {
            'currentVersion': '1.0.4',
            'minVersion': '1.0.0',
            'currentVersionCode': 39,
            'storeUrl': 'https://play.google.com/store/apps/details?id=cd.mova.mova.passenger',
          },
        },
        isDriver: false,
        localVersion: '1.0.3',
        localBuild: 8,
      );
      expect(state!.updateAvailable, isTrue);
      expect(state.forceUpdate, isFalse);
      expect(state.showBanner, isTrue);
    });

    test('1.0.3 / 36 is behind advertised 1.0.4 / 39', () {
      final state = AppUpdateService.parseRemote(
        {
          'passenger': {
            'currentVersion': '1.0.4',
            'minVersion': '1.0.0',
            'currentVersionCode': 39,
            'storeUrl': 'https://play.google.com/store/apps/details?id=cd.mova.mova.passenger',
          },
        },
        isDriver: false,
        localVersion: '1.0.3',
        localBuild: 36,
      );
      expect(state!.updateAvailable, isTrue);
      expect(state.showBanner, isTrue);
    });

    test('same versionName still shows banner when versionCode is behind', () {
      final state = AppUpdateService.parseRemote(
        {
          'passenger': {
            'currentVersion': '1.0.4',
            'minVersion': '1.0.0',
            'currentVersionCode': 42,
            'storeUrl': 'https://play.google.com/store/apps/details?id=cd.mova.mova.passenger',
          },
        },
        isDriver: false,
        localVersion: '1.0.4',
        localBuild: 36,
      );
      expect(state!.updateAvailable, isTrue);
      expect(state.showBanner, isTrue);
    });

    test('same 1.0.5 name and versionCode hides the banner', () {
      final state = AppUpdateService.parseRemote(
        {
          'passenger': {
            'currentVersion': '1.0.5',
            'minVersion': '1.0.0',
            'currentVersionCode': 42,
            'storeUrl': 'https://play.google.com/store/apps/details?id=cd.mova.mova.passenger',
          },
        },
        isDriver: false,
        localVersion: '1.0.5',
        localBuild: 42,
      );
      expect(state!.updateAvailable, isFalse);
      expect(state.showBanner, isFalse);
    });

    test('1.0.4 / 39 is behind advertised 1.0.5 / 42', () {
      final state = AppUpdateService.parseRemote(
        {
          'passenger': {
            'currentVersion': '1.0.5',
            'minVersion': '1.0.0',
            'currentVersionCode': 42,
            'storeUrl': 'https://play.google.com/store/apps/details?id=cd.mova.mova.passenger',
          },
        },
        isDriver: false,
        localVersion: '1.0.4',
        localBuild: 39,
      );
      expect(state!.updateAvailable, isTrue);
      expect(state.forceUpdate, isFalse);
      expect(state.showBanner, isTrue);
    });

    test('driver 1.0.5 / 50 is behind advertised Play 1.0.6+51 (name 1.0.5 / code 51)', () {
      final state = AppUpdateService.parseRemote(
        {
          'passenger': {
            'currentVersion': '1.0.5',
            'minVersion': '1.0.0',
            'currentVersionCode': 51,
            'storeUrl': 'https://play.google.com/store/apps/details?id=cd.mova.mova.passenger',
          },
          'driver': {
            'currentVersion': '1.0.5',
            'minVersion': '1.0.0',
            'currentVersionCode': 51,
            'storeUrl': 'https://play.google.com/store/apps/details?id=cd.mova.mova.driver',
          },
        },
        isDriver: true,
        localVersion: '1.0.5',
        localBuild: 50,
      );
      expect(state!.updateAvailable, isTrue);
      expect(state.forceUpdate, isFalse);
      expect(state.showBanner, isTrue);
      expect(state.storeUrl, contains('cd.mova.mova.driver'));
    });

    test('driver still sees the banner if the API omits the driver block', () {
      final state = AppUpdateService.parseRemote(
        {
          'passenger': {
            'currentVersion': '1.0.5',
            'minVersion': '1.0.0',
            'currentVersionCode': 51,
            'storeUrl': 'https://play.google.com/store/apps/details?id=cd.mova.mova.passenger',
          },
        },
        isDriver: true,
        localVersion: '1.0.5',
        localBuild: 48,
      );
      expect(state!.updateAvailable, isTrue);
      expect(state.showBanner, isTrue);
    });

    test('Play stale updateAvailable does not keep the banner after install', () {
      final fromApi = AppUpdateService.parseRemote(
        {
          'passenger': {
            'currentVersion': '1.0.5',
            'minVersion': '1.0.0',
            'currentVersionCode': 51,
            'storeUrl': 'https://play.google.com/store/apps/details?id=cd.mova.mova.passenger',
          },
        },
        isDriver: false,
        localVersion: '1.0.5',
        localBuild: 50,
      )!;
      expect(fromApi.updateAvailable, isTrue);
      final afterPlay = AppUpdateService.reconcileWithPlay(
        fromApi,
        playCode: 50,
        localBuild: 50,
      );
      expect(afterPlay.updateAvailable, isFalse);
      expect(afterPlay.showBanner, isFalse);
    });

    test('Play newer versionCode still shows an optional banner', () {
      final current = AppUpdateService.parseRemote(
        {
          'passenger': {
            'currentVersion': '1.0.5',
            'minVersion': '1.0.0',
            'currentVersionCode': 50,
          },
        },
        isDriver: false,
        localVersion: '1.0.5',
        localBuild: 50,
      )!;
      expect(current.updateAvailable, isFalse);
      final afterPlay = AppUpdateService.reconcileWithPlay(
        current,
        playCode: 51,
        localBuild: 50,
        fallbackStoreUrl: 'https://play.google.com/store/apps/details?id=cd.mova.mova.passenger',
      );
      expect(afterPlay.updateAvailable, isTrue);
      expect(afterPlay.showBanner, isTrue);
    });

    test('forced min-version banner stays even if Play says current', () {
      final forced = AppUpdateService.parseRemote(
        {
          'passenger': {
            'currentVersion': '1.0.5',
            'minVersion': '1.0.5',
            'minVersionCode': 50,
            'currentVersionCode': 50,
          },
        },
        isDriver: false,
        localVersion: '1.0.4',
        localBuild: 46,
      )!;
      expect(forced.forceUpdate, isTrue);
      final afterPlay = AppUpdateService.reconcileWithPlay(
        forced,
        playCode: 46,
        localBuild: 46,
      );
      expect(afterPlay.forceUpdate, isTrue);
      expect(afterPlay.showBanner, isTrue);
    });

    test('minVersionCode still forces an update', () {
      final state = AppUpdateService.parseRemote(
        {
          'passenger': {
            'currentVersion': '1.0.3',
            'minVersion': '1.0.3',
            'minVersionCode': 20,
            'storeUrl': 'https://play.google.com/store/apps/details?id=cd.mova.mova.passenger',
          },
        },
        isDriver: false,
        localVersion: '1.0.3',
        localBuild: 8,
      );
      expect(state!.forceUpdate, isTrue);
      expect(state.showBanner, isTrue);
    });
  });
}

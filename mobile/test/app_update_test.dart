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

    test('matching versionName hides banner even if versionCode looks behind', () {
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
      expect(state!.updateAvailable, isFalse);
      expect(state.showBanner, isFalse);
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

    test('same 1.0.4 name hides banner even if local versionCode is 36 vs 39', () {
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
        localVersion: '1.0.4',
        localBuild: 36,
      );
      expect(state!.updateAvailable, isFalse);
      expect(state.showBanner, isFalse);
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

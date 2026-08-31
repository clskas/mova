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

    test('versionCode behind current triggers an optional update', () {
      final state = AppUpdateService.parseRemote(
        {
          'passenger': {
            'currentVersion': '1.0.2',
            'minVersion': '1.0.0',
            'currentVersionCode': 12,
            'storeUrl': 'https://play.google.com/store/apps/details?id=cd.mova.mova.passenger',
          },
        },
        isDriver: false,
        localVersion: '1.0.2',
        localBuild: 8,
      );
      expect(state!.updateAvailable, isTrue);
      expect(state.forceUpdate, isFalse);
    });
  });
}

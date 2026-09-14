import 'package:flutter_test/flutter_test.dart';
import 'package:mova/core/api/api_client.dart';
import 'package:mova/core/media/image_pick_util.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  test('markExternalCaptureSessionGuard stamps unlock + camera guard', () async {
    await markExternalCaptureSessionGuard();
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getInt(ApiClient.sessionUnlockedAtKey), isNotNull);
    expect(prefs.getInt(ApiClient.cameraCaptureGuardKey), isNotNull);

    final api = ApiClient.mock();
    expect(await api.isSessionRecentlyUnlocked(), isTrue);
    expect(await api.consumeCameraCaptureGuard(), isTrue);
    expect(await api.consumeCameraCaptureGuard(), isFalse);
  });

  test('shouldKeepSessionAcrossProcessDeath uses unlock window', () async {
    final api = ApiClient.mock();
    expect(await api.shouldKeepSessionAcrossProcessDeath(), isFalse);
    await api.markSessionUnlocked();
    expect(await api.shouldKeepSessionAcrossProcessDeath(), isTrue);
  });
}

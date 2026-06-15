import 'package:flutter_test/flutter_test.dart';
import 'package:mova/core/api/api_client.dart';
import 'package:mova/core/error/result.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  setUp(() {
    TestWidgetsFlutterBinding.ensureInitialized();
    SharedPreferences.setMockInitialValues({});
  });
  test('ApiClient.mock patch availability returns success', () async {
    final api = ApiClient.mock();
    final result = await api.patch('/drivers/availability', {'isAvailable': true});
    expect(result, isA<Success<Map<String, dynamic>>>());
  });

  test('ApiClient.mock getDriverOffers returns offers list', () async {
    final api = ApiClient.mock();
    final result = await api.getDriverOffers();
    expect(result, isA<Success<List<Map<String, dynamic>>>>());
    if (result case Success(:final data)) {
      expect(data, isNotEmpty);
    }
  });

  test('ApiClient.mock acceptRide returns ride detail', () async {
    final api = ApiClient.mock();
    final result = await api.acceptRide('ride-test-1');
    expect(result, isA<Success<Map<String, dynamic>>>());
  });

  test('ApiClient.mock rejectRide returns success', () async {
    final api = ApiClient.mock();
    final result = await api.rejectRide('ride-test-1');
    expect(result, isA<Success<Map<String, dynamic>>>());
  });
}

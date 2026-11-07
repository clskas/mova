import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mova/core/api/api_client.dart';
import 'package:mova/core/config/client_apps_config.dart';
import 'package:mova/core/config/market_config.dart';
import 'package:mova/core/error/result.dart';
import 'package:mova/core/theme/mova_theme.dart';
import 'package:mova/features/booking/booking_screen.dart';
import 'package:mova/features/booking/widgets/passenger_count_selector.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Mock API whose /public/client-config returns the given feature switches.
class _FlagsApi extends ApiClient {
  _FlagsApi(this.features) : super.mock();
  final Map<String, dynamic> features;

  @override
  Future<Result<dynamic>> get(String path, {int retries = 3, bool skipCache = false}) async {
    if (path == '/public/client-config') return Success({'features': features});
    return super.get(path, retries: retries, skipCache: skipCache);
  }
}

Future<void> _pumpBooking(WidgetTester tester, Map<String, dynamic> features) async {
  tester.view.physicalSize = const Size(400, 1400);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  await tester.pumpWidget(ProviderScope(
    overrides: [apiClientProvider.overrideWith((ref) => _FlagsApi(features))],
    child: MaterialApp(
      theme: buildMovaTheme(),
      home: movaMediaQueryWrapper(child: const BookingScreen(initialVehicleType: 'STANDARD')),
    ),
  ));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 300));
}

void main() {
  setUp(() {
    TestWidgetsFlutterBinding.ensureInitialized();
    SharedPreferences.setMockInitialValues({});
  });

  group('helpers', () {
    test('feature is off unless the admin switch is explicitly on', () {
      expect(passengerCountFeatureEnabled(null), isFalse);
      expect(passengerCountFeatureEnabled({'sengaPlusVisible': true}), isFalse);
      expect(passengerCountFeatureEnabled({'passengerCountEnabled': true}), isTrue);
    });

    test('label only for groups', () {
      expect(passengerCountLabel(null), isNull);
      expect(passengerCountLabel(1), isNull);
      expect(passengerCountLabel(3), '3 passagers');
      expect(passengerCountLabel('5'), '5 passagers');
    });

    test('default seats per category', () {
      expect(defaultPassengerSeats('MOTO_TAXI'), 1);
      expect(defaultPassengerSeats('STANDARD'), 4);
      expect(defaultPassengerSeats('UNKNOWN'), 4);
    });
  });

  testWidgets('selector counts between 1 and the maximum', (tester) async {
    var count = 1;
    await tester.pumpWidget(MaterialApp(
      theme: buildMovaTheme(),
      home: Scaffold(
        body: StatefulBuilder(
          builder: (context, setState) => PassengerCountSelector(
            count: count,
            max: 3,
            onChanged: (n) => setState(() => count = n),
          ),
        ),
      ),
    ));

    expect(find.text('1'), findsOneWidget);
    await tester.tap(find.byKey(const Key('passengerCountMinus')));
    await tester.pump();
    expect(count, 1);

    for (var i = 0; i < 5; i++) {
      await tester.tap(find.byKey(const Key('passengerCountPlus')));
      await tester.pump();
    }
    expect(count, 3);
    expect(find.text('3'), findsOneWidget);
  });

  testWidgets('selector warns that big groups may wait longer', (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: buildMovaTheme(),
      home: Scaffold(body: PassengerCountSelector(count: 6, onChanged: (_) {})),
    ));
    expect(find.textContaining('6 places ou plus'), findsOneWidget);
  });

  testWidgets('booking screen hides the selector while the admin switch is off', (tester) async {
    tester.view.physicalSize = const Size(400, 1100);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);

    await tester.pumpWidget(ProviderScope(
      overrides: [apiClientProvider.overrideWith((ref) => ApiClient.mock())],
      child: MaterialApp(
        theme: buildMovaTheme(),
        home: movaMediaQueryWrapper(child: const BookingScreen(initialVehicleType: 'STANDARD')),
      ),
    ));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.text('Gamme'), findsOneWidget);
    expect(find.byType(PassengerCountSelector), findsNothing);
  });

  group('gamme Familiale', () {
    test('helpers', () {
      expect(familialeFeatureEnabled(null), isFalse);
      expect(familialeFeatureEnabled({'familialeEnabled': true}), isTrue);
      expect(defaultPassengerSeats('FAMILIALE'), 6);
      expect(declarableSeats('FAMILIALE'), [5, 6, 7, 8]);
      expect(declarableSeats('STANDARD').last, 8);
      expect(isFourSeatGamme('VIP'), isTrue);
      expect(isFourSeatGamme('FAMILIALE'), isFalse);
      expect(MarketConfig.normalizeVehicleType('xl'), 'FAMILIALE');
      expect(MarketConfig.vehicleTypesForCategory('TAXI').map((v) => v.id), isNot(contains('FAMILIALE')));
      expect(
        MarketConfig.vehicleTypesForCategory('TAXI', includeFamiliale: true).map((v) => v.id),
        contains('FAMILIALE'),
      );
      expect(MarketConfig.driverVehicleTypesForRide('STANDARD'), ['STANDARD', 'FAMILIALE']);
    });

    testWidgets('without Familiale, cars stop at 4 passengers', (tester) async {
      await _pumpBooking(tester, {'passengerCountEnabled': true});
      expect(find.byType(PassengerCountSelector), findsOneWidget);
      expect(find.text('Familiale'), findsNothing);
      for (var i = 0; i < 6; i++) {
        await tester.tap(find.byKey(const Key('passengerCountPlus')));
        await tester.pump();
      }
      expect(
        tester.widget<Text>(find.byKey(const Key('passengerCountValue'))).data,
        '4',
      );
      expect(find.text('4 passagers maximum par voiture.'), findsOneWidget);
    });

    testWidgets('5 passengers switch Standard to Familiale, and back to a car caps at 4', (tester) async {
      await _pumpBooking(tester, {'passengerCountEnabled': true, 'familialeEnabled': true});
      expect(find.text('Familiale'), findsOneWidget);
      for (var i = 0; i < 4; i++) {
        await tester.tap(find.byKey(const Key('passengerCountPlus')));
        await tester.pump();
      }
      expect(tester.widget<Text>(find.byKey(const Key('passengerCountValue'))).data, '5');
      expect(find.textContaining('gamme Familiale (5 à 8 places) sélectionnée'), findsOneWidget);

      await tester.tap(find.text('Confort'));
      await tester.pump();
      expect(tester.widget<Text>(find.byKey(const Key('passengerCountValue'))).data, '4');
      expect(find.textContaining('4 passagers maximum'), findsWidgets);
      await tester.pump(const Duration(seconds: 5));
    });
  });
}

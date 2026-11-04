import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mova/core/api/api_client.dart';
import 'package:mova/core/config/client_apps_config.dart';
import 'package:mova/core/theme/mova_theme.dart';
import 'package:mova/features/booking/booking_screen.dart';
import 'package:mova/features/booking/widgets/passenger_count_selector.dart';
import 'package:shared_preferences/shared_preferences.dart';

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
}

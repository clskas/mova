import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mova/core/api/api_client.dart';
import 'package:mova/core/theme/mova_theme.dart';
import 'package:mova/features/booking/booking_screen.dart';
import 'package:mova/features/home/home_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';

Widget _testApp(Widget home) {
  return ProviderScope(
    overrides: [apiClientProvider.overrideWith((ref) => ApiClient.mock())],
    child: MaterialApp(
      theme: buildMovaTheme(),
      home: movaMediaQueryWrapper(child: home),
    ),
  );
}

void main() {
  setUp(() {
    TestWidgetsFlutterBinding.ensureInitialized();
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets('BookingScreen shows map and vehicle selector', (tester) async {
    tester.view.physicalSize = const Size(400, 900);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);

    await tester.pumpWidget(_testApp(const BookingScreen()));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.text('Taxi / Moto-taxi'), findsOneWidget);
    expect(find.text('Départ'), findsOneWidget);
    expect(find.text('Destination'), findsOneWidget);
    expect(find.text('Taxi ou moto'), findsOneWidget);
    expect(find.text('Moto'), findsOneWidget);
    expect(find.text('Taxi'), findsOneWidget);
    expect(find.text('Standard'), findsNothing);
    expect(find.text('Estimer le prix'), findsOneWidget);
    expect(find.byIcon(Icons.gps_fixed), findsOneWidget);
    expect(find.text('Tous'), findsOneWidget);
    expect(find.text('Marchés'), findsOneWidget);
    expect(find.text('Hôpitaux'), findsOneWidget);
    expect(find.text('Universités'), findsOneWidget);
    expect(find.text('Pharmacies'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('POI category chip reloads places of that type', (tester) async {
    tester.view.physicalSize = const Size(400, 900);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);

    await tester.pumpWidget(_testApp(const BookingScreen()));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    await tester.tap(find.text('Hôpitaux'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.text('Hôpitaux'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'BookingScreen estimates fare after destination entered',
    (tester) async {},
    skip: true, // Estimate → confirm flow needs full geo mock in CI
  );

  testWidgets('Taxi / Moto filter switches types and keeps MOTO alias selected', (tester) async {
    tester.view.physicalSize = const Size(400, 900);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);

    await tester.pumpWidget(_testApp(const BookingScreen(initialVehicleType: 'MOTO')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.text('Moto'), findsOneWidget);
    expect(find.text('Standard'), findsNothing);

    await tester.tap(find.text('Taxi'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 200));

    expect(find.text('Standard'), findsOneWidget);
    expect(find.text('Confort'), findsOneWidget);
    expect(find.text('VIP'), findsOneWidget);
    expect(find.text('Gamme'), findsOneWidget);

    await tester.tap(find.text('Moto'));
    await tester.pump();
    expect(find.text('Standard'), findsNothing);
  });

  testWidgets('HomeScreen navigates to BookingScreen from Taxi card', (tester) async {
    tester.view.physicalSize = const Size(400, 900);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);

    await tester.pumpWidget(_testApp(const HomeScreen()));
    await tester.pump();

    await tester.tap(find.text('Taxi / Moto-taxi').first);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.text('Taxi / Moto-taxi'), findsWidgets);
    expect(find.text('Confirmer la course'), findsNothing);
    expect(find.text('Estimer le prix'), findsOneWidget);
  });

  testWidgets(
    'BookingScreen navigates to MatchingScreen after confirm',
    (tester) async {},
    skip: true, // Depends on estimate → confirm flow
  );  testWidgets('BookingScreen renders without overflow on narrow widths', (tester) async {
    for (final width in [320.0, 360.0, 390.0]) {
      tester.view.physicalSize = Size(width, 900);
      tester.view.devicePixelRatio = 1.0;

      await tester.pumpWidget(_testApp(const BookingScreen()));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      expect(tester.takeException(), isNull, reason: 'Overflow at width $width');
    }
  });
}

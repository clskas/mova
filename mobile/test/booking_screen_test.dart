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
    expect(find.text('Choisissez votre véhicule'), findsOneWidget);
    expect(find.text('Moto-taxi'), findsOneWidget);
    expect(find.text('Standard'), findsOneWidget);
    expect(find.text('Confort'), findsOneWidget);
    expect(find.text('VIP'), findsOneWidget);
    expect(find.text('Estimer le prix'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('BookingScreen estimates fare after destination entered', (tester) async {
    tester.view.physicalSize = const Size(400, 900);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);

    await tester.pumpWidget(_testApp(const BookingScreen()));
    await tester.pump();

    await tester.enterText(find.byType(TextField).last, 'Gombe');
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    await tester.tap(find.text('Estimer le prix'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.text('Confirmer la course'), findsOneWidget);
    expect(find.text('Estimation'), findsOneWidget);
    expect(tester.takeException(), isNull);
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

  testWidgets('BookingScreen renders without overflow on narrow widths', (tester) async {
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

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mova/core/api/api_client.dart';
import 'package:mova/core/theme/mova_theme.dart';
import 'package:mova/features/carpool/carpool_screen.dart';
import 'package:mova/features/errands/errand_screen.dart';
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
  final widths = [320.0, 360.0, 375.0, 390.0, 428.0];

  setUp(() {
    TestWidgetsFlutterBinding.ensureInitialized();
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets('HomeScreen shows all MOVA services', (tester) async {
    tester.view.physicalSize = const Size(400, 900);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);

    await tester.pumpWidget(_testApp(const HomeScreen()));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('La mobilité, simplement.'), findsOneWidget);
    expect(find.text('Taxi / Moto-taxi'), findsOneWidget);
    expect(find.text('Livraison colis'), findsOneWidget);
    expect(find.text('Wallet MOVA'), findsOneWidget);
    expect(find.text('Historique'), findsNWidgets(2));
    expect(find.byType(NavigationBar), findsOneWidget);
    expect(find.text('Réservation planifiée'), findsOneWidget);
    expect(find.text('Livraison repas'), findsOneWidget);
    expect(find.text('Courses & commissions'), findsOneWidget);
    expect(find.text('Covoiturage'), findsOneWidget);
    expect(find.text('Livraison express'), findsOneWidget);
    expect(find.text('Location véhicule'), findsOneWidget);
    expect(find.text('Déménagement'), findsOneWidget);
    expect(find.text('Kinshasa'), findsWidgets);
    expect(find.text('Bientôt'), findsNothing);
  });

  testWidgets('HomeScreen navigates to implemented services', (tester) async {
    tester.view.physicalSize = const Size(400, 900);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);

    await tester.pumpWidget(_testApp(const HomeScreen()));

    await tester.tap(find.text('Livraison colis').first);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('Catégorie de poids'), findsOneWidget);

    await tester.pageBack();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    await tester.scrollUntilVisible(
      find.text('Réservation planifiée').first,
      120,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.text('Réservation planifiée').first);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('Maximum J+7'), findsOneWidget);

    await tester.pageBack();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    await tester.scrollUntilVisible(
      find.text('Livraison repas').first,
      120,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.text('Livraison repas').first);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.text('Restaurants à proximité'), findsOneWidget);
  });

  testWidgets('Service screens render without overflow', (tester) async {
    for (final width in widths) {
      tester.view.physicalSize = Size(width, 900);
      tester.view.devicePixelRatio = 1.0;

      for (final screen in [const ErrandScreen(), const CarpoolScreen()]) {
        await tester.pumpWidget(_testApp(screen));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 300));
        expect(tester.takeException(), isNull, reason: 'Overflow at width $width');
      }
    }
  });

  testWidgets('HomeScreen renders without overflow on multiple widths', (tester) async {
    for (final width in widths) {
      tester.view.physicalSize = Size(width, 900);
      tester.view.devicePixelRatio = 1.0;

      await tester.pumpWidget(_testApp(const HomeScreen()));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      expect(tester.takeException(), isNull, reason: 'Overflow at width $width');
    }
  });
}

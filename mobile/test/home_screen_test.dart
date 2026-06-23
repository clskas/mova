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
  final widths = [360.0, 375.0, 390.0, 428.0];

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

    expect(find.text('Mobilité partout en RDC — choisissez un service'), findsOneWidget);
    expect(find.text('Taxi / Moto-taxi'), findsOneWidget);
    expect(find.text('Livraisons'), findsOneWidget);
    expect(find.text('Repas, colis, express et plus'), findsOneWidget);
    expect(find.text('Wallet MOVA'), findsOneWidget);
    expect(find.text('Historique'), findsNWidgets(2));
    expect(find.byType(NavigationBar), findsOneWidget);
    expect(find.text('Réservation planifiée'), findsOneWidget);
    expect(find.text('Programmez votre trajet à l\'avance'), findsOneWidget);
    expect(find.text('Livraison colis'), findsNothing);
    expect(find.text('Livraison repas'), findsNothing);
    expect(find.text('Courses & commissions'), findsNothing);
    expect(find.text('Covoiturage'), findsOneWidget);
    expect(find.text('Livraison express'), findsNothing);
    expect(find.text('Location véhicule'), findsOneWidget);
    expect(find.text('Déménagement'), findsOneWidget);
    expect(find.text('Choisir votre ville'), findsNothing);
    expect(find.text('Bientôt'), findsNothing);
  });

  testWidgets('HomeScreen navigates to parcel delivery', (tester) async {
    tester.view.physicalSize = const Size(400, 900);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);

    await tester.pumpWidget(_testApp(const HomeScreen()));
    await tester.pump();

    await tester.tap(find.text('Livraisons').first);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('Choisissez votre type de livraison'), findsOneWidget);

    await tester.tap(find.text('Livraison colis').first);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('Catégorie de poids'), findsOneWidget);
  });

  testWidgets('HomeScreen opens scheduled ride flow', (tester) async {
    tester.view.physicalSize = const Size(400, 900);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);

    await tester.pumpWidget(_testApp(const HomeScreen()));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    final scheduledCard = find.text('Programmez votre trajet à l\'avance');
    await tester.scrollUntilVisible(
      scheduledCard.first,
      120,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.ensureVisible(scheduledCard.first);
    await tester.tap(scheduledCard.first);
    await tester.pumpAndSettle();
    await tester.pump(const Duration(milliseconds: 500));
    final j7Hint = find.text('Réservation possible jusqu\'à J+7 · Rappel la veille (J-1)');
    await tester.scrollUntilVisible(
      j7Hint.first,
      200,
      scrollable: find.byType(Scrollable).last,
    );
    expect(j7Hint, findsOneWidget);
  });

  testWidgets('HomeScreen opens food delivery', (tester) async {
    tester.view.physicalSize = const Size(400, 900);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);

    await tester.pumpWidget(_testApp(const HomeScreen()));
    await tester.pump();

    await tester.tap(find.text('Livraisons').first);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    await tester.tap(find.text('Livraison repas').first);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 800));
    final restaurants = find.text('Restaurants à proximité');
    if (restaurants.evaluate().isEmpty) {
      await tester.pump(const Duration(milliseconds: 800));
    }
    expect(restaurants, findsOneWidget);
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

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mova/core/theme/mova_theme.dart';
import 'package:mova/features/home/home_screen.dart';

void main() {
  final widths = [320.0, 360.0, 375.0, 390.0, 428.0];

  testWidgets('HomeScreen shows all MOVA services', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: buildMovaTheme(),
        home: movaMediaQueryWrapper(child: const HomeScreen()),
      ),
    );

    expect(find.text('La mobilité, simplement.'), findsOneWidget);
    expect(find.text('Taxi / Moto-taxi'), findsOneWidget);
    expect(find.text('Livraison colis'), findsOneWidget);
    expect(find.text('Wallet MOVA'), findsOneWidget);
    expect(find.text('Historique'), findsOneWidget);
    expect(find.text('Réservation planifiée'), findsOneWidget);
    expect(find.text('Livraison repas'), findsOneWidget);
    expect(find.text('Kinshasa'), findsOneWidget);
    expect(find.text('Bientôt'), findsNWidgets(3));
  });

  testWidgets('HomeScreen renders without overflow on multiple widths', (tester) async {
    for (final width in widths) {
      tester.view.physicalSize = Size(width, 800);
      tester.view.devicePixelRatio = 1.0;

      await tester.pumpWidget(
        MaterialApp(
          theme: buildMovaTheme(),
          home: movaMediaQueryWrapper(child: const HomeScreen()),
        ),
      );

      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull, reason: 'Overflow at width $width');
    }
  });
}

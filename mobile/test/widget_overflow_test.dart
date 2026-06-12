import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mova/core/theme/mova_theme.dart';
import 'package:mova/core/widgets/mova_screen.dart';
import 'package:mova/core/widgets/mova_widgets.dart';

void main() {
  final sizes = [320.0, 360.0, 375.0, 390.0, 428.0];

  testWidgets('MovaScreen renders without overflow on multiple widths', (tester) async {
    for (final width in sizes) {
      tester.view.physicalSize = Size(width, 800);
      tester.view.devicePixelRatio = 1.0;

      await tester.pumpWidget(
        MaterialApp(
          theme: buildMovaTheme(),
          home: MovaScreen(
            title: 'Test',
            child: Column(
              children: [
                const MovaCard(child: Text('Contenu test MOVA RDC')),
                const SizedBox(height: 16),
                MovaButton(label: 'Action', onPressed: () {}),
              ],
            ),
          ),
        ),
      );

      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull, reason: 'Overflow at width $width');
    }
  });

  testWidgets('MovaButton shows loading state', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: buildMovaTheme(),
        home: Scaffold(
          body: MovaButton(label: 'Charger', isLoading: true, onPressed: () {}),
        ),
      ),
    );
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });
}

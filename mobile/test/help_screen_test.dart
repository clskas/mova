import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mova/core/theme/mova_theme.dart';
import 'package:mova/features/help/faq_screen.dart';
import 'package:mova/features/help/help_config.dart';
import 'package:mova/features/help/help_screen.dart';
import 'package:mova/features/help/manual_screen.dart';

void main() {
  final widths = [320.0, 360.0, 375.0, 390.0, 428.0];

  Widget testApp(Widget home) {
    return MaterialApp(
      theme: buildMovaTheme(),
      home: movaMediaQueryWrapper(child: home),
    );
  }

  testWidgets('HelpScreen shows hub links', (tester) async {
    tester.view.physicalSize = const Size(400, 900);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);

    await tester.pumpWidget(testApp(const HelpScreen()));
    await tester.pumpAndSettle();

    expect(find.text(HelpConfig.hubTitle), findsOneWidget);
    expect(find.text('Manuel utilisateur'), findsOneWidget);
    expect(find.text('FAQ'), findsOneWidget);
    expect(find.text('Contacter le support'), findsOneWidget);
    expect(find.text('Conditions d\'utilisation'), findsOneWidget);
    expect(find.text('Politique de confidentialité'), findsOneWidget);
  });

  testWidgets('HelpScreen navigates to FAQ and Manual', (tester) async {
    tester.view.physicalSize = const Size(400, 900);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);

    await tester.pumpWidget(testApp(const HelpScreen()));
    await tester.pumpAndSettle();

    await tester.tap(find.text('FAQ'));
    await tester.pumpAndSettle();
    expect(find.text('${kFaqItems.length} questions fréquentes'), findsOneWidget);

    await tester.pageBack();
    await tester.pumpAndSettle();

    await tester.tap(find.text('Manuel utilisateur'));
    await tester.pumpAndSettle();
    expect(find.text('Taxi / Moto-taxi'), findsOneWidget);
    expect(find.text('Déménagement'), findsOneWidget);
  });

  testWidgets('Help screens render without overflow', (tester) async {
    for (final width in widths) {
      tester.view.physicalSize = Size(width, 900);
      tester.view.devicePixelRatio = 1.0;

      for (final screen in [const HelpScreen(), const FaqScreen(), const ManualScreen()]) {
        await tester.pumpWidget(testApp(screen));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull, reason: 'Overflow at width $width');
      }
    }
  });
}

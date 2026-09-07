import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mova/core/api/api_client.dart';
import 'package:mova/core/theme/mova_theme.dart';
import 'package:mova/features/help/contact_support_screen.dart';
import 'package:mova/features/help/faq_screen.dart';
import 'package:mova/features/help/help_config.dart';
import 'package:mova/features/help/help_screen.dart';
import 'package:mova/features/help/driver_help_screen.dart';
import 'package:mova/features/help/manual_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  final widths = [320.0, 360.0, 375.0, 390.0, 428.0];

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  Widget testApp(Widget home) {
    return ProviderScope(
      overrides: [apiClientProvider.overrideWith((ref) => ApiClient.mock())],
      child: MaterialApp(
        theme: buildMovaTheme(),
        home: movaMediaQueryWrapper(child: home),
      ),
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
    expect(find.text('+243 900 000 000'), findsNothing);
  });

  testWidgets('ContactSupportScreen stays empty without published contacts', (tester) async {
    tester.view.physicalSize = const Size(400, 900);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);

    await tester.pumpWidget(testApp(const ContactSupportScreen()));
    await tester.pumpAndSettle();

    expect(find.text('Aucun contact pour le moment.'), findsOneWidget);
    expect(find.text('+243 900 000 000'), findsNothing);
    expect(find.text('support@mova.cd'), findsNothing);
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
    expect(find.text('Connexion et code PIN'), findsOneWidget);
    expect(find.text('Taxi / Moto-taxi'), findsOneWidget);
    expect(find.text('Le prix affiché'), findsOneWidget);
    expect(find.text('Déménagement'), findsOneWidget);
  });

  testWidgets('DriverHelpScreen opens chauffeur manual', (tester) async {
    tester.view.physicalSize = const Size(400, 900);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);

    await tester.pumpWidget(testApp(const DriverHelpScreen()));
    await tester.pumpAndSettle();

    expect(find.text('Aide Chauffeur'), findsOneWidget);
    expect(find.text('Manuel utilisateur'), findsOneWidget);
    expect(find.text('Contacter le support'), findsOneWidget);

    await tester.tap(find.text('Manuel utilisateur'));
    await tester.pumpAndSettle();
    expect(find.text('Manuel chauffeur'), findsOneWidget);
    expect(find.text('Se mettre en ligne'), findsOneWidget);
    expect(find.text('PIN de livraison'), findsOneWidget);
    expect(find.text('Charte et CGU'), findsOneWidget);
  });

  testWidgets('Help screens render without overflow', (tester) async {
    for (final width in widths) {
      tester.view.physicalSize = Size(width, 900);
      tester.view.devicePixelRatio = 1.0;

      for (final screen in [
        const HelpScreen(),
        const FaqScreen(),
        const ManualScreen(),
        const DriverHelpScreen(),
        const ManualScreen(
          title: 'Manuel chauffeur',
          chapters: kDriverManualChapters,
          showFullManual: false,
        ),
      ]) {
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pump();
        await tester.pumpWidget(testApp(screen));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull, reason: 'Overflow at width $width');
      }
    }
  });
}

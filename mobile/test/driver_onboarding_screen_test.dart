import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mova/core/api/api_client.dart';
import 'package:mova/core/theme/mova_theme.dart';
import 'package:mova/core/widgets/mova_widgets.dart';
import 'package:mova/features/driver/driver_onboarding_screen.dart';
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
    SharedPreferences.setMockInitialValues({'driver_onboarding_step': 3});
  });

  testWidgets('Compliance step disables Continuer until training, charter and CGU', (tester) async {
    tester.view.physicalSize = const Size(400, 1100);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);

    await tester.pumpWidget(_testApp(const DriverOnboardingScreen()));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.textContaining('formation sécurité SENGA'), findsOneWidget);
    expect(find.textContaining('charte de bonne conduite SENGA'), findsOneWidget);
    expect(find.textContaining('Conditions Générales d\'Utilisation'), findsOneWidget);
    expect(find.text('Retour'), findsOneWidget);
    expect(find.byIcon(Icons.arrow_back_rounded), findsOneWidget);
    expect(find.byIcon(Icons.arrow_forward_rounded), findsWidgets);

    expect(tester.widget<MovaButton>(find.widgetWithText(MovaButton, 'Continuer')).onPressed, isNull);

    await tester.tap(find.textContaining('formation sécurité SENGA'));
    await tester.pump();
    await tester.tap(find.textContaining('charte de bonne conduite SENGA'));
    await tester.pump();
    expect(tester.widget<MovaButton>(find.widgetWithText(MovaButton, 'Continuer')).onPressed, isNull);

    await tester.tap(find.textContaining('Conditions Générales d\'Utilisation'));
    await tester.pump();
    expect(tester.widget<MovaButton>(find.widgetWithText(MovaButton, 'Continuer')).onPressed, isNotNull);
    expect(tester.takeException(), isNull);
  });
}

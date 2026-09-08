import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mova/core/api/api_client.dart';
import 'package:mova/core/theme/mova_theme.dart';
import 'package:mova/features/driver/driver_activation_pin_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  setUp(() {
    TestWidgetsFlutterBinding.ensureInitialized();
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets('shows blocking PIN d\'activation, not a dismissible home dialog', (tester) async {
    tester.view.physicalSize = const Size(400, 800);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);

    var activated = false;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [apiClientProvider.overrideWith((ref) => ApiClient.mock())],
        child: MaterialApp(
          theme: buildMovaTheme(),
          home: movaMediaQueryWrapper(
            child: DriverActivationPinScreen(
              onActivated: (_) async {
                activated = true;
              },
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('PIN d\'activation'), findsWidgets);
    expect(find.text('Plus tard'), findsNothing);
    expect(find.text('Activer le compte'), findsOneWidget);
    expect(find.textContaining('pas un code Google'), findsOneWidget);

    await tester.enterText(find.byType(TextField), '482917');
    await tester.pump();
    await tester.tap(find.text('Activer le compte'));
    await tester.pumpAndSettle();

    expect(activated, isTrue);
    expect(tester.takeException(), isNull);
  });
}

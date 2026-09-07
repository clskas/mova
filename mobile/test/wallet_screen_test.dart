import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mova/core/api/api_client.dart';
import 'package:mova/core/api/mock_data.dart';
import 'package:mova/core/theme/mova_theme.dart';
import 'package:mova/features/wallet/wallet_screen.dart';
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

  testWidgets('Wallet top-up sheet survives amount edits while loading', (tester) async {
    tester.view.physicalSize = const Size(400, 900);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);

    await tester.pumpWidget(_testApp(const WalletScreen()));
    await tester.pump();

    await tester.tap(find.text('Orange Money'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.text('Montant (FC)'), findsOneWidget);

    await tester.enterText(find.byType(TextField).first, '25000');
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    expect(tester.takeException(), isNull);
    expect(find.text('25000'), findsOneWidget);
  });

  testWidgets('Withdraw requires OTP sent to the destination MM number', (tester) async {
    tester.view.physicalSize = const Size(400, 1100);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    MockData.seedWalletForTest(5000);

    await tester.pumpWidget(_testApp(const WalletScreen()));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    await tester.ensureVisible(find.text('Retirer vers Mobile Money'));
    await tester.tap(find.text('Retirer vers Mobile Money'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.text('Envoyer le code SMS'), findsOneWidget);
    expect(find.text('Confirmer le retrait'), findsNothing);

    await tester.enterText(find.byType(TextField).first, '2500');
    await tester.pump();

    await tester.tap(find.text('Envoyer le code SMS'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.text('Code SMS (6 chiffres)'), findsOneWidget);
    expect(find.text('Confirmer le retrait'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Partial withdraw below the MM floor shows an in-sheet error', (tester) async {
    tester.view.physicalSize = const Size(400, 1100);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    MockData.seedWalletForTest(5000);

    await tester.pumpWidget(_testApp(const WalletScreen()));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    await tester.ensureVisible(find.text('Retirer vers Mobile Money'));
    await tester.tap(find.text('Retirer vers Mobile Money'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    await tester.enterText(find.byType(TextField).first, '2000');
    await tester.pump();
    await tester.tap(find.text('Envoyer le code SMS'));
    await tester.pump();

    expect(find.textContaining('Montant minimum'), findsOneWidget);
    expect(find.text('Confirmer le retrait'), findsNothing);
  });

  test('parseWithdrawAmountCdf accepts spaced integers and rejects decimals', () {
    expect(parseWithdrawAmountCdf('2 500'), 2500);
    expect(parseWithdrawAmountCdf('2300'), 2300);
    expect(parseWithdrawAmountCdf('2300.5'), isNull);
  });
}

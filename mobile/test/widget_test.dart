import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mova/core/widgets/mova_widgets.dart';
import 'package:mova/core/theme/mova_theme.dart';

void main() {
  testWidgets('MovaButton renders label without overflow', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: buildMovaTheme(),
        home: Scaffold(
          body: SizedBox(
            width: 320,
            child: MovaButton(
              label: 'Réserver une course en RDC',
              onPressed: () {},
            ),
          ),
        ),
      ),
    );
    expect(find.text('Réserver une course en RDC'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('MovaCard fits narrow width 320px', (tester) async {
    await tester.binding.setSurfaceSize(const Size(320, 640));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(
      MaterialApp(
        theme: buildMovaTheme(),
        home: Scaffold(
          body: MovaCard(
            child: Text(
              'Paiement en CDF via Orange Money, M-Pesa ou portefeuille SENGA',
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ),
      ),
    );
    expect(tester.takeException(), isNull);
  });
}

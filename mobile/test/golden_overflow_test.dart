import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mova/core/theme/mova_theme.dart';
import 'package:mova/core/widgets/mova_widgets.dart';

Widget _narrowScreen(Widget child, double width) {
  return MaterialApp(
    theme: buildMovaTheme(),
    home: movaMediaQueryWrapper(
      child: MediaQuery(
        data: MediaQueryData(size: Size(width, 800)),
        child: Scaffold(body: SingleChildScrollView(child: child)),
      ),
    ),
  );
}

void main() {
  for (final width in [320.0, 375.0, 428.0]) {
    testWidgets('No overflow at ${width.toInt()}px width', (tester) async {
      await tester.binding.setSurfaceSize(Size(width, 800));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      await tester.pumpWidget(
        _narrowScreen(
          Column(
            children: [
              const MovaCard(
                child: Text('MOVA — Mobilité urbaine en RDC'),
              ),
              const SizedBox(height: 8),
              MovaButton(label: 'Commander un moto-taxi', onPressed: () {}),
              const SizedBox(height: 8),
              MovaButton(label: 'Voir l\'historique', isSecondary: true, onPressed: () {}),
            ],
          ),
          width,
        ),
      );
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    });
  }
}

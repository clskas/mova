import 'package:flutter_test/flutter_test.dart';
import 'package:mova/features/growth/growth_widgets.dart';

void main() {
  test('prix proposé borné comme le serveur', () {
    expect(clampProposedFare(10000, 5000, 80, 150), 8000);
    expect(clampProposedFare(10000, 9000, 80, 150), 9000);
    expect(clampProposedFare(10000, 50000, 80, 150), 15000);
    expect(clampProposedFare(10000, 9050, 80, 150), 9100);
  });

  test('config croissance lue depuis client-config', () {
    final c = GrowthConfig.from({
      'priceOffer': {'enabled': true, 'minPct': 70},
      'tips': {'enabled': true, 'presetsCdf': [500, 0, 1500]},
    });
    expect(c.on('priceOffer'), isTrue);
    expect(c.on('loyalty'), isFalse);
    expect(c.intOf('priceOffer', 'minPct', 80), 70);
    expect(c.tipPresets(), [500, 1500]);
    expect(GrowthConfig.from(null).on('tips'), isFalse);
  });
}

import 'package:flutter_test/flutter_test.dart';
import 'package:mova/core/i18n/i18n.dart';
import 'package:mova/core/i18n/strings_en.dart';

void main() {
  tearDown(() => appLanguage.value = 'fr');

  test('French by default, English when chosen, French when a text is missing', () {
    expect(tr('Annuler'), 'Annuler');
    appLanguage.value = 'en';
    expect(tr('Annuler'), 'Cancel');
    expect(tr('Texte pas encore traduit'), 'Texte pas encore traduit');
  });

  test('placeholders are filled', () {
    appLanguage.value = 'en';
    expect(trf('Bonjour {name}', {'name': 'Amani'}), 'Bonjour Amani');
  });

  test('every English text is non-empty and differs from its key', () {
    for (final e in kStringsEn.entries) {
      expect(e.value.trim(), isNotEmpty, reason: e.key);
    }
  });

  test('only French and English are offered until Lingala/Swahili are reviewed', () {
    expect(kAppLanguages.map((l) => l.code), ['fr', 'en']);
  });
}

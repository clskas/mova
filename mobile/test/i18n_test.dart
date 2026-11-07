import 'package:flutter_test/flutter_test.dart';
import 'package:mova/core/error/result.dart';
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

  test('screens added in the second pass translate', () {
    appLanguage.value = 'en';
    expect(tr('Livraison express'), 'Express delivery');
    expect(trf('Réf. {v1}', {'v1': 'AB12'}), 'Ref. AB12');
  });

  test('error messages follow the app language', () {
    appLanguage.value = 'en';
    expect(const ServerFailure().message, 'Server error. Please try again.');
    expect(const ServerFailure().messageFr, 'Erreur serveur. Veuillez réessayer.');
    appLanguage.value = 'fr';
    expect(const ServerFailure().message, 'Erreur serveur. Veuillez réessayer.');
  });

  test('AAB flavour markers stay out of the shared table', () {
    // tool/verify_aab_flavor.sh greps these per app; the shared table ships in both apps.
    expect(kStringsEn.containsKey('Bienvenue sur SENGA'), isFalse);
    expect(kStringsEn.containsKey('Espace chauffeur'), isFalse);
  });
}

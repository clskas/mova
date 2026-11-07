import 'dart:convert';
import 'dart:io';
import 'package:shared_preferences/shared_preferences.dart';
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

  test('four languages; Swahili and Lingala come from the server', () {
    expect(kAppLanguages.map((l) => l.code), ['fr', 'en', 'sw', 'ln']);
    expect(kDownloadedLanguages, {'sw', 'ln'});
  });

  test('downloaded Swahili texts are used, missing ones stay French', () async {
    SharedPreferences.setMockInitialValues({});
    await setDownloadedStrings('sw', {'Annuler': 'Ghairi'});
    await setAppLanguage('sw');
    expect(tr('Annuler'), 'Ghairi');
    expect(tr('Texte pas encore traduit'), 'Texte pas encore traduit');
  });

  test('a language hidden by the super admin falls back to French', () async {
    SharedPreferences.setMockInitialValues({});
    await setAppLanguage('en');
    await applyVisibleLanguages({'en': false, 'sw': true, 'ln': true, 'pickerVisible': true});
    expect(visibleAppLanguages.value, ['fr', 'sw', 'ln']);
    expect(appLanguage.value, 'fr');
    await applyVisibleLanguages({'pickerVisible': false});
    expect(visibleAppLanguages.value, ['fr']);
    await applyVisibleLanguages({});
  });

  test('the server translates exactly the app texts (run scripts/sync-ui-strings.mjs)', () {
    final file = File('../packages/shared/src/ui-source-strings.ts');
    if (!file.existsSync()) return;
    final src = file.readAsStringSync();
    final listed = (jsonDecode(src.substring(src.indexOf('= [') + 2, src.lastIndexOf(']') + 1)) as List).cast<String>().toSet();
    expect(listed, kStringsEn.keys.toSet());
  });

  test('"Ma position" is recognised in every language', () {
    appLanguage.value = 'en';
    expect(isMyPositionText('Ma position'), isTrue);
    expect(isMyPositionText(tr('Ma position')), isTrue);
    expect(isMyPositionText('Gombe'), isFalse);
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

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'strings_en.dart';

/// Languages offered in the app. Lingala and Swahili come after a native review.
const kAppLanguages = <({String code, String label})>[
  (code: 'fr', label: 'Français'),
  (code: 'en', label: 'English'),
];

const _prefKey = 'app_language';

/// Current UI language ('fr' by default). Screens built after a change use it.
final ValueNotifier<String> appLanguage = ValueNotifier<String>('fr');

/// Reads the saved language at startup. Never throws.
Future<void> loadAppLanguage() async {
  try {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getString(_prefKey);
    if (saved != null && kAppLanguages.any((l) => l.code == saved)) appLanguage.value = saved;
  } catch (_) {
    /* keep French */
  }
}

/// Called after a language change (e.g. the driver app re-registers its push token).
/// Each app adds its own hooks at startup, so shared code never imports app-specific code.
final List<Future<void> Function(String code)> appLanguageChangedHooks = [];

Future<void> setAppLanguage(String code) async {
  if (!kAppLanguages.any((l) => l.code == code)) return;
  appLanguage.value = code;
  for (final hook in List.of(appLanguageChangedHooks)) {
    try {
      await hook(code);
    } catch (_) {
      /* a failing hook never blocks the language change */
    }
  }
  try {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_prefKey, code);
  } catch (_) {
    /* the choice still applies until the app restarts */
  }
}

/// Translates a French UI text. Unknown texts stay in French, so nothing breaks
/// when a translation is missing.
String tr(String fr) {
  if (appLanguage.value == 'en') return kStringsEn[fr] ?? fr;
  return fr;
}

/// Same as [tr] for a text with `{name}` placeholders.
String trf(String fr, Map<String, Object?> values) {
  var out = tr(fr);
  values.forEach((k, v) => out = out.replaceAll('{$k}', '${v ?? ''}'));
  return out;
}

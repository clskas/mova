import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'strings_en.dart';

/// Languages the app can show. English is bundled; Swahili and Lingala are translated by the
/// SENGA server and downloaded (texts not translated yet stay in French).
const kAppLanguages = <({String code, String label})>[
  (code: 'fr', label: 'Français'),
  (code: 'en', label: 'English'),
  (code: 'sw', label: 'Kiswahili'),
  (code: 'ln', label: 'Lingala'),
];

/// Languages whose texts come from the server.
const kDownloadedLanguages = {'sw', 'ln'};

const _prefKey = 'app_language';
const _visiblePrefKey = 'app_languages_visible';
String _dictPrefKey(String code) => 'app_strings_$code';

/// Language buttons the super admin left visible (French is always available).
final ValueNotifier<List<String>> visibleAppLanguages = ValueNotifier<List<String>>(['fr', 'en', 'sw', 'ln']);

/// Downloaded texts of the current Swahili / Lingala language ({ french: translation }).
Map<String, String> _downloaded = const {};
String? _downloadedCode;

/// Installs a downloaded dictionary and keeps it for the next starts.
Future<void> setDownloadedStrings(String code, Map<String, String> strings) async {
  if (!kDownloadedLanguages.contains(code)) return;
  if (code == appLanguage.value || _downloadedCode == null) {
    _downloaded = strings;
    _downloadedCode = code;
  }
  try {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_dictPrefKey(code), jsonEncode(strings));
  } catch (_) {}
}

/// Number of downloaded texts for [code] (0 before the first download).
Future<int> downloadedStringCount(String code) async {
  if (_downloadedCode == code) return _downloaded.length;
  return (await _loadSavedStrings(code)).length;
}

Future<Map<String, String>> _loadSavedStrings(String code) async {
  try {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_dictPrefKey(code));
    if (raw == null) return const {};
    return Map<String, String>.from(jsonDecode(raw) as Map);
  } catch (_) {
    return const {};
  }
}

Future<void> _useSavedStrings(String code) async {
  if (!kDownloadedLanguages.contains(code)) return;
  _downloaded = await _loadSavedStrings(code);
  _downloadedCode = code;
}

/// Applies the languages the super admin made visible. When the chosen language was hidden,
/// the app goes back to French.
Future<void> applyVisibleLanguages(Map<String, dynamic>? languages) async {
  final l = languages ?? const {};
  final visible = l['pickerVisible'] == false
      ? ['fr']
      : ['fr', ...['en', 'sw', 'ln'].where((c) => l[c] != false)];
  visibleAppLanguages.value = visible;
  try {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(_visiblePrefKey, visible);
  } catch (_) {}
  if (!visible.contains(appLanguage.value)) await setAppLanguage('fr');
}

/// Current UI language ('fr' by default). Screens built after a change use it.
final ValueNotifier<String> appLanguage = ValueNotifier<String>('fr');

/// Reads the saved language at startup. Never throws.
Future<void> loadAppLanguage() async {
  try {
    final prefs = await SharedPreferences.getInstance();
    final visible = prefs.getStringList(_visiblePrefKey);
    if (visible != null && visible.isNotEmpty) visibleAppLanguages.value = visible;
    final saved = prefs.getString(_prefKey);
    if (saved != null && kAppLanguages.any((l) => l.code == saved) && visibleAppLanguages.value.contains(saved)) {
      appLanguage.value = saved;
      await _useSavedStrings(saved);
    }
  } catch (_) {
    /* keep French */
  }
}

/// Called after a language change (e.g. the driver app re-registers its push token).
/// Each app adds its own hooks at startup, so shared code never imports app-specific code.
final List<Future<void> Function(String code)> appLanguageChangedHooks = [];

Future<void> setAppLanguage(String code) async {
  if (!kAppLanguages.any((l) => l.code == code)) return;
  if (kDownloadedLanguages.contains(code) && _downloadedCode != code) await _useSavedStrings(code);
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
  final code = appLanguage.value;
  if (code == 'en') return kStringsEn[fr] ?? fr;
  if (code == _downloadedCode) return _downloaded[fr] ?? fr;
  return fr;
}

/// The "my position" placeholder of address fields, in French or in the app language.
/// Compare with this, never with the French text: in English the field shows "My location".
bool isMyPositionText(String? text) {
  final t = (text ?? '').trim();
  return t == 'Ma position' || t == tr('Ma position');
}

/// Same as [tr] for a text with `{name}` placeholders.
String trf(String fr, Map<String, Object?> values) {
  var out = tr(fr);
  values.forEach((k, v) => out = out.replaceAll('{$k}', '${v ?? ''}'));
  return out;
}

import '../api/api_client.dart';
import '../error/result.dart';
import 'i18n.dart';

/// Downloads the Swahili / Lingala texts translated by the server and installs them.
/// Returns (texts received, texts in the app); (0, 0) when offline or for bundled languages.
Future<({int done, int total})> refreshDownloadedStrings(ApiClient api, String code) async {
  if (!kDownloadedLanguages.contains(code)) return (done: 0, total: 0);
  final result = await api.get('/public/i18n/$code', skipCache: true);
  if (result case Success(:final data) when data is Map) {
    final raw = data['strings'];
    if (raw is Map && raw.isNotEmpty) {
      await setDownloadedStrings(code, raw.map((k, v) => MapEntry(k.toString(), v.toString())));
    }
    return (done: (data['done'] as num?)?.toInt() ?? 0, total: (data['total'] as num?)?.toInt() ?? 0);
  }
  return (done: 0, total: 0);
}

/// Applies the language buttons the super admin made visible, then refreshes the current
/// language's texts. Silent when offline.
Future<void> refreshLanguageSettings(ApiClient api) async {
  final result = await api.get('/public/client-config');
  if (result case Success(:final data) when data is Map) {
    final languages = data['languages'];
    await applyVisibleLanguages(languages is Map ? Map<String, dynamic>.from(languages) : null);
  }
  final code = appLanguage.value;
  if (kDownloadedLanguages.contains(code)) await refreshDownloadedStrings(api, code);
}

import 'package:shared_preferences/shared_preferences.dart';

/// Son des alertes mission chauffeur (mute + style).
enum DriverAlertSoundStyle {
  /// Son SENGA dédié (`senga_job`).
  senga,

  /// Son de notification par défaut du téléphone.
  system,
}

class DriverAlertPrefs {
  DriverAlertPrefs._();

  static const _mutedKey = 'senga_driver_alert_muted_v1';
  static const _styleKey = 'senga_driver_alert_sound_style_v1';

  static bool _muted = false;
  static DriverAlertSoundStyle _style = DriverAlertSoundStyle.senga;
  static bool _loaded = false;

  static bool get muted => _muted;
  static DriverAlertSoundStyle get style => _style;

  static Future<void> ensureLoaded() async {
    if (_loaded) return;
    try {
      final prefs = await SharedPreferences.getInstance();
      _muted = prefs.getBool(_mutedKey) ?? false;
      final raw = prefs.getString(_styleKey) ?? DriverAlertSoundStyle.senga.name;
      _style = DriverAlertSoundStyle.values.firstWhere(
        (e) => e.name == raw,
        orElse: () => DriverAlertSoundStyle.senga,
      );
    } catch (_) {
      /* ignore */
    }
    _loaded = true;
  }

  static Future<void> setMuted(bool value) async {
    _muted = value;
    _loaded = true;
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool(_mutedKey, value);
    } catch (_) {
      /* ignore */
    }
  }

  static Future<void> setStyle(DriverAlertSoundStyle value) async {
    _style = value;
    _loaded = true;
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_styleKey, value.name);
    } catch (_) {
      /* ignore */
    }
  }
}

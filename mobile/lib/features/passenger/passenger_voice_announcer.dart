import 'package:flutter/widgets.dart';
import 'package:flutter_tts/flutter_tts.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/i18n/i18n.dart';

/// Annonce vocale des étapes d'une course / livraison côté passager
/// (« Votre chauffeur est arrivé »). Désactivable dans Mon profil.
class PassengerVoiceAnnouncer {
  PassengerVoiceAnnouncer._();

  static const prefKey = 'passenger_voice_announce';
  static final ValueNotifier<bool> enabled = ValueNotifier<bool>(true);
  static FlutterTts? _tts;
  static bool _loaded = false;
  static String? _lastText;
  static DateTime _lastAt = DateTime.fromMillisecondsSinceEpoch(0);

  static Future<void> load() async {
    if (_loaded) return;
    _loaded = true;
    try {
      final p = await SharedPreferences.getInstance();
      enabled.value = p.getBool(prefKey) ?? true;
    } catch (_) {
      /* tests : garder la valeur par défaut */
    }
  }

  static Future<void> setEnabled(bool on) async {
    enabled.value = on;
    if (!on) await _tts?.stop();
    try {
      final p = await SharedPreferences.getInstance();
      await p.setBool(prefKey, on);
    } catch (_) {
      /* ignore */
    }
  }

  /// Voix du téléphone pour la langue de l'app. Le lingala n'existe pas comme voix :
  /// on lit alors la phrase française (pure, testée).
  static ({String locale, bool useFrench}) voiceFor(String appLang) {
    switch (appLang) {
      case 'en':
        return (locale: 'en-US', useFrench: false);
      case 'sw':
        return (locale: 'sw-KE', useFrench: false);
      default:
        return (locale: 'fr-FR', useFrench: true);
    }
  }

  /// [frenchKey] = phrase source (française), traduite via [tr] si la voix existe.
  static Future<void> announce(String frenchKey) async {
    await load();
    if (!enabled.value) return;
    // Uniquement app ouverte : en arrière-plan la notification sonore suffit.
    final state = WidgetsBinding.instance.lifecycleState;
    if (state != null && state != AppLifecycleState.resumed) return;
    try {
      final tts = _tts ??= FlutterTts();
      var voice = voiceFor(appLanguage.value);
      if (!voice.useFrench) {
        final ok = await tts.isLanguageAvailable(voice.locale);
        if (ok != true) voice = (locale: 'fr-FR', useFrench: true);
      }
      final text = voice.useFrench ? frenchKey : tr(frenchKey);
      // Même phrase deux fois de suite (poll + socket) : une seule annonce.
      final now = DateTime.now();
      if (text == _lastText && now.difference(_lastAt) < const Duration(seconds: 20)) return;
      _lastText = text;
      _lastAt = now;
      await tts.setLanguage(voice.locale);
      await tts.setSpeechRate(0.5);
      await tts.setVolume(1.0);
      await tts.speak(text);
    } catch (_) {
      // Pas de moteur vocal (tests / desktop) : la notification reste.
    }
  }
}

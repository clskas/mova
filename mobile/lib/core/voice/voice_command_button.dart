import 'package:flutter/material.dart';
import 'package:speech_to_text/speech_to_text.dart';

import '../i18n/i18n.dart';
import '../theme/mova_colors.dart';

/// Micro button: listens (phone speech recognition, French) and returns the sentence heard.
/// Nothing happens on its own — each screen decides what to do with the text, and anything
/// that orders or changes a ride still needs a confirmation.
class VoiceCommandButton extends StatefulWidget {
  const VoiceCommandButton({
    super.key,
    required this.onText,
    this.tooltip,
    this.hint,
    this.color,
    this.localeId = 'fr_FR',
  });

  final Future<void> Function(String text) onText;
  final String? tooltip;

  /// Shown while listening, e.g. « Dites : je vais à Limete en moto ».
  final String? hint;
  final Color? color;
  final String localeId;

  @override
  State<VoiceCommandButton> createState() => _VoiceCommandButtonState();
}

class _VoiceCommandButtonState extends State<VoiceCommandButton> {
  final SpeechToText _speech = SpeechToText();
  bool _busy = false;

  Future<void> _listen() async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final ok = await _speech.initialize(onError: (_) {}, onStatus: (_) {});
      if (!mounted) return;
      if (!ok) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(tr('Commande vocale indisponible : autorisez le micro dans les réglages du téléphone.'))),
        );
        return;
      }
      final text = await showModalBottomSheet<String>(
        context: context,
        isDismissible: true,
        builder: (_) => _ListeningSheet(speech: _speech, hint: widget.hint, localeId: widget.localeId),
      );
      if (!mounted || text == null || text.trim().isEmpty) return;
      await widget.onText(text.trim());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return IconButton(
      key: const Key('voiceCommandButton'),
      tooltip: widget.tooltip ?? tr('Commande vocale'),
      icon: _busy
          ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
          : Icon(Icons.mic, color: widget.color ?? MovaColors.violet),
      onPressed: _busy ? null : _listen,
    );
  }
}

class _ListeningSheet extends StatefulWidget {
  const _ListeningSheet({required this.speech, required this.localeId, this.hint});

  final SpeechToText speech;
  final String localeId;
  final String? hint;

  @override
  State<_ListeningSheet> createState() => _ListeningSheetState();
}

class _ListeningSheetState extends State<_ListeningSheet> {
  String _text = '';
  bool _done = false;

  @override
  void initState() {
    super.initState();
    widget.speech.listen(
      localeId: widget.localeId,
      listenFor: const Duration(seconds: 15),
      pauseFor: const Duration(seconds: 3),
      onResult: (r) {
        if (!mounted) return;
        setState(() => _text = r.recognizedWords);
        if (r.finalResult && !_done) {
          _done = true;
          Navigator.of(context).pop(_text);
        }
      },
    );
  }

  @override
  void dispose() {
    widget.speech.stop();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.mic, size: 48, color: MovaColors.violet),
            const SizedBox(height: 12),
            Text(tr('Je vous écoute…'), style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
            if (widget.hint != null) ...[
              const SizedBox(height: 6),
              Text(widget.hint!, textAlign: TextAlign.center, style: const TextStyle(color: MovaColors.textSecondary)),
            ],
            const SizedBox(height: 16),
            Text(_text.isEmpty ? '…' : _text, textAlign: TextAlign.center, style: const TextStyle(fontSize: 18)),
            const SizedBox(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                TextButton(onPressed: () => Navigator.of(context).pop(), child: Text(tr('Annuler'))),
                FilledButton(
                  onPressed: _text.trim().isEmpty ? null : () => Navigator.of(context).pop(_text),
                  child: Text(tr('Valider')),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// Driver voice commands, recognised on the phone (no AI, works offline once the phone
/// recognises French). Short words a driver says with hands on the wheel.
enum DriverVoiceIntent { arrived, start, finish, navigate, callPassenger, online, offline, accept, reject, unknown }

String _norm(String s) => s
    .toLowerCase()
    .replaceAll(RegExp('[éèêë]'), 'e')
    .replaceAll(RegExp('[àâä]'), 'a')
    .replaceAll(RegExp('[îï]'), 'i')
    .replaceAll(RegExp('[ôö]'), 'o')
    .replaceAll(RegExp('[ùûü]'), 'u')
    .replaceAll('ç', 'c');

DriverVoiceIntent parseDriverVoiceIntent(String text) {
  final t = _norm(text);
  bool has(List<String> words) => words.any(t.contains);
  if (has(['hors ligne', 'hors-ligne', 'deconnect', 'pause', 'arrete de travailler'])) return DriverVoiceIntent.offline;
  if (has(['en ligne', 'connecte', 'je travaille', 'disponible'])) return DriverVoiceIntent.online;
  if (has(['refuse', 'refuser', 'non merci', 'decline'])) return DriverVoiceIntent.reject;
  if (has(['accepte', 'accepter', 'je prends', 'ok je prends'])) return DriverVoiceIntent.accept;
  if (has(['itineraire', 'navigation', 'naviguer', 'gps', 'guide-moi', 'guide moi', 'carte'])) return DriverVoiceIntent.navigate;
  if (has(['appelle', 'appeler', 'appel', 'telephone'])) return DriverVoiceIntent.callPassenger;
  if (has(['termine', 'terminer', 'fini', 'fin de course', 'arrive a destination', 'arrivee'])) return DriverVoiceIntent.finish;
  if (has(['demarre', 'demarrer', 'commence', 'commencer', 'on y va', 'passager a bord', 'est monte'])) return DriverVoiceIntent.start;
  if (has(['arrive', 'je suis la', 'sur place'])) return DriverVoiceIntent.arrived;
  return DriverVoiceIntent.unknown;
}

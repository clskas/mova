import 'dart:async';

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
    this.autoListen = false,
    this.autoListenDelay = const Duration(seconds: 2),
    this.autoListenFor = const Duration(seconds: 10),
    this.onAutoListenChanged,
  });

  final Future<void> Function(String text) onText;
  final String? tooltip;

  /// Shown while listening, e.g. « Dites : je vais à Limete en moto ».
  final String? hint;
  final Color? color;
  final String localeId;

  /// Opens the micro on its own (no sheet) once, [autoListenDelay] after the button appears,
  /// for [autoListenFor] — only if the micro permission was already granted (never a prompt).
  final bool autoListen;
  final Duration autoListenDelay;
  final Duration autoListenFor;

  /// true when the automatic listening starts, false when it ends (after [onText] has run).
  final ValueChanged<bool>? onAutoListenChanged;

  @override
  State<VoiceCommandButton> createState() => _VoiceCommandButtonState();
}

class _VoiceCommandButtonState extends State<VoiceCommandButton> {
  final SpeechToText _speech = SpeechToText();
  bool _busy = false;
  bool _autoListening = false;
  Timer? _autoStartTimer;
  Timer? _autoStopTimer;

  @override
  void initState() {
    super.initState();
    if (widget.autoListen) {
      _autoStartTimer = Timer(widget.autoListenDelay, () => unawaited(_startAutoListen()));
    }
  }

  @override
  void dispose() {
    _autoStartTimer?.cancel();
    _autoStopTimer?.cancel();
    if (_autoListening) unawaited(_speech.stop());
    super.dispose();
  }

  Future<void> _startAutoListen() async {
    if (!mounted || _busy || _autoListening) return;
    try {
      // Never ask for the micro here: an offer screen is not the place for a permission prompt.
      if (!await _speech.hasPermission) return;
      final ok = await _speech.initialize(
        onError: (_) => _endAutoListen(),
        onStatus: (s) {
          if (s == SpeechToText.doneStatus || s == SpeechToText.notListeningStatus) _endAutoListen();
        },
      );
      if (!ok || !mounted) return;
      setState(() => _autoListening = true);
      widget.onAutoListenChanged?.call(true);
      _autoStopTimer = Timer(widget.autoListenFor + const Duration(seconds: 1), _endAutoListen);
      await _speech.listen(
        localeId: widget.localeId,
        listenFor: widget.autoListenFor,
        pauseFor: const Duration(seconds: 3),
        onResult: (r) {
          if (!mounted || !_autoListening || !r.finalResult) return;
          final text = r.recognizedWords.trim();
          _endAutoListen(text: text);
        },
      );
    } catch (_) {
      _endAutoListen();
    }
  }

  /// Ends the automatic listening once; runs [VoiceCommandButton.onText] with what was heard first.
  Future<void> _endAutoListen({String text = ''}) async {
    if (!_autoListening) return;
    _autoListening = false;
    _autoStopTimer?.cancel();
    unawaited(_speech.stop());
    if (mounted) setState(() {});
    try {
      if (text.isNotEmpty && mounted) await widget.onText(text);
    } finally {
      widget.onAutoListenChanged?.call(false);
    }
  }

  Future<void> _listen() async {
    if (_autoListening) {
      // Tap while it listens on its own: stop.
      await _endAutoListen();
      return;
    }
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
      tooltip: _autoListening ? tr('Arrêter l’écoute') : (widget.tooltip ?? tr('Commande vocale')),
      icon: _autoListening
          ? const Icon(Icons.mic, color: Colors.redAccent)
          : _busy
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
enum DriverVoiceIntent {
  arrived,
  start,
  finish,
  navigate,
  callPassenger,
  online,
  offline,
  accept,
  reject,
  cancel,
  cashReceived,
  cashNotReceived,
  passengerPicked,
  passengerDropped,
  unreachable,
  unknown,
}

/// Passenger voice commands, recognised on the phone (no AI). Ordering a ride by voice
/// (« je vais à Limete en moto ») stays on the booking screen, which uses the AI.
enum PassengerVoiceIntent {
  taxi,
  delivery,
  food,
  parcel,
  scheduled,
  carpool,
  rental,
  moving,
  wallet,
  history,
  myRide,
  cancel,
  callDriver,
  share,
  sos,
  pay,
  cashPaid,
  received,
  unknown,
}

PassengerVoiceIntent parsePassengerVoiceIntent(String text) {
  final t = _norm(text);
  bool has(List<String> words) => words.any(t.contains);
  if (has(['sos', 'au secours', 'urgence', 'aidez moi', 'danger'])) return PassengerVoiceIntent.sos;
  if (has(['j ai paye', 'deja paye', 'paye en especes', 'paye le chauffeur', 'paye le livreur', 'j ai donne l argent'])) {
    return PassengerVoiceIntent.cashPaid;
  }
  if (has(['annule', 'annuler', 'annulation'])) return PassengerVoiceIntent.cancel;
  if (has(['recu le colis', 'colis recu', 'j ai recu', 'bien recu', 'commande recue', 'repas recu'])) return PassengerVoiceIntent.received;
  if (has(['payer', 'paiement', 'regler'])) return PassengerVoiceIntent.pay;
  if (has(['appelle', 'appeler', 'appel', 'telephone'])) return PassengerVoiceIntent.callDriver;
  if (has(['partage', 'partager', 'envoie mon trajet'])) return PassengerVoiceIntent.share;
  if (has(['ma course', 'ma commande', 'ma livraison', 'suivre', 'suivi', 'ou est'])) return PassengerVoiceIntent.myRide;
  if (has(['planifi', 'programmer', 'reserver pour', 'demain'])) return PassengerVoiceIntent.scheduled;
  if (has(['covoiturage', 'partager un trajet'])) return PassengerVoiceIntent.carpool;
  if (has(['demenag'])) return PassengerVoiceIntent.moving;
  if (has(['location', 'louer'])) return PassengerVoiceIntent.rental;
  if (has(['wallet', 'portefeuille', 'solde', 'recharger', 'recharge'])) return PassengerVoiceIntent.wallet;
  if (has(['historique', 'mes courses', 'anciennes courses'])) return PassengerVoiceIntent.history;
  if (has(['repas', 'manger', 'restaurant', 'nourriture', 'faim'])) return PassengerVoiceIntent.food;
  if (has(['colis', 'paquet', 'envoyer un'])) return PassengerVoiceIntent.parcel;
  if (has(['livraison', 'livrer', 'express', 'commission'])) return PassengerVoiceIntent.delivery;
  if (has(['taxi', 'moto', 'course', 'voiture', 'chauffeur', 'je vais', 'aller a'])) return PassengerVoiceIntent.taxi;
  return PassengerVoiceIntent.unknown;
}

/// Admin settings (super admin, /public/client-config `driverVoice`): micro opened by itself on
/// offers, and how long it listens. The driver's own switch (Notifications) comes on top.
bool kDriverVoiceAutoListen = true;
int kDriverVoiceAutoListenSeconds = 10;

void applyDriverVoiceConfig(Object? raw) {
  if (raw is! Map) return;
  final on = raw['autoListenEnabled'];
  if (on is bool) kDriverVoiceAutoListen = on;
  final s = raw['autoListenSeconds'];
  final n = s is num ? s.round() : int.tryParse(s?.toString() ?? '');
  if (n != null && n >= 5 && n <= 30) kDriverVoiceAutoListenSeconds = n;
}

/// Asks before a voice command that cannot be undone (finish, cancel, delivered…).
Future<bool> confirmVoiceAction(BuildContext context, String title, String yesLabel) async {
  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(title),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(tr('Non'))),
        FilledButton(onPressed: () => Navigator.pop(ctx, true), child: Text(yesLabel)),
      ],
    ),
  );
  return ok == true && context.mounted;
}

/// « Commande non reconnue » with the words that work on this screen.
void voiceNotUnderstood(BuildContext context, String text, String words) {
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(content: Text(trf('Commande non reconnue : « {text} ». Dites : {words}.', {'text': text, 'words': words}))),
  );
}

String _norm(String s) => s
    .toLowerCase()
    .replaceAll(RegExp('[éèêë]'), 'e')
    .replaceAll(RegExp('[àâä]'), 'a')
    .replaceAll(RegExp('[îï]'), 'i')
    .replaceAll(RegExp('[ôö]'), 'o')
    .replaceAll(RegExp('[ùûü]'), 'u')
    .replaceAll('ç', 'c')
    .replaceAll(RegExp("['’-]"), ' ');

DriverVoiceIntent parseDriverVoiceIntent(String text) {
  final t = _norm(text);
  bool has(List<String> words) => words.any(t.contains);
  // Longest / most specific phrases first (« cash non reçu » before « cash reçu »,
  // « passager déposé » before « déposé »…).
  if (has(['non recu', 'pas recu', 'pas paye', 'n a pas paye', 'cash non', 'pas de cash', 'pas d argent'])) {
    return DriverVoiceIntent.cashNotReceived;
  }
  if (has(['cash recu', 'argent recu', 'especes recu', 'il a paye', 'elle a paye', 'paye en especes', 'j ai recu'])) {
    return DriverVoiceIntent.cashReceived;
  }
  if (has(['injoignable', 'ne repond pas', 'personne ne repond', 'destinataire absent'])) return DriverVoiceIntent.unreachable;
  if (has(['annule', 'annuler', 'annulation', 'passager absent', 'no show', 'client absent', 'absent'])) return DriverVoiceIntent.cancel;
  if (has(['passager depose', 'deposer le passager', 'depose le passager', 'il est descendu', 'elle est descendue', 'passager descendu'])) {
    return DriverVoiceIntent.passengerDropped;
  }
  if (has(['passager pris', 'prendre le passager', 'passager monte', 'il est monte', 'elle est montee', 'passager a bord', 'prends le passager'])) {
    return DriverVoiceIntent.passengerPicked;
  }
  if (has(['livre', 'livraison faite', 'colis remis', 'remis au client'])) return DriverVoiceIntent.finish;
  if (has(['en route', 'colis recupere', 'j ai le colis', 'colis pris', 'je pars'])) return DriverVoiceIntent.start;
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

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/api/api_client.dart';
import '../../core/error/result.dart';
import '../../core/theme/mova_colors.dart';
import '../location/location_permission.dart';
import '../../core/i18n/i18n.dart';
import 'sos_follow_up.dart';

/// Resolve GPS for SOS (high accuracy, then optional fallback).
Future<({double? lat, double? lng})> resolveSosPosition({
  double? fallbackLat,
  double? fallbackLng,
}) async {
  try {
    if (await Geolocator.isLocationServiceEnabled()) {
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await LocationPermissionGate.request();
      }
      if (permission == LocationPermission.whileInUse ||
          permission == LocationPermission.always) {
        final pos = await Geolocator.getCurrentPosition(
          locationSettings: const LocationSettings(
            accuracy: LocationAccuracy.high,
            timeLimit: Duration(seconds: 12),
          ),
        );
        return (lat: pos.latitude, lng: pos.longitude);
      }
    }
  } catch (_) {
    /* fallback below */
  }
  if (fallbackLat != null && fallbackLng != null) {
    return (lat: fallbackLat, lng: fallbackLng);
  }
  return (lat: null, lng: null);
}

/// Confirm + send SOS (passager / chauffeur). Notifie l'équipe SENGA.
/// [skipConfirm]: the SOS button was held 3 seconds — no confirmation dialog.
Future<void> triggerSosAlert(
  WidgetRef ref,
  BuildContext context, {
  required String description,
  String? rideId,
  String? referenceType,
  String? referenceId,
  double? fallbackLat,
  double? fallbackLng,
  bool skipConfirm = false,
}) async {
  if (!skipConfirm) {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(tr('Alerte SOS')),
        content: Text(
          tr('SENGA transmettra votre position à l\'équipe support. '
          'En cas de danger immédiat, appelez aussi les secours locaux.') +
              '\n\n' +
              tr('Astuce : maintenez le bouton SOS 3 secondes pour l’envoyer sans cette fenêtre.'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(tr('Annuler'))),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(tr('Envoyer SOS'), style: TextStyle(color: MovaColors.red)),
          ),
        ],
      ),
    );
    if (confirm != true || !context.mounted) return;
  }

  final messenger = ScaffoldMessenger.of(context);
  messenger.showSnackBar(SnackBar(content: Text(tr('Envoi de l’alerte SOS…')), duration: const Duration(seconds: 3)));
  final sosPos = await resolveSosPosition(
    fallbackLat: fallbackLat,
    fallbackLng: fallbackLng,
  );
  if (!context.mounted) return;

  final api = ref.read(apiClientProvider);
  final result = await api.reportSos(
    description: description,
    rideId: rideId,
    referenceType: referenceType,
    referenceId: referenceId,
    lat: sosPos.lat,
    lng: sosPos.lng,
  );
  if (!context.mounted) return;
  switch (result) {
    case Success(:final data):
      messenger.hideCurrentSnackBar();
      final id = data['id']?.toString();
      if (id != null && id.isNotEmpty) {
        SosFollowUp.start(api, id);
        unawaited(showSosStatusSheet(context, ref));
      } else {
        messenger.showSnackBar(
          SnackBar(content: Text(tr('Alerte SOS envoyée — l\'équipe SENGA a été notifiée'))),
        );
      }
    case Failure(:final error):
      messenger.hideCurrentSnackBar();
      if (error is NetworkFailure || error is OfflineFailure) {
        await showSosOfflineFallback(context, description: description, lat: sosPos.lat, lng: sosPos.lng);
      } else {
        messenger.showSnackBar(SnackBar(content: Text(error.message)));
      }
  }
}

/// No Internet: send the SOS by SMS (number set by SENGA) or call emergency services.
Future<void> showSosOfflineFallback(
  BuildContext context, {
  required String description,
  double? lat,
  double? lng,
}) async {
  await SosConfigCache.load();
  if (!context.mounted) return;
  final maps = lat != null && lng != null ? ' https://maps.google.com/?q=$lat,$lng' : '';
  final smsBody = 'SENGA SOS — $description.$maps';
  final smsNumber = SosConfigCache.smsNumber;
  await showDialog<void>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(tr('Pas de connexion Internet')),
      content: Text(
        tr('Votre alerte n’a pas pu partir. Envoyez-la par SMS ou appelez les secours.'),
      ),
      actions: [
        if (smsNumber.isNotEmpty)
          FilledButton.icon(
            key: const Key('sosSmsFallback'),
            style: FilledButton.styleFrom(backgroundColor: MovaColors.red),
            onPressed: () async {
              Navigator.pop(ctx);
              await launchUrl(Uri(scheme: 'sms', path: smsNumber, queryParameters: {'body': smsBody}));
            },
            icon: const Icon(Icons.sms_outlined),
            label: Text(tr('Envoyer par SMS')),
          ),
        for (final n in SosConfigCache.emergencyNumbers)
          TextButton.icon(
            onPressed: () async {
              Navigator.pop(ctx);
              await launchUrl(Uri(scheme: 'tel', path: n.phone));
            },
            icon: const Icon(Icons.call, color: MovaColors.red),
            label: Text(trf('Appeler {label}', {'label': n.label})),
          ),
        TextButton(onPressed: () => Navigator.pop(ctx), child: Text(tr('Fermer'))),
      ],
    ),
  );
}

/// After a SOS: what is happening (waiting, taken in charge, closed) and quick actions.
Future<void> showSosStatusSheet(BuildContext context, WidgetRef ref) async {
  final api = ref.read(apiClientProvider);
  await SosConfigCache.load();
  if (!context.mounted) return;
  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    builder: (ctx) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
        child: ValueListenableBuilder<Map<String, dynamic>?>(
          valueListenable: SosFollowUp.status,
          builder: (context, status, _) {
            final open = (status?['status']?.toString() ?? 'OPEN') == 'OPEN';
            final by = status?['acknowledgedByName']?.toString();
            final taken = status?['acknowledgedAt'] != null;
            final (icon, color, title, body) = !open
                ? (Icons.check_circle, MovaColors.green, tr('Alerte clôturée'), tr('L’équipe SENGA a traité votre alerte.'))
                : taken
                    ? (
                        Icons.support_agent,
                        MovaColors.green,
                        tr('Alerte prise en charge'),
                        trf('{name} de l’équipe SENGA s’occupe de vous. Restez joignable.', {'name': by ?? tr('Un agent')}),
                      )
                    : (
                        Icons.hourglass_top,
                        MovaColors.orange,
                        tr('Alerte envoyée'),
                        tr('En attente d’un agent SENGA… L’équipe est prévenue.'),
                      );
            return Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Icon(icon, color: color, size: 32),
                    const SizedBox(width: 12),
                    Expanded(child: Text(title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold))),
                  ],
                ),
                const SizedBox(height: 8),
                Text(body),
                if (open && SosFollowUp.sharing) ...[
                  const SizedBox(height: 8),
                  Text(
                    tr('Votre position est partagée avec l’équipe pendant 30 minutes.'),
                    style: const TextStyle(color: MovaColors.textSecondary, fontSize: 13),
                  ),
                ],
                const SizedBox(height: 16),
                for (final n in SosConfigCache.emergencyNumbers.take(2))
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: OutlinedButton.icon(
                      onPressed: () => launchUrl(Uri(scheme: 'tel', path: n.phone)),
                      icon: const Icon(Icons.call, color: MovaColors.red),
                      label: Text(trf('Appeler {label}', {'label': n.label})),
                    ),
                  ),
                if (open && SosFollowUp.sharing)
                  TextButton(
                    onPressed: () {
                      SosFollowUp.stopSharing();
                      SosFollowUp.status.value = {...?status};
                    },
                    child: Text(tr('Arrêter le partage de position')),
                  ),
                TextButton(
                  onPressed: () {
                    unawaited(SosFollowUp.refreshStatus(api));
                    Navigator.pop(ctx);
                  },
                  child: Text(tr('Fermer')),
                ),
              ],
            );
          },
        ),
      ),
    ),
  );
}

/// Non-urgent report about a past trip or order (lost item, behaviour, vehicle, price…).
Future<void> showReportProblemDialog(
  BuildContext context,
  WidgetRef ref, {
  required String referenceType,
  required String referenceId,
  String? rideId,
}) async {
  const categories = <({String key, String label, String type})>[
    (key: 'LOST', label: 'Objet oublié', type: 'OTHER'),
    (key: 'BEHAVIOUR', label: 'Comportement', type: 'HARASSMENT'),
    (key: 'VEHICLE', label: 'Véhicule ou conduite', type: 'OTHER'),
    (key: 'PRICE', label: 'Prix ou paiement', type: 'FRAUD'),
    (key: 'ACCIDENT', label: 'Accident', type: 'ACCIDENT'),
    (key: 'OTHER', label: 'Autre', type: 'OTHER'),
  ];
  var selected = categories.first;
  final controller = TextEditingController();
  final sent = await showDialog<bool>(
    context: context,
    builder: (ctx) => StatefulBuilder(
      builder: (ctx, setState) => AlertDialog(
        title: Text(tr('Signaler un problème')),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              DropdownButtonFormField<String>(
                key: const Key('reportCategory'),
                value: selected.key,
                isExpanded: true,
                decoration: InputDecoration(labelText: tr('Catégorie')),
                items: [
                  for (final c in categories) DropdownMenuItem(value: c.key, child: Text(tr(c.label))),
                ],
                onChanged: (v) => setState(() => selected = categories.firstWhere((c) => c.key == v)),
              ),
              const SizedBox(height: 12),
              TextField(
                key: const Key('reportDescription'),
                controller: controller,
                maxLines: 4,
                maxLength: 1000,
                decoration: InputDecoration(
                  labelText: tr('Que s’est-il passé ?'),
                  hintText: tr('Décrivez le problème en quelques mots.'),
                ),
              ),
              Text(
                tr('Pour une urgence, utilisez plutôt le bouton SOS.'),
                style: const TextStyle(fontSize: 12, color: MovaColors.textSecondary),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(tr('Annuler'))),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(tr('Envoyer')),
          ),
        ],
      ),
    ),
  );
  final text = controller.text.trim();
  controller.dispose();
  if (sent != true || !context.mounted) return;
  if (text.length < 5) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(tr('Décrivez le problème en quelques mots.'))));
    return;
  }
  final api = ref.read(apiClientProvider);
  final result = await api.post('/incidents', {
    'type': selected.type,
    'description': '[${selected.label}] $text',
    'referenceType': referenceType,
    'referenceId': referenceId,
    if (rideId != null) 'rideId': rideId,
  });
  if (!context.mounted) return;
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(
      content: Text(
        result is Success
            ? tr('Signalement envoyé — l’équipe SENGA vous répondra.')
            : (result as Failure).error.message,
      ),
    ),
  );
}

/// SOS button: tap = confirmation dialog, hold 3 s = send at once.
class SosHoldButton extends StatefulWidget {
  const SosHoldButton({super.key, required this.onTap, required this.onHold, this.icon = Icons.emergency_share});

  final VoidCallback onTap;
  final VoidCallback onHold;
  final IconData icon;

  @override
  State<SosHoldButton> createState() => _SosHoldButtonState();
}

class _SosHoldButtonState extends State<SosHoldButton> with SingleTickerProviderStateMixin {
  static const _holdDuration = Duration(seconds: 3);
  static const _tapMax = Duration(milliseconds: 450);

  /// Ring shown while holding (visual only: the timer decides).
  late final AnimationController _hold = AnimationController(vsync: this, duration: _holdDuration);
  Timer? _holdTimer;
  Timer? _tapTimer;
  bool _fired = false;
  bool _tapWindowOpen = false;

  @override
  void dispose() {
    _holdTimer?.cancel();
    _tapTimer?.cancel();
    _hold.dispose();
    super.dispose();
  }

  void _down(PointerDownEvent _) {
    _fired = false;
    _tapWindowOpen = true;
    _tapTimer?.cancel();
    _tapTimer = Timer(_tapMax, () => _tapWindowOpen = false);
    _hold.forward(from: 0);
    _holdTimer?.cancel();
    _holdTimer = Timer(_holdDuration, () {
      _fired = true;
      _hold.reset();
      widget.onHold();
    });
  }

  void _cancel() {
    _holdTimer?.cancel();
    _tapTimer?.cancel();
    _hold.reset();
  }

  void _up(PointerUpEvent _) {
    final quickTap = !_fired && _tapWindowOpen;
    _cancel();
    if (quickTap) widget.onTap();
  }

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tr('SOS — maintenez 3 s pour envoyer'),
      child: Listener(
        onPointerDown: _down,
        onPointerUp: _up,
        onPointerCancel: (_) => _cancel(),
        child: SizedBox(
          width: 48,
          height: 48,
          child: Stack(
            alignment: Alignment.center,
            children: [
              AnimatedBuilder(
                animation: _hold,
                builder: (_, __) => _hold.value == 0
                    ? const SizedBox.shrink()
                    : SizedBox(
                        width: 36,
                        height: 36,
                        child: CircularProgressIndicator(value: _hold.value, strokeWidth: 3, color: MovaColors.red),
                      ),
              ),
              Icon(widget.icon, color: MovaColors.red),
            ],
          ),
        ),
      ),
    );
  }
}

/// Red SOS icon for app bars (driver / passenger active jobs).
/// [onPressed] gets `true` when the button was held 3 seconds (send without confirmation).
Widget sosAppBarButton({
  required void Function([bool skipConfirm]) onPressed,
  IconData icon = Icons.emergency_share,
}) {
  return SosHoldButton(icon: icon, onTap: () => onPressed(), onHold: () => onPressed(true));
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_client.dart';
import '../../core/billing/service_price_display.dart';
import '../../core/error/result.dart';
import '../../core/geo/maps_launcher.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import '../history/history_detail_dialog.dart';
import '../../core/safety/sos_helper.dart';
import 'widgets/driver_cash_received_dialog.dart';
import '../../core/i18n/i18n.dart';
import '../../core/voice/voice_command_button.dart';

class DriverMovingMissionScreen extends ConsumerStatefulWidget {
  const DriverMovingMissionScreen({
    super.key,
    required this.movingId,
    this.initialMission,
  });

  final String movingId;
  final Map<String, dynamic>? initialMission;

  @override
  ConsumerState<DriverMovingMissionScreen> createState() => _DriverMovingMissionScreenState();
}

class _DriverMovingMissionScreenState extends ConsumerState<DriverMovingMissionScreen> {
  Map<String, dynamic>? _moving;
  bool _loading = true;
  bool _saving = false;
  String? _error;

  String get _status => _moving?['status']?.toString() ?? widget.initialMission?['status']?.toString() ?? 'ASSIGNED';

  @override
  void initState() {
    super.initState();
    if (widget.initialMission != null) {
      _moving = Map<String, dynamic>.from(widget.initialMission!);
    }
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = _moving == null;
      _error = null;
    });
    final result = await ref.read(apiClientProvider).get('/moving/${widget.movingId}');
    if (!mounted) return;
    setState(() {
      _loading = false;
      switch (result) {
        case Success(:final data):
          _moving = data['moving'] as Map<String, dynamic>? ?? data;
          if (_moving != null && _moving!['type'] == null) {
            _moving = {..._moving!, 'type': 'MOVING'};
          }
          _error = null;
        case Failure(:final error):
          _error = error.message;
      }
    });
  }

  /// On site, before loading: the real volume. More than the customer declared → new price
  /// (the customer gets an SMS and can still cancel before the start).
  Future<void> _reportActualVolume() async {
    final controller = TextEditingController(text: _moving?['volumeM3']?.toString() ?? '');
    final value = await showDialog<double>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(tr('Volume réel constaté')),
        content: TextField(
          controller: controller,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: InputDecoration(labelText: tr('Volume en m³'), suffixText: 'm³'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: Text(tr('Annuler'))),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, double.tryParse(controller.text.replaceAll(',', '.'))),
            child: Text(tr('Valider')),
          ),
        ],
      ),
    );
    if (value == null || !mounted) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    final result = await ref.read(apiClientProvider).post(
      '/moving/${widget.movingId}/actual-volume',
      {'volumeM3': value},
    );
    if (!mounted) return;
    setState(() => _saving = false);
    switch (result) {
      case Success(:final data):
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              data['adjusted'] == true
                  ? tr('Prix ajusté au volume réel — le client a été prévenu par SMS.')
                  : tr('Volume conforme à la déclaration du client.'),
            ),
          ),
        );
        await _load();
      case Failure(:final error):
        setState(() => _error = error.message);
    }
  }

  Future<void> _advanceStatus(String nextStatus, String successMessage) async {
    setState(() {
      _saving = true;
      _error = null;
    });
    final result = await ref.read(apiClientProvider).patch(
      '/moving/${widget.movingId}/driver-status',
      {'status': nextStatus},
    );
    if (!mounted) return;
    setState(() => _saving = false);
    switch (result) {
      case Success(:final data):
        setState(() {
          final moving = data['moving'] as Map<String, dynamic>? ?? data;
          _moving = {
            ...?_moving,
            ...moving,
            'type': 'MOVING',
          };
        });
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(successMessage)));
        if (nextStatus != 'COMPLETED') {
          await _load();
        }
      case Failure(:final error):
        setState(() => _error = error.message);
    }
  }

  Future<void> _confirmCash() async {
    final api = ref.read(apiClientProvider);
    final total = (_moving?['finalPriceCdf'] ??
            _moving?['estimatedPriceCdf'] ??
            _moving?['passengerTotalCdf'] ??
            _moving?['amountCdf']) as num?;
    final net = (_moving?['driverNetCdf'] ?? _moving?['driverEarningsCdf']) as num?;
    final dialogResult = await DriverCashReceivedDialog.show(
      context,
      passengerTotalCdf: total?.round(),
      driverNetCdf: net?.round(),
      confirm: () async {
        final result = await api.confirmCashService('MOVING', widget.movingId);
        return switch (result) {
          Success() => (ok: true, message: null),
          Failure(:final error) => (ok: false, message: error.message),
        };
      },
      dispute: () async {
        final result = await api.disputeCashService(
          'MOVING',
          widget.movingId,
          reason: 'CASH_NOT_RECEIVED',
        );
        return switch (result) {
          Success(:final data) => (
              ok: true,
              message: data['message']?.toString() ?? tr('Litige enregistré'),
            ),
          Failure(:final error) => (ok: false, message: error.message),
        };
      },
    );
    if (!mounted) return;
    if (dialogResult == CashDialogResult.disputed) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(tr('Litige enregistré — le client a été notifié'))),
      );
      return;
    }
    if (dialogResult != CashDialogResult.confirmed) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(tr('Paiement espèces confirmé'))),
    );
    Navigator.pop(context, true);
  }

  Future<void> _onMissionVoice(String text) async {
    final intent = parseDriverVoiceIntent(text);
    switch (intent) {
      case DriverVoiceIntent.start when _status == 'ASSIGNED':
        if (await confirmVoiceAction(context, tr('Démarrer le déménagement ?'), tr('Oui, démarrer'))) {
          await _advanceStatus('IN_PROGRESS', 'Déménagement démarré');
        }
      case DriverVoiceIntent.finish when _status == 'IN_PROGRESS':
        if (await confirmVoiceAction(context, tr('Terminer le déménagement ?'), tr('Oui, terminer'))) {
          await _advanceStatus('COMPLETED', 'Déménagement terminé');
        }
      case DriverVoiceIntent.cashReceived || DriverVoiceIntent.cashNotReceived when _status == 'COMPLETED':
        await _confirmCash();
      case DriverVoiceIntent.navigate:
        await _openMaps(toPickup: _status == 'ASSIGNED');
      default:
        voiceNotUnderstood(context, text, tr('démarrer, terminer, itinéraire, cash reçu'));
    }
  }

  Future<void> _openMaps({required bool toPickup}) async {
    final lat = _moving?[toPickup ? 'pickupLat' : 'dropoffLat'] as num?;
    final lng = _moving?[toPickup ? 'pickupLng' : 'dropoffLng'] as num?;
    if (lat == null || lng == null) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(tr('Coordonnées GPS indisponibles pour la navigation'))),
        );
      }
      return;
    }
    final opened = await MapsLauncher.openDirections(
      destinationLat: lat.toDouble(),
      destinationLng: lng.toDouble(),
    );
    if (!opened && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(tr('Impossible d\'ouvrir Google Maps'))),
      );
    }
  }

  List<Map<String, dynamic>> get _timeline {
    final raw = _moving?['timeline'] as List?;
    if (raw != null && raw.isNotEmpty) {
      return raw.cast<Map<String, dynamic>>();
    }
    return movingTimelineSteps(_status);
  }

  @override
  Widget build(BuildContext context) {
    if (_loading && _moving == null) {
      return MovaScreen(
        title: tr('Mission déménagement'),
        scrollable: false,
        child: Center(child: CircularProgressIndicator(color: MovaColors.violet)),
      );
    }

    final pickup = _moving?['pickupAddress']?.toString() ?? widget.initialMission?['pickupAddress']?.toString() ?? '—';
    final dropoff = _moving?['dropoffAddress']?.toString() ?? widget.initialMission?['dropoffAddress']?.toString() ?? '—';
    final volume = _moving?['volumeM3'] ?? widget.initialMission?['volumeM3'];

    return MovaScreen(
      title: tr('Mission déménagement'),
      scrollable: false,
      actions: [
        VoiceCommandButton(
          onText: _onMissionVoice,
          hint: tr('Dites : démarrer, terminer, itinéraire, cash reçu'),
        ),
        sosAppBarButton(
          onPressed: ([bool skip = false]) => triggerSosAlert(
            skipConfirm: skip,
            ref,
            context,
            description: 'SOS chauffeur — déménagement ${widget.movingId}',
            referenceType: 'MOVING',
            referenceId: widget.movingId,
          ),
        ),
      ],
      child: MovaFlexScroll(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (_error != null) ...[
              MovaCard(
                child: Text(_error!, style: const TextStyle(color: MovaColors.error)),
              ),
              const SizedBox(height: 12),
            ],
            MovaCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    _statusLabel(_status),
                    style: const TextStyle(
                      fontWeight: FontWeight.bold,
                      color: MovaColors.violet,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(tr('Départ'), style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                  Text(pickup, style: const TextStyle(fontWeight: FontWeight.w600)),
                  const SizedBox(height: 8),
                  Text(tr('Arrivée'), style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                  Text(dropoff, style: const TextStyle(fontWeight: FontWeight.w600)),
                  if (volume != null) ...[
                    const SizedBox(height: 8),
                    Text(trf('Volume : {volume} m³', {'volume': volume})),
                  ],
                ],
              ),
            ),
            if (_moving != null) ...[
              const SizedBox(height: 12),
              ServicePriceDisplay.driverMissionCard({..._moving!, 'type': 'MOVING'}),
            ],
            const SizedBox(height: 12),
            MovaCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(tr('Suivi'), style: TextStyle(fontWeight: FontWeight.w600)),
                  const SizedBox(height: 8),
                  ..._timeline.map((step) {
                    final done = step['done'] == true;
                    return Padding(
                      padding: const EdgeInsets.symmetric(vertical: 4),
                      child: Row(
                        children: [
                          Icon(
                            done ? Icons.check_circle : Icons.radio_button_unchecked,
                            size: 18,
                            color: done ? MovaColors.green : MovaColors.textSecondary,
                          ),
                          const SizedBox(width: 8),
                          Expanded(child: Text(tr(step['label']?.toString() ?? ''))),
                        ],
                      ),
                    );
                  }),
                ],
              ),
            ),
            const SizedBox(height: 12),
            if (_status == 'ASSIGNED' || _status == 'IN_PROGRESS') ...[
              MovaButton(
                label: _status == 'ASSIGNED' ? tr('Itinéraire départ') : tr('Itinéraire arrivée'),
                icon: Icons.map,
                onPressed: _saving ? null : () => _openMaps(toPickup: _status == 'ASSIGNED'),
              ),
              const SizedBox(height: 8),
            ],
            if (_status == 'ASSIGNED') ...[
              MovaButton(
                key: const Key('movingActualVolume'),
                label: tr('Volume réel constaté'),
                icon: Icons.straighten,
                isSecondary: true,
                onPressed: _saving ? null : _reportActualVolume,
              ),
              const SizedBox(height: 8),
            ],
            if (_status == 'ASSIGNED')
              MovaButton(
                label: tr('Démarrer le déménagement'),
                icon: Icons.play_arrow,
                isLoading: _saving,
                onPressed: _saving
                    ? null
                    : () => _advanceStatus('IN_PROGRESS', 'Déménagement démarré'),
              ),
            if (_status == 'IN_PROGRESS')
              MovaButton(
                label: tr('Terminer le déménagement'),
                icon: Icons.check,
                isLoading: _saving,
                onPressed: _saving
                    ? null
                    : () => _advanceStatus('COMPLETED', 'Déménagement terminé'),
              ),
            if (_status == 'COMPLETED') ...[
              const SizedBox(height: 8),
              MovaButton(
                label: tr('Cash reçu'),
                isSecondary: true,
                icon: Icons.payments_outlined,
                onPressed: _saving ? null : _confirmCash,
              ),
            ],
          ],
        ),
      ),
    );
  }

  String _statusLabel(String status) {
    return switch (status.toUpperCase()) {
      'ASSIGNED' => tr('Assigné — prêt à démarrer'),
      'IN_PROGRESS' => tr('Déménagement en cours'),
      'COMPLETED' => tr('Terminé'),
      _ => status,
    };
  }
}

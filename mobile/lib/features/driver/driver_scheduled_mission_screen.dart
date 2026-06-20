import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_client.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/geo/maps_launcher.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';

List<Map<String, dynamic>> scheduledTimelineSteps(String? status) {
  const steps = [
    ('SCHEDULED', 'Réservation enregistrée'),
    ('CONFIRMED', 'Chauffeur confirmé'),
    ('IN_PROGRESS', 'Course en cours'),
    ('COMPLETED', 'Course terminée'),
  ];
  if (status == 'CANCELLED') {
    return [{'label': 'Course annulée', 'done': true}];
  }
  final order = steps.map((s) => s.$1).toList();
  final idx = order.indexOf(status ?? 'SCHEDULED');
  return steps
      .asMap()
      .entries
      .map((e) => {'label': e.value.$2, 'done': idx >= 0 && e.key <= idx})
      .toList();
}

class DriverScheduledMissionScreen extends ConsumerStatefulWidget {
  const DriverScheduledMissionScreen({
    super.key,
    required this.rideId,
    this.initialMission,
  });

  final String rideId;
  final Map<String, dynamic>? initialMission;

  @override
  ConsumerState<DriverScheduledMissionScreen> createState() => _DriverScheduledMissionScreenState();
}

class _DriverScheduledMissionScreenState extends ConsumerState<DriverScheduledMissionScreen> {
  Map<String, dynamic>? _ride;
  bool _loading = true;
  bool _saving = false;
  String? _error;

  String get _status => _ride?['status']?.toString() ?? widget.initialMission?['status']?.toString() ?? 'CONFIRMED';

  @override
  void initState() {
    super.initState();
    if (widget.initialMission != null) {
      _ride = Map<String, dynamic>.from(widget.initialMission!);
    }
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = _ride == null;
      _error = null;
    });
    final result = await ref.read(apiClientProvider).get('/rides/scheduled/${widget.rideId}');
    if (!mounted) return;
    setState(() {
      _loading = false;
      switch (result) {
        case Success(:final data):
          _ride = data['scheduledRide'] as Map<String, dynamic>? ?? data;
          _error = null;
        case Failure(:final error):
          _error = error.message;
      }
    });
  }

  Future<void> _advanceStatus(String nextStatus, String successMessage) async {
    setState(() {
      _saving = true;
      _error = null;
    });
    final result = await ref.read(apiClientProvider).patch(
      '/rides/scheduled/${widget.rideId}/driver-status',
      {'status': nextStatus},
    );
    if (!mounted) return;
    setState(() => _saving = false);
    switch (result) {
      case Success(:final data):
        setState(() => _ride = data['scheduledRide'] as Map<String, dynamic>? ?? _ride);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(successMessage)));
        if (nextStatus == 'COMPLETED') {
          Navigator.pop(context, true);
        } else {
          await _load();
        }
      case Failure(:final error):
        setState(() => _error = error.message);
    }
  }

  Future<void> _openMaps({required bool toPickup}) async {
    final lat = _ride?[toPickup ? 'pickupLat' : 'dropoffLat'] as num?;
    final lng = _ride?[toPickup ? 'pickupLng' : 'dropoffLng'] as num?;
    if (lat == null || lng == null) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Coordonnées GPS indisponibles pour la navigation')),
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
        const SnackBar(content: Text('Impossible d\'ouvrir Google Maps')),
      );
    }
  }

  String? _formatScheduledAt() {
    final raw = _ride?['scheduledAt'] ?? widget.initialMission?['scheduledAt'];
    if (raw == null) return null;
    final dt = DateTime.tryParse(raw.toString())?.toLocal();
    if (dt == null) return raw.toString();
    return '${dt.day.toString().padLeft(2, '0')}/${dt.month.toString().padLeft(2, '0')} '
        '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
  }

  bool get _canStart => _status == 'CONFIRMED' || _status == 'SCHEDULED';

  @override
  Widget build(BuildContext context) {
    if (_loading && _ride == null) {
      return const MovaScreen(
        title: 'Mission planifiée',
        scrollable: false,
        child: Center(child: CircularProgressIndicator(color: MovaColors.violet)),
      );
    }

    final pickup = _ride?['pickupAddress']?.toString() ?? widget.initialMission?['pickupAddress']?.toString() ?? '—';
    final dropoff = _ride?['dropoffAddress']?.toString() ?? widget.initialMission?['dropoffAddress']?.toString() ?? '—';
    final price = _ride?['priceCdf'] ?? _ride?['estimatedPriceCdf'] ?? widget.initialMission?['priceCdf'];
    final vehicleType = _ride?['vehicleType'] ?? widget.initialMission?['vehicleType'];
    final scheduledAt = _formatScheduledAt();

    return MovaScreen(
      title: 'Mission planifiée',
      scrollable: false,
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
                    style: const TextStyle(fontWeight: FontWeight.bold, color: MovaColors.violet),
                  ),
                  if (scheduledAt != null) ...[
                    const SizedBox(height: 8),
                    Text('Date prévue : $scheduledAt'),
                  ],
                  const SizedBox(height: 12),
                  Text('Départ', style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                  Text(pickup, style: const TextStyle(fontWeight: FontWeight.w600)),
                  const SizedBox(height: 8),
                  Text('Arrivée', style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                  Text(dropoff, style: const TextStyle(fontWeight: FontWeight.w600)),
                  if (vehicleType != null) ...[
                    const SizedBox(height: 8),
                    Text('Véhicule : $vehicleType'),
                  ],
                  if (price != null) ...[
                    const SizedBox(height: 8),
                    Text(
                      MarketConfig.formatCdf(price is int ? price : int.tryParse(price.toString()) ?? 0),
                      style: const TextStyle(fontWeight: FontWeight.bold, color: MovaColors.green),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 12),
            MovaCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Suivi', style: TextStyle(fontWeight: FontWeight.w600)),
                  const SizedBox(height: 8),
                  ...scheduledTimelineSteps(_status).map((step) {
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
                          Expanded(child: Text(step['label']?.toString() ?? '')),
                        ],
                      ),
                    );
                  }),
                ],
              ),
            ),
            const SizedBox(height: 12),
            if (_canStart || _status == 'IN_PROGRESS') ...[
              MovaButton(
                label: _status == 'IN_PROGRESS' ? 'Itinéraire arrivée' : 'Itinéraire départ',
                icon: Icons.map,
                onPressed: _saving ? null : () => _openMaps(toPickup: _status != 'IN_PROGRESS'),
              ),
              const SizedBox(height: 8),
            ],
            if (_canStart)
              MovaButton(
                label: 'Démarrer la course',
                icon: Icons.play_arrow,
                isLoading: _saving,
                onPressed: _saving
                    ? null
                    : () => _advanceStatus('IN_PROGRESS', 'Course démarrée'),
              ),
            if (_status == 'IN_PROGRESS')
              MovaButton(
                label: 'Terminer la course',
                icon: Icons.check,
                isLoading: _saving,
                onPressed: _saving
                    ? null
                    : () => _advanceStatus('COMPLETED', 'Course terminée'),
              ),
          ],
        ),
      ),
    );
  }

  String _statusLabel(String status) {
    return switch (status.toUpperCase()) {
      'SCHEDULED' => 'Planifiée — en attente',
      'CONFIRMED' => 'Confirmée — prêt à démarrer',
      'IN_PROGRESS' => 'Course en cours',
      'COMPLETED' => 'Terminée',
      _ => status,
    };
  }
}

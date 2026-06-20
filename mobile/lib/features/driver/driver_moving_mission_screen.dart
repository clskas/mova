import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_client.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/geo/maps_launcher.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import '../history/history_detail_dialog.dart';

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
      '/moving/${widget.movingId}/driver-status',
      {'status': nextStatus},
    );
    if (!mounted) return;
    setState(() => _saving = false);
    switch (result) {
      case Success(:final data):
        setState(() => _moving = data['moving'] as Map<String, dynamic>? ?? _moving);
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
    final lat = _moving?[toPickup ? 'pickupLat' : 'dropoffLat'] as num?;
    final lng = _moving?[toPickup ? 'pickupLng' : 'dropoffLng'] as num?;
    if (lat != null && lng != null) {
      await MapsLauncher.openDirections(
        destinationLat: lat.toDouble(),
        destinationLng: lng.toDouble(),
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
    final pickup = _moving?['pickupAddress']?.toString() ?? widget.initialMission?['pickupAddress']?.toString() ?? '—';
    final dropoff = _moving?['dropoffAddress']?.toString() ?? widget.initialMission?['dropoffAddress']?.toString() ?? '—';
    final volume = _moving?['volumeM3'] ?? widget.initialMission?['volumeM3'];
    final price = _moving?['priceCdf'] ?? _moving?['estimatedPriceCdf'] ?? widget.initialMission?['priceCdf'];

    return MovaScreen(
      title: 'Mission déménagement',
      child: _loading && _moving == null
          ? const Center(child: CircularProgressIndicator(color: MovaColors.violet))
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.all(16),
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
                        Text('Départ', style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                        Text(pickup, style: const TextStyle(fontWeight: FontWeight.w600)),
                        const SizedBox(height: 8),
                        Text('Arrivée', style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                        Text(dropoff, style: const TextStyle(fontWeight: FontWeight.w600)),
                        if (volume != null) ...[
                          const SizedBox(height: 8),
                          Text('Volume : $volume m³'),
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
                                Expanded(child: Text(step['label']?.toString() ?? '')),
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
                      label: _status == 'ASSIGNED' ? 'Itinéraire départ' : 'Itinéraire arrivée',
                      icon: Icons.map,
                      onPressed: _saving ? null : () => _openMaps(toPickup: _status == 'ASSIGNED'),
                    ),
                    const SizedBox(height: 8),
                  ],
                  if (_status == 'ASSIGNED')
                    MovaButton(
                      label: 'Démarrer le déménagement',
                      icon: Icons.play_arrow,
                      isLoading: _saving,
                      onPressed: _saving
                          ? null
                          : () => _advanceStatus('IN_PROGRESS', 'Déménagement démarré'),
                    ),
                  if (_status == 'IN_PROGRESS')
                    MovaButton(
                      label: 'Terminer le déménagement',
                      icon: Icons.check,
                      isLoading: _saving,
                      onPressed: _saving
                          ? null
                          : () => _advanceStatus('COMPLETED', 'Déménagement terminé'),
                    ),
                ],
              ),
            ),
    );
  }

  String _statusLabel(String status) {
    return switch (status.toUpperCase()) {
      'ASSIGNED' => 'Assigné — prêt à démarrer',
      'IN_PROGRESS' => 'Déménagement en cours',
      'COMPLETED' => 'Terminé',
      _ => status,
    };
  }
}

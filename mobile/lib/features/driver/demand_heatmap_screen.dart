import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:latlong2/latlong.dart';

import '../../core/api/api_client.dart';
import '../../core/config/test_runtime_config.dart';
import '../../core/error/result.dart';
import '../../core/i18n/i18n.dart';
import '../../core/location/location_service.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';

/// Where clients asked for a ride or delivery recently (orange) and who still waits (red).
class DemandHeatmapScreen extends ConsumerStatefulWidget {
  const DemandHeatmapScreen({super.key});

  @override
  ConsumerState<DemandHeatmapScreen> createState() => _DemandHeatmapScreenState();
}

class _DemandHeatmapScreenState extends ConsumerState<DemandHeatmapScreen> {
  LatLng? _me;
  List<Map<String, dynamic>> _cells = const [];
  int _window = 30;
  String? _error;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final loc = await LocationService.getCurrentLocation();
    if (!mounted) return;
    if (loc == null) {
      setState(() {
        _loading = false;
        _error = tr('Position indisponible : activez la localisation.');
      });
      return;
    }
    final p = loc.position;
    final result = await ref.read(apiClientProvider).get('/rides/demand-heatmap?lat=${p.latitude}&lng=${p.longitude}', skipCache: true);
    if (!mounted) return;
    setState(() {
      _loading = false;
      _me = p;
      switch (result) {
        case Success(:final data):
          final m = data is Map ? Map<String, dynamic>.from(data) : <String, dynamic>{};
          if (m['enabled'] != true) {
            _error = tr('La carte de la demande n’est pas activée.');
          } else {
            _error = null;
            _window = (m['windowMinutes'] as num?)?.toInt() ?? 30;
            _cells = (m['cells'] as List? ?? const []).whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
          }
        case Failure(:final error):
          _error = error.message;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final me = _me;
    final maxCount = _cells.fold<int>(1, (m, c) => ((c['count'] as num?)?.toInt() ?? 0) > m ? (c['count'] as num).toInt() : m);
    return MovaScreen(
      title: tr('Zones de demande'),
      scrollable: false,
      padding: EdgeInsets.zero,
      actions: [IconButton(onPressed: _loading ? null : _load, icon: const Icon(Icons.refresh), tooltip: tr('Actualiser'))],
      child: _loading
          ? const Center(child: CircularProgressIndicator())
          : (_error != null || me == null)
              ? Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(_error ?? '', textAlign: TextAlign.center)))
              : Column(
                  children: [
                    Padding(
                      padding: const EdgeInsets.all(12),
                      child: Text(
                        trf('Demandes des {m} dernières minutes autour de vous. Rouge : clients qui attendent encore un chauffeur.', {'m': _window}),
                        style: const TextStyle(color: MovaColors.textSecondary),
                      ),
                    ),
                    Expanded(
                      child: FlutterMap(
                        options: MapOptions(initialCenter: me, initialZoom: 13),
                        children: [
                          if (movaMapTilesEnabled)
                            TileLayer(
                              urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                              userAgentPackageName: 'com.mova.driver',
                            ),
                          CircleLayer(
                            circles: [
                              for (final c in _cells)
                                CircleMarker(
                                  point: LatLng((c['lat'] as num).toDouble(), (c['lng'] as num).toDouble()),
                                  radius: 250 + 450 * (((c['count'] as num?)?.toDouble() ?? 1) / maxCount),
                                  useRadiusInMeter: true,
                                  color: ((c['waiting'] as num?) ?? 0) > 0
                                      ? Colors.red.withValues(alpha: 0.35)
                                      : MovaColors.orange.withValues(alpha: 0.28),
                                  borderColor: Colors.white,
                                  borderStrokeWidth: 1,
                                ),
                            ],
                          ),
                          MarkerLayer(
                            markers: [
                              Marker(point: me, width: 28, height: 28, child: const Icon(Icons.my_location, color: MovaColors.violet)),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
    );
  }
}

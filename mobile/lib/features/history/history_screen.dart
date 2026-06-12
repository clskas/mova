import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_client.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';

class HistoryScreen extends ConsumerStatefulWidget {
  const HistoryScreen({super.key});

  @override
  ConsumerState<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends ConsumerState<HistoryScreen> {
  List<dynamic> _rides = [];
  bool _loading = true;
  bool _cached = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final api = ref.read(apiClientProvider);
    await api.loadToken();
    final result = await api.get('/rides/history?role=passenger');
    setState(() {
      _loading = false;
      if (result case Success(:final data)) {
        _rides = data['data'] as List? ?? data['rides'] as List? ?? [];
        _cached = data['cached'] == true;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return MovaScreen(
      title: 'Historique',
      child: _loading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (_cached)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Text(
                      'Données en cache (hors-ligne)',
                      style: TextStyle(color: MovaColors.orange.withValues(alpha: 0.9)),
                      textAlign: TextAlign.center,
                    ),
                  ),
                if (_rides.isEmpty)
                  const Center(child: Text('Aucune course'))
                else
                  ..._rides.map((r) {
                    final ride = r as Map<String, dynamic>;
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: MovaCard(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              '${ride['pickupAddress'] ?? 'Départ'} → ${ride['dropoffAddress'] ?? 'Arrivée'}',
                              style: const TextStyle(fontWeight: FontWeight.w600),
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                            const SizedBox(height: 4),
                            Text(
                              MarketConfig.formatCdf(ride['priceCdf'] as int? ?? 0),
                              style: const TextStyle(color: MovaColors.violet),
                            ),
                            Text(
                              ride['status']?.toString() ?? '',
                              style: const TextStyle(color: MovaColors.textSecondary, fontSize: 13),
                            ),
                          ],
                        ),
                      ),
                    );
                  }),
              ],
            ),
    );
  }
}

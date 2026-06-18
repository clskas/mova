import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_client.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';

class DriverRideHistoryScreen extends ConsumerStatefulWidget {
  const DriverRideHistoryScreen({super.key});

  @override
  ConsumerState<DriverRideHistoryScreen> createState() => _DriverRideHistoryScreenState();
}

class _DriverRideHistoryScreenState extends ConsumerState<DriverRideHistoryScreen> {
  List<Map<String, dynamic>> _rides = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final api = ref.read(apiClientProvider);
    final result = await api.get('/rides/history?role=driver&limit=50');
    if (!mounted) return;
    switch (result) {
      case Success(:final data):
        final all = (data['data'] as List? ?? []).cast<Map<String, dynamic>>();
        setState(() {
          _rides = all.where((r) {
            final s = r['status']?.toString() ?? '';
            return s == 'COMPLETED' || s == 'CANCELLED';
          }).toList();
          _loading = false;
        });
      case Failure(:final error):
        setState(() {
          _error = error.message;
          _loading = false;
        });
    }
  }

  String _statusLabel(String? status) => switch (status) {
        'COMPLETED' => 'Terminée',
        'CANCELLED' => 'Annulée',
        _ => status ?? '—',
      };

  Color _statusColor(String? status) => switch (status) {
        'COMPLETED' => MovaColors.green,
        'CANCELLED' => MovaColors.error,
        _ => MovaColors.textSecondary,
      };

  @override
  Widget build(BuildContext context) {
    return MovaScreen(
      title: 'Mes courses',
      actions: [
        IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
      ],
      child: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? MovaErrorBanner(message: _error!, onRetry: _load)
              : _rides.isEmpty
                  ? const Center(
                      child: Text(
                        'Aucune course terminée pour le moment.',
                        style: TextStyle(color: MovaColors.textSecondary),
                      ),
                    )
                  : ListView.separated(
                      itemCount: _rides.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 8),
                      itemBuilder: (context, index) {
                        final ride = _rides[index];
                        final fare = (ride['priceCdf'] ?? ride['estimatedFareCdf']) as num?;
                        final status = ride['status']?.toString();
                        final date = ride['completedAt']?.toString() ??
                            ride['createdAt']?.toString() ??
                            '';
                        return MovaCard(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Expanded(
                                    child: Text(
                                      ride['pickupAddress']?.toString() ?? 'Course',
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(fontWeight: FontWeight.w600),
                                    ),
                                  ),
                                  if (fare != null)
                                    Text(
                                      MarketConfig.formatCdf(fare.toInt()),
                                      style: const TextStyle(
                                        fontWeight: FontWeight.bold,
                                        color: MovaColors.green,
                                      ),
                                    ),
                                ],
                              ),
                              const SizedBox(height: 4),
                              Text(
                                '→ ${ride['dropoffAddress']?.toString() ?? ''}',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(color: MovaColors.textSecondary, fontSize: 13),
                              ),
                              const SizedBox(height: 6),
                              Row(
                                children: [
                                  Text(
                                    _statusLabel(status),
                                    style: TextStyle(
                                      color: _statusColor(status),
                                      fontSize: 12,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                  if (date.isNotEmpty) ...[
                                    const Text(' · ', style: TextStyle(color: MovaColors.textSecondary)),
                                    Expanded(
                                      child: Text(
                                        date.length > 16 ? date.substring(0, 16) : date,
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: const TextStyle(
                                          color: MovaColors.textSecondary,
                                          fontSize: 12,
                                        ),
                                      ),
                                    ),
                                  ],
                                ],
                              ),
                            ],
                          ),
                        );
                      },
                    ),
    );
  }
}

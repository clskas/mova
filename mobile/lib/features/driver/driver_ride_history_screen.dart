import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_client.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import 'active_ride_screen.dart';

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
        final all = (data['data'] as List? ?? data['rides'] as List? ?? [])
            .cast<Map<String, dynamic>>();
        setState(() {
          _rides = all;
          _loading = false;
        });
      case Failure(:final error):
        setState(() {
          _error = error.message;
          _loading = false;
        });
    }
  }

  String _statusLabel(Map<String, dynamic> ride) {
    final status = ride['status']?.toString();
    if (status == 'COMPLETED') {
      final paid = ride['isPaid'] == true;
      return paid ? 'Terminée · Payée' : 'Terminée · À encaisser';
    }
    return switch (status) {
      'CANCELLED' => 'Annulée',
      'DRIVER_ASSIGNED' => 'Assignée',
      'ARRIVING' => 'En route',
      'IN_PROGRESS' => 'En cours',
      _ => status ?? '—',
    };
  }

  Color _statusColor(Map<String, dynamic> ride) {
    final status = ride['status']?.toString();
    if (status == 'COMPLETED') {
      return ride['isPaid'] == true ? MovaColors.green : MovaColors.orange;
    }
    return switch (status) {
      'CANCELLED' => MovaColors.error,
      'DRIVER_ASSIGNED' || 'ARRIVING' || 'IN_PROGRESS' => MovaColors.violet,
      _ => MovaColors.textSecondary,
    };
  }

  Future<void> _openRide(Map<String, dynamic> ride) async {
    final rideId = ride['id']?.toString();
    if (rideId == null) return;
    final api = ref.read(apiClientProvider);
    final result = await api.getRide(rideId);
    if (!mounted) return;
    switch (result) {
      case Success(:final data):
        await Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => ActiveRideScreen(ride: data)),
        );
        if (mounted) _load();
      case Failure(:final error):
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.message)));
    }
  }

  bool _needsCashConfirm(Map<String, dynamic> ride) {
    return ride['status']?.toString() == 'COMPLETED' && ride['isPaid'] != true;
  }

  @override
  Widget build(BuildContext context) {
    return MovaScreen(
      title: 'Mes courses',
      scrollable: false,
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
                        'Aucune course pour le moment.',
                        style: TextStyle(color: MovaColors.textSecondary),
                      ),
                    )
                  : ListView.separated(
                      itemCount: _rides.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 8),
                      itemBuilder: (context, index) {
                        final ride = _rides[index];
                        final fare = (ride['priceCdf'] ?? ride['estimatedFareCdf']) as num?;
                        final date = ride['completedAt']?.toString() ??
                            ride['createdAt']?.toString() ??
                            '';
                        return MovaCard(
                          onTap: _needsCashConfirm(ride) ? () => _openRide(ride) : null,
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
                                    _statusLabel(ride),
                                    style: TextStyle(
                                      color: _statusColor(ride),
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
                              if (_needsCashConfirm(ride)) ...[
                                const SizedBox(height: 8),
                                Text(
                                  'Appuyez pour confirmer le paiement espèces (PIN)',
                                  style: TextStyle(
                                    color: MovaColors.orange.withValues(alpha: 0.95),
                                    fontSize: 12,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ],
                            ],
                          ),
                        );
                      },
                    ),
    );
  }
}

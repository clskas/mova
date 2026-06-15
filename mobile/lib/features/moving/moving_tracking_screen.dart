import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_client.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';

class MovingTrackingScreen extends ConsumerStatefulWidget {
  const MovingTrackingScreen({
    super.key,
    required this.movingId,
    required this.fromAddress,
    required this.toAddress,
    required this.estimatedPrice,
  });

  final String movingId;
  final String fromAddress;
  final String toAddress;
  final int estimatedPrice;

  @override
  ConsumerState<MovingTrackingScreen> createState() => _MovingTrackingScreenState();
}

class _MovingTrackingScreenState extends ConsumerState<MovingTrackingScreen> {
  Map<String, dynamic>? _request;
  bool _loading = true;
  String? _error;
  Timer? _pollTimer;

  @override
  void initState() {
    super.initState();
    _load();
    _pollTimer = Timer.periodic(const Duration(seconds: 8), (_) => _load(silent: true));
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }

  Future<void> _load({bool silent = false}) async {
    if (!silent) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    final api = ref.read(apiClientProvider);
    await api.checkHealth();
    final result = await api.get('/moving/${widget.movingId}');
    if (!mounted) return;
    setState(() {
      _loading = silent ? _loading : false;
      switch (result) {
        case Success(:final data):
          _request = data['moving'] as Map<String, dynamic>? ?? data['request'] as Map<String, dynamic>? ?? data;
          _error = null;
        case Failure(:final error):
          if (!silent) _error = error.message;
      }
    });
  }

  List<Map<String, dynamic>> get _timeline {
    final raw = _request?['timeline'] as List?;
    if (raw != null && raw.isNotEmpty) return raw.cast<Map<String, dynamic>>();
    final status = _request?['status']?.toString() ?? 'PENDING';
    final step = switch (status) {
      'COMPLETED' => 3,
      'IN_PROGRESS' => 2,
      'ASSIGNED' => 1,
      _ => 0,
    };
    const labels = [
      'Demande enregistrée',
      'Devis confirmé',
      'Équipe en route',
      'Déménagement terminé',
    ];
    return labels.asMap().entries.map((e) {
      return {'label': e.value, 'done': e.key <= step};
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final price = _request?['estimatedPriceCdf'] as int? ?? widget.estimatedPrice;

    return MovaScreen(
      title: 'Suivi déménagement',
      actions: [
        IconButton(icon: const Icon(Icons.refresh), onPressed: () => _load()),
      ],
      child: _loading && _request == null
          ? const Center(child: CircularProgressIndicator())
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (_error != null) ...[
                  MovaErrorBanner(message: _error!, onRetry: _load),
                  const SizedBox(height: 12),
                ],
                MovaCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Déménagement #${widget.movingId}',
                        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '${widget.fromAddress} → ${widget.toAddress}',
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 8),
                      Text(
                        MarketConfig.formatCdf(price),
                        style: const TextStyle(
                          color: MovaColors.green,
                          fontWeight: FontWeight.bold,
                          fontSize: 18,
                        ),
                      ),
                      Text(
                        _request?['status']?.toString() ?? 'PENDING',
                        style: const TextStyle(color: MovaColors.violet, fontWeight: FontWeight.w600),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 20),
                Text('Statuts', style: Theme.of(context).textTheme.titleSmall),
                const SizedBox(height: 12),
                ..._timeline.map((step) {
                  final done = step['done'] == true;
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Row(
                      children: [
                        Icon(
                          done ? Icons.check_circle : Icons.radio_button_unchecked,
                          color: done ? MovaColors.green : MovaColors.textSecondary,
                          size: 22,
                        ),
                        const SizedBox(width: 12),
                        Expanded(child: Text(step['label']?.toString() ?? '')),
                      ],
                    ),
                  );
                }),
                const SizedBox(height: 24),
                MovaButton(
                  label: 'Retour à l\'accueil',
                  isSecondary: true,
                  icon: Icons.home_outlined,
                  onPressed: () => Navigator.popUntil(context, (r) => r.isFirst),
                ),
              ],
            ),
    );
  }
}

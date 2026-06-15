import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_client.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';

class ErrandTrackingScreen extends ConsumerStatefulWidget {
  const ErrandTrackingScreen({
    super.key,
    required this.errandId,
    required this.deliveryAddress,
    required this.items,
    required this.totalCdf,
  });

  final String errandId;
  final String deliveryAddress;
  final List<String> items;
  final int totalCdf;

  @override
  ConsumerState<ErrandTrackingScreen> createState() => _ErrandTrackingScreenState();
}

class _ErrandTrackingScreenState extends ConsumerState<ErrandTrackingScreen> {
  Map<String, dynamic>? _order;
  bool _loading = true;
  String? _error;
  Timer? _pollTimer;

  static const _defaultTimeline = [
    {'label': 'Commande reçue', 'done': true},
    {'label': 'Achats en cours', 'done': false},
    {'label': 'Livreur en route', 'done': false},
    {'label': 'Livré', 'done': false},
  ];

  @override
  void initState() {
    super.initState();
    _load();
    _pollTimer = Timer.periodic(const Duration(seconds: 5), (_) => _load(silent: true));
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
    final result = await api.get('/errands/${widget.errandId}');
    if (!mounted) return;
    setState(() {
      _loading = silent ? _loading : false;
      switch (result) {
        case Success(:final data):
          _order = data['order'] as Map<String, dynamic>? ??
              data['errand'] as Map<String, dynamic>? ??
              data;
          _error = null;
        case Failure(:final error):
          if (!silent) _error = error.message;
      }
    });
  }

  List<Map<String, dynamic>> get _timeline {
    final raw = _order?['timeline'] as List?;
    if (raw != null && raw.isNotEmpty) return raw.cast<Map<String, dynamic>>();
    final status = _order?['status']?.toString() ?? 'PENDING';
    final step = switch (status) {
      'DELIVERED' || 'COMPLETED' => 3,
      'IN_TRANSIT' || 'IN_PROGRESS' => 2,
      'ACCEPTED' || 'SHOPPING' => 1,
      _ => 0,
    };
    return _defaultTimeline.asMap().entries.map((e) {
      return {'label': e.value['label'], 'done': e.key <= step};
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final price = _order?['estimatedPriceCdf'] as int? ?? widget.totalCdf;

    return MovaScreen(
      title: 'Suivi courses',
      actions: [
        IconButton(icon: const Icon(Icons.refresh), onPressed: () => _load()),
      ],
      child: _loading && _order == null
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
                        'Course #${widget.errandId}',
                        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                      ),
                      const SizedBox(height: 4),
                      Text(widget.deliveryAddress, maxLines: 2, overflow: TextOverflow.ellipsis),
                      if (widget.items.isNotEmpty) ...[
                        const SizedBox(height: 4),
                        Text(
                          widget.items.join(', '),
                          style: const TextStyle(color: MovaColors.textSecondary, fontSize: 13),
                          maxLines: 3,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                      const SizedBox(height: 8),
                      Text(
                        MarketConfig.formatCdf(price),
                        style: const TextStyle(
                          color: MovaColors.green,
                          fontWeight: FontWeight.bold,
                          fontSize: 18,
                        ),
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
                if (_order?['status']?.toString() == 'COMPLETED' ||
                    _order?['status']?.toString() == 'DELIVERED') ...[
                  const SizedBox(height: 16),
                  MovaCard(
                    child: Row(
                      children: [
                        const Icon(Icons.verified_outlined, color: MovaColors.green),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            _order?['deliveryProofUrl'] != null
                                ? 'Preuve de livraison enregistrée'
                                : 'Livraison confirmée',
                            style: const TextStyle(fontWeight: FontWeight.w600),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
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

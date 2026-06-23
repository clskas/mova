import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_client.dart';
import '../../core/config/market_config.dart';
import '../../core/config/test_runtime_config.dart';
import '../../core/error/result.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import 'tracking_screen.dart';

class MatchingScreen extends ConsumerStatefulWidget {
  const MatchingScreen({
    super.key,
    required this.rideId,
    required this.pickupAddress,
    required this.dropoffAddress,
    required this.estimatedFareCdf,
  });

  final String rideId;
  final String pickupAddress;
  final String dropoffAddress;
  final int estimatedFareCdf;

  @override
  ConsumerState<MatchingScreen> createState() => _MatchingScreenState();
}

class _MatchingScreenState extends ConsumerState<MatchingScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulseController;
  bool _searching = true;
  bool _cancelling = false;
  String? _error;
  int _attempt = 0;
  int _driversFound = 0;
  double? _radiusKm;
  DateTime? _lastSearchAt;
  Timer? _pollTimer;
  Timer? _rescanTimer;

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1500),
    )..repeat();
    WidgetsBinding.instance.addPostFrameCallback((_) => _search());
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _rescanTimer?.cancel();
    _pulseController.dispose();
    super.dispose();
  }

  Future<void> _search() async {
    setState(() {
      _searching = true;
      _error = null;
    });
    final api = ref.read(apiClientProvider);
    await api.checkHealth();
    final result = await api.searchDrivers(widget.rideId);
    if (!mounted) return;

    switch (result) {
      case Success(:final data):
        final found = (data['driversFound'] as num?)?.toInt() ?? 0;
        setState(() {
          _attempt = (data['attempt'] as num?)?.toInt() ?? 0;
          _driversFound = found;
          _radiusKm = (data['radiusKm'] as num?)?.toDouble();
          _lastSearchAt = DateTime.now();
        });
        if (api.isMockMode) {
          if (movaSkipMatchingAutoTracking) return;
          await Future<void>.delayed(const Duration(seconds: 1));
          if (mounted) _goToTracking();
          return;
        }
        _startPollingForDriver();
        _scheduleRescan();
      case Failure(:final error):
        setState(() {
          _searching = false;
          _error = error.message;
        });
    }
  }

  void _startPollingForDriver() {
    _pollTimer?.cancel();
    _pollTimer = Timer.periodic(const Duration(seconds: 3), (_) => _pollRide());
    _pollRide();
  }

  void _scheduleRescan() {
    _rescanTimer?.cancel();
    _rescanTimer = Timer.periodic(const Duration(seconds: 30), (_) => _maybeRescan());
  }

  Future<void> _maybeRescan() async {
    if (!_searching || _lastSearchAt == null) return;
    final elapsed = DateTime.now().difference(_lastSearchAt!);
    if (elapsed.inSeconds < 30) return;
    final api = ref.read(apiClientProvider);
    final rideResult = await api.getRide(widget.rideId);
    if (!mounted) return;
    if (rideResult case Success(:final data)) {
      final status = data['status']?.toString() ?? '';
      if (status == 'MATCHING' || status == 'SEARCHING' || status == 'REQUESTED') {
        if (!api.rideHasDriver(data)) {
          await _search();
        }
      }
    }
  }

  Future<void> _pollRide() async {
    final api = ref.read(apiClientProvider);
    final result = await api.getRide(widget.rideId);
    if (!mounted) return;
    switch (result) {
      case Success(:final data):
        if (api.rideHasDriver(data)) {
          _pollTimer?.cancel();
          setState(() => _searching = false);
          _goToTracking();
        } else if ((data['status']?.toString() ?? '') == 'CANCELLED') {
          _pollTimer?.cancel();
          setState(() {
            _searching = false;
            _error = 'Course annulée.';
          });
        }
      case Failure():
        break;
    }
  }

  void _goToTracking() {
    Navigator.pushReplacement(
      context,
      MaterialPageRoute(
        builder: (_) => TrackingScreen(
          rideId: widget.rideId,
          estimatedFareCdf: widget.estimatedFareCdf,
        ),
      ),
    );
  }

  Future<void> _cancel() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Annuler la course ?'),
        content: const Text(
          'Annulation gratuite avant l\'arrivée du chauffeur. '
          'Des frais de 2 000 FC peuvent s\'appliquer après acceptation.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Non')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Oui, annuler'),
          ),
        ],
      ),
    );
    if (confirm != true || !mounted) return;

    setState(() => _cancelling = true);
    _pollTimer?.cancel();
    final api = ref.read(apiClientProvider);
    await api.cancelRide(widget.rideId, reason: 'Annulé par le passager');
    if (!mounted) return;
    setState(() => _cancelling = false);
    Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    return MovaScreen(
      title: 'Recherche',
      scrollable: false,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Expanded(
            child: MovaFlexScroll(
              padding: const EdgeInsets.symmetric(horizontal: 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const SizedBox(height: 16),
                  Center(
                    child: AnimatedBuilder(
                      animation: _pulseController,
                      builder: (context, child) {
                        final scale = 1.0 + (_pulseController.value * 0.15);
                        return Transform.scale(scale: scale, child: child);
                      },
                      child: Container(
                        width: 100,
                        height: 100,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: MovaColors.violet.withValues(alpha: 0.12),
                          border: Border.all(color: MovaColors.violet, width: 2),
                        ),
                        child: const Icon(Icons.search, size: 48, color: MovaColors.violet),
                      ),
                    ),
                  ),
                  const SizedBox(height: 24),
                  Text(
                    _searching ? 'Recherche d\'un chauffeur…' : 'Chauffeur trouvé !',
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    '${widget.pickupAddress} → ${widget.dropoffAddress}',
                    textAlign: TextAlign.center,
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: MovaColors.textSecondary),
                  ),
                  if (_attempt > 0) ...[
                    const SizedBox(height: 8),
                    Text(
                      'Tentative $_attempt',
                      textAlign: TextAlign.center,
                      style: const TextStyle(fontSize: 13, color: MovaColors.textSecondary),
                    ),
                  ],
                  if (_radiusKm != null) ...[
                    const SizedBox(height: 4),
                    Text(
                      'Rayon de recherche : ${_radiusKm!.toStringAsFixed(0)} km',
                      textAlign: TextAlign.center,
                      style: const TextStyle(fontSize: 13, color: MovaColors.textSecondary),
                    ),
                  ],
                  if (_driversFound > 0) ...[
                    const SizedBox(height: 12),
                    MovaCard(
                      child: Row(
                        children: [
                          const Icon(Icons.check_circle_outline, color: MovaColors.green),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              _driversFound == 1
                                  ? '1 chauffeur disponible — en attente d\'acceptation…'
                                  : '$_driversFound chauffeurs disponibles — en attente d\'acceptation…',
                              style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ] else if (_searching && _attempt > 1) ...[
                    const SizedBox(height: 12),
                    const Text(
                      'Élargissement du rayon de recherche…',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 13, color: MovaColors.orange),
                    ),
                  ],
                  const SizedBox(height: 16),
                  MovaCard(
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(Icons.lock_outline, color: MovaColors.green),
                        const SizedBox(width: 8),
                        Flexible(
                          child: Text(
                            'Tarif estimé : ${MarketConfig.formatCdf(widget.estimatedFareCdf)}',
                            textAlign: TextAlign.center,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  if (_searching)
                    const LinearProgressIndicator(color: MovaColors.violet)
                  else
                    const Center(
                      child: Icon(Icons.check_circle, color: MovaColors.green, size: 32),
                    ),
                  if (_error != null) ...[
                    const SizedBox(height: 16),
                    MovaErrorBanner(message: _error!, onRetry: _search),
                  ],
                  const SizedBox(height: 16),
                ],
              ),
            ),
          ),
          MovaButton(
            label: 'Annuler la recherche',
            isSecondary: true,
            isLoading: _cancelling,
            icon: Icons.close,
            onPressed: _searching && !_cancelling ? _cancel : null,
          ),
          const SizedBox(height: 8),
          const Text(
            'Politique d\'annulation : gratuite avant acceptation du chauffeur.',
            textAlign: TextAlign.center,
            maxLines: 3,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(fontSize: 12, color: MovaColors.textSecondary),
          ),
          SizedBox(height: MediaQuery.paddingOf(context).bottom + 8),
        ],
      ),
    );
  }
}

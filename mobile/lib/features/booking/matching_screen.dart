import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_client.dart';
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
  Timer? _pollTimer;

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
        setState(() {
          _attempt = (data['attempt'] as num?)?.toInt() ?? 0;
        });
        if (api.isMockMode) {
          await Future<void>.delayed(const Duration(seconds: 1));
          if (mounted) _goToTracking();
          return;
        }
        _startPollingForDriver();
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
          const SizedBox(height: 24),
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
            maxLines: 2,
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
          const SizedBox(height: 24),
          if (_searching)
            const LinearProgressIndicator(color: MovaColors.violet)
          else
            const Icon(Icons.check_circle, color: MovaColors.green, size: 32),
          if (_error != null) ...[
            const SizedBox(height: 16),
            MovaErrorBanner(message: _error!, onRetry: _search),
          ],
          const Spacer(),
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
            style: TextStyle(fontSize: 12, color: MovaColors.textSecondary),
          ),
        ],
      ),
    );
  }
}

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_client.dart';
import '../../core/billing/service_price_display.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/services/cancel_eligibility.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import '../booking/payment_screen.dart';
import '../billing/cash_paid_claim_button.dart';
import '../history/history_detail_dialog.dart';
import '../../core/i18n/i18n.dart';

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
  bool _cancelling = false;
  bool _paymentNavigated = false;
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
          _maybeGoToPayment();
        case Failure(:final error):
          if (!silent) _error = error.message;
      }
    });
  }

  Future<void> _cancelMoving() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(tr('Annuler le déménagement ?')),
        content: Text(tr('Votre demande sera annulée si l\'équipe n\'a pas encore commencé.')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(tr('Non'))),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: Text(tr('Oui, annuler'))),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _cancelling = true);
    final api = ref.read(apiClientProvider);
    final result = await api.post('/moving/${widget.movingId}/cancel', {});
    if (!mounted) return;
    setState(() => _cancelling = false);
    switch (result) {
      case Success():
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(tr('Demande de déménagement annulée'))),
        );
        await _load(silent: true);
      case Failure(:final error):
        setState(() => _error = error.message);
    }
  }

  List<Map<String, dynamic>> get _timeline {
    final raw = _request?['timeline'] as List?;
    if (raw != null && raw.isNotEmpty) {
      return raw.cast<Map<String, dynamic>>();
    }
    return movingTimelineSteps(_request?['status']?.toString());
  }

  List<String> get _photoUrls {
    final raw = _request?['photoUrls'] as List?;
    if (raw == null) return [];
    return raw.map((e) => e.toString()).where((u) => u.isNotEmpty).toList();
  }

  int get _totalCdf =>
      _request?['passengerTotalCdf'] as int? ??
      _request?['estimatedPriceCdf'] as int? ??
      widget.estimatedPrice;

  Future<void> _openPayment() async {
    if (!mounted || _totalCdf <= 0) return;
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => PaymentScreen(
          serviceType: 'MOVING',
          serviceId: widget.movingId,
          amountCdf: _totalCdf,
          completionPin: _request?['completionPin']?.toString(),
        ),
      ),
    );
    if (mounted) await _load(silent: true);
  }

  void _maybeGoToPayment() {
    if (_paymentNavigated || !mounted || _totalCdf <= 0) return;
    if (_request?['isPaid'] == true) return;
    final method = _request?['paymentMethod']?.toString().toUpperCase();
    final cashPending = method == 'CASH' &&
        _request?['paymentStatus']?.toString().toUpperCase() == 'PENDING';
    if (cashPending || _request?['cashDisputed'] == true) return;
    final paymentReady = _request?['paymentReady'] == true ||
        (_request?['status']?.toString() == 'COMPLETED' && _request?['isPaid'] != true);
    if (!paymentReady) return;
    _paymentNavigated = true;
    _openPayment();
  }

  bool get _movingCashPending {
    if (_request?['isPaid'] == true) return false;
    if (_request?['status']?.toString() != 'COMPLETED') return false;
    return _request?['paymentMethod']?.toString().toUpperCase() == 'CASH' &&
        _request?['paymentStatus']?.toString().toUpperCase() == 'PENDING';
  }

  Future<void> _claimCashPaid() async {
    final api = ref.read(apiClientProvider);
    final claim = await api.claimCashPaidService('MOVING', widget.movingId);
    if (!mounted) return;
    await showCashClaimResult(
      context: context,
      claim: claim,
      onClaimed: () {
        final current = _request;
        if (current == null) return;
        setState(() => _request = {...current, 'passengerClaimedPaid': true});
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final status = _request?['status']?.toString() ?? 'PENDING';
    final isPaid = _request?['isPaid'] == true;
    final paymentReady = _request?['paymentReady'] == true;

    return MovaScreen(
      title: tr('Suivi déménagement'),
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
                        trf('Déménagement #{v1}', {'v1': widget.movingId.length <= 8 ? widget.movingId.toUpperCase() : widget.movingId.substring(0, 8).toUpperCase()}),
                        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '${widget.fromAddress} → ${widget.toAddress}',
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 8),
                      if (_request != null)
                        ServicePriceDisplay.passengerCard(
                          {..._request!, 'type': 'MOVING'},
                          totalLabel: tr('Total déménagement'),
                        ),
                      Text(
                        isPaid ? tr('Payé') : historyStatusLabel(status),
                        style: TextStyle(
                          color: isPaid ? MovaColors.green : MovaColors.violet,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      if (_movingCashPending) ...[
                        const SizedBox(height: 12),
                        Text(
                          _request?['cashDisputed'] == true
                              ? tr('Litige : l\'équipe signale ne pas avoir reçu les espèces.')
                              : tr('Paiement espèces en attente — l\'équipe confirmera la réception.'),
                          style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
                        ),
                        const SizedBox(height: 8),
                        CashPaidClaimButton(
                          claimed: _request?['passengerClaimedPaid'] == true,
                          onPressed: _claimCashPaid,
                        ),
                      ] else if (paymentReady && !isPaid) ...[
                        const SizedBox(height: 12),
                        MovaButton(
                          label: tr('Payer le déménagement'),
                          icon: Icons.payment,
                          onPressed: _openPayment,
                        ),
                      ],
                      const SizedBox(height: 8),
                      Text(
                        tr('Un administrateur SENGA valide votre demande, assigne une équipe/camion, '
                        'puis met à jour le statut. Vous voyez ici les changements en temps réel.'),
                        style: TextStyle(fontSize: 12, color: MovaColors.textSecondary, height: 1.35),
                      ),
                    ],
                  ),
                ),
                if (_photoUrls.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  Text(tr('Photos inventaire'), style: Theme.of(context).textTheme.titleSmall),
                  const SizedBox(height: 8),
                  SizedBox(
                    height: 88,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      itemCount: _photoUrls.length,
                      separatorBuilder: (_, __) => const SizedBox(width: 8),
                      itemBuilder: (_, i) => ClipRRect(
                        borderRadius: BorderRadius.circular(8),
                        child: Image.network(
                          MarketConfig.resolveMediaUrl(_photoUrls[i]),
                          width: 88,
                          height: 88,
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) => Container(
                            width: 88,
                            height: 88,
                            color: Colors.grey.shade200,
                            child: const Icon(Icons.broken_image_outlined),
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
                const SizedBox(height: 20),
                Text(tr('Suivi'), style: Theme.of(context).textTheme.titleSmall),
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
                if (CancelEligibility.moving(_request)) ...[
                  const SizedBox(height: 16),
                  MovaButton(
                    label: tr('Annuler la demande'),
                    icon: Icons.cancel_outlined,
                    isLoading: _cancelling,
                    isSecondary: true,
                    onPressed: _cancelling ? null : _cancelMoving,
                  ),
                ],
                const SizedBox(height: 24),
                MovaButton(
                  label: tr('Retour à l\'accueil'),
                  isSecondary: true,
                  icon: Icons.home_outlined,
                  onPressed: () => Navigator.popUntil(context, (r) => r.isFirst),
                ),
              ],
            ),
    );
  }
}

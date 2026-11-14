import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/i18n/i18n.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_widgets.dart';

/// Growth switches sent by `/public/client-config` → `growth` (Admin → Automatisations).
class GrowthConfig {
  const GrowthConfig(this.raw);
  final Map<String, dynamic> raw;

  static const empty = GrowthConfig({});

  factory GrowthConfig.from(Object? v) =>
      v is Map ? GrowthConfig(Map<String, dynamic>.from(v)) : empty;

  Map<String, dynamic> _sec(String k) =>
      raw[k] is Map ? Map<String, dynamic>.from(raw[k] as Map) : const {};

  bool on(String k) => _sec(k)['enabled'] == true;
  int intOf(String k, String f, int d) => (_sec(k)[f] as num?)?.toInt() ?? d;
  List<int> tipPresets() {
    final v = _sec('tips')['presetsCdf'];
    return v is List ? v.map((e) => (e as num).toInt()).where((e) => e > 0).toList() : const [500, 1000, 2000];
  }
}

/// Proposed price bounds (mirrors @mova/shared clampProposedFare, tested).
int clampProposedFare(int estimate, int proposed, int minPct, int maxPct) {
  final min = ((estimate * minPct / 100) / 100).ceil() * 100;
  final max = ((estimate * maxPct / 100) / 100).floor() * 100;
  final p = (proposed / 100).round() * 100;
  return p.clamp(min, max < min ? min : max);
}

/// Booking: « Proposer mon prix » and « Chauffeure femme ».
class GrowthBookingOptions extends StatelessWidget {
  const GrowthBookingOptions({
    super.key,
    required this.config,
    required this.estimateCdf,
    required this.proposedCdf,
    required this.onProposed,
    required this.showWomen,
    required this.womenOnly,
    required this.onWomenOnly,
  });

  final GrowthConfig config;
  final int estimateCdf;
  final int? proposedCdf;
  final ValueChanged<int?> onProposed;
  final bool showWomen;
  final bool womenOnly;
  final ValueChanged<bool> onWomenOnly;

  @override
  Widget build(BuildContext context) {
    final priceOn = config.on('priceOffer') && estimateCdf > 0;
    if (!priceOn && !showWomen) return const SizedBox.shrink();
    final minPct = config.intOf('priceOffer', 'minPct', 80);
    final maxPct = config.intOf('priceOffer', 'maxPct', 150);
    final current = proposedCdf ?? estimateCdf;
    void step(int delta) =>
        onProposed(clampProposedFare(estimateCdf, current + delta, minPct, maxPct));
    return MovaCard(
      key: const Key('growthBookingOptions'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (priceOn) ...[
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(tr('Proposer mon prix'), style: const TextStyle(fontWeight: FontWeight.w600)),
              subtitle: Text(tr('Les chauffeurs acceptent ou non votre prix.'),
                  style: const TextStyle(fontSize: 12, color: MovaColors.textSecondary)),
              value: proposedCdf != null,
              onChanged: (v) => onProposed(v ? estimateCdf : null),
            ),
            if (proposedCdf != null)
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  IconButton(
                    key: const Key('priceMinus'),
                    icon: const Icon(Icons.remove_circle_outline),
                    onPressed: () => step(-500),
                  ),
                  Text(MarketConfig.formatCdf(current),
                      style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: MovaColors.violet)),
                  IconButton(
                    key: const Key('pricePlus'),
                    icon: const Icon(Icons.add_circle_outline),
                    onPressed: () => step(500),
                  ),
                ],
              ),
          ],
          if (showWomen)
            SwitchListTile(
              key: const Key('womenDriverToggle'),
              contentPadding: EdgeInsets.zero,
              secondary: const Icon(Icons.woman_outlined, color: MovaColors.violet),
              title: Text(tr('Chauffeure femme'), style: const TextStyle(fontWeight: FontWeight.w600)),
              subtitle: Text(tr('Seules les chauffeures femmes reçoivent votre demande.'),
                  style: const TextStyle(fontSize: 12, color: MovaColors.textSecondary)),
              value: womenOnly,
              onChanged: onWomenOnly,
            ),
        ],
      ),
    );
  }
}

/// After a ride: tip (100 % driver) and « add to favourites ».
class RideTipFavoriteCard extends ConsumerStatefulWidget {
  const RideTipFavoriteCard({super.key, required this.rideId});
  final String rideId;

  @override
  ConsumerState<RideTipFavoriteCard> createState() => _RideTipFavoriteCardState();
}

class _RideTipFavoriteCardState extends ConsumerState<RideTipFavoriteCard> {
  GrowthConfig _cfg = GrowthConfig.empty;
  String? _driverId;
  bool _tipped = false;
  bool _favorite = false;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final api = ref.read(apiClientProvider);
    final cfg = await api.get('/public/client-config');
    final ride = await api.getRide(widget.rideId);
    if (!mounted) return;
    setState(() {
      if (cfg case Success(:final data)) _cfg = GrowthConfig.from(data['growth']);
      if (ride case Success(:final data)) _driverId = data['driverId']?.toString();
    });
  }

  void _snack(String m) {
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));
  }

  Future<void> _tip(int amount) async {
    setState(() => _busy = true);
    final r = await ref.read(apiClientProvider).post('/payments/tips/rides/${widget.rideId}', {'amountCdf': amount});
    if (!mounted) return;
    setState(() => _busy = false);
    switch (r) {
      case Success(:final data):
        setState(() => _tipped = true);
        _snack(data['message']?.toString() ?? tr('Merci !'));
      case Failure(:final error):
        _snack(error.message);
    }
  }

  Future<void> _addFavorite() async {
    final id = _driverId;
    if (id == null) return;
    setState(() => _busy = true);
    final r = await ref.read(apiClientProvider).post('/rides/favorite-drivers/$id', {});
    if (!mounted) return;
    setState(() => _busy = false);
    switch (r) {
      case Success():
        setState(() => _favorite = true);
        _snack(tr('Chauffeur ajouté à vos favoris.'));
      case Failure(:final error):
        _snack(error.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final tips = _cfg.on('tips') && _driverId != null;
    final fav = _cfg.on('favoriteDrivers') && _driverId != null;
    if (!tips && !fav) return const SizedBox.shrink();
    return MovaCard(
      key: const Key('rideTipFavorite'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (tips) ...[
            Text(_tipped ? tr('Pourboire envoyé. Merci !') : tr('Laisser un pourboire (100 % pour le chauffeur)'),
                style: const TextStyle(fontWeight: FontWeight.w600)),
            if (!_tipped) ...[
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                children: [
                  for (final a in _cfg.tipPresets())
                    OutlinedButton(
                      onPressed: _busy ? null : () => _tip(a),
                      child: Text(MarketConfig.formatCdf(a)),
                    ),
                ],
              ),
            ],
          ],
          if (fav) ...[
            if (tips) const SizedBox(height: 12),
            OutlinedButton.icon(
              key: const Key('addFavoriteDriver'),
              onPressed: _busy || _favorite ? null : _addFavorite,
              icon: Icon(_favorite ? Icons.favorite : Icons.favorite_border, color: MovaColors.red),
              label: Text(_favorite ? tr('Chauffeur favori') : tr('Ajouter ce chauffeur à mes favoris')),
            ),
          ],
        ],
      ),
    );
  }
}

/// Wallet: loyalty points and redeem.
class LoyaltyCard extends ConsumerStatefulWidget {
  const LoyaltyCard({super.key, this.onRedeemed});
  final VoidCallback? onRedeemed;

  @override
  ConsumerState<LoyaltyCard> createState() => _LoyaltyCardState();
}

class _LoyaltyCardState extends ConsumerState<LoyaltyCard> {
  Map<String, dynamic>? _data;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final r = await ref.read(apiClientProvider).get('/payments/loyalty');
    if (!mounted) return;
    if (r case Success(:final data)) setState(() => _data = data);
  }

  Future<void> _redeem() async {
    setState(() => _busy = true);
    final r = await ref.read(apiClientProvider).post('/payments/loyalty/redeem', {});
    if (!mounted) return;
    setState(() => _busy = false);
    final msg = switch (r) {
      Success(:final data) => data['message']?.toString() ?? tr('Crédit ajouté.'),
      Failure(:final error) => error.message,
    };
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
    await _load();
    widget.onRedeemed?.call();
  }

  @override
  Widget build(BuildContext context) {
    final d = _data;
    if (d == null || d['enabled'] != true) return const SizedBox.shrink();
    final points = (d['points'] as num?)?.toInt() ?? 0;
    final need = (d['redeemPoints'] as num?)?.toInt() ?? 100;
    final value = (d['redeemValueCdf'] as num?)?.toInt() ?? 0;
    return MovaCard(
      key: const Key('loyaltyCard'),
      child: Row(
        children: [
          const Icon(Icons.stars_rounded, color: MovaColors.violet, size: 32),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(trf('{v1} points de fidélité', {'v1': '$points'}),
                    style: const TextStyle(fontWeight: FontWeight.w600)),
                Text(
                  trf('{v1} points = {v2} sur votre portefeuille', {'v1': '$need', 'v2': MarketConfig.formatCdf(value)}),
                  style: const TextStyle(fontSize: 12, color: MovaColors.textSecondary),
                ),
              ],
            ),
          ),
          TextButton(
            onPressed: _busy || d['canRedeem'] != true ? null : _redeem,
            child: Text(tr('Échanger')),
          ),
        ],
      ),
    );
  }
}

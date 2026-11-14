import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/api/api_client.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/i18n/i18n.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';

/// Referral: my code to share, and the friend's code to enter in the first days.
class ReferralScreen extends ConsumerStatefulWidget {
  const ReferralScreen({super.key});

  @override
  ConsumerState<ReferralScreen> createState() => _ReferralScreenState();
}

class _ReferralScreenState extends ConsumerState<ReferralScreen> {
  Map<String, dynamic>? _data;
  String? _error;
  bool _saving = false;
  final _codeCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _codeCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final result = await ref.read(apiClientProvider).get('/users/me/referral', skipCache: true);
    if (!mounted) return;
    setState(() {
      switch (result) {
        case Success(:final data):
          _data = data is Map ? Map<String, dynamic>.from(data) : <String, dynamic>{};
          _error = null;
        case Failure(:final error):
          _error = error.message;
      }
    });
  }

  Future<void> _apply() async {
    final code = _codeCtrl.text.trim();
    if (code.isEmpty || _saving) return;
    setState(() => _saving = true);
    final result = await ref.read(apiClientProvider).post('/users/me/referral', {'code': code});
    if (!mounted) return;
    setState(() => _saving = false);
    switch (result) {
      case Success(:final data):
        setState(() => _data = data);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(tr('Code enregistré. Votre crédit arrivera après votre première course.'))));
      case Failure(:final error):
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final d = _data;
    final enabled = d?['enabled'] == true;
    final code = d?['code']?.toString() ?? '';
    final forReferrer = (d?['referrerRewardCdf'] as num?)?.toInt() ?? 0;
    final forReferee = (d?['refereeRewardCdf'] as num?)?.toInt() ?? 0;
    return MovaScreen(
      title: tr('Parrainage'),
      child: d == null
          ? Center(child: _error != null ? Text(_error!) : const CircularProgressIndicator())
          : !enabled
              ? Center(child: Text(tr('Le parrainage n’est pas ouvert pour le moment.'), textAlign: TextAlign.center))
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      trf('Invitez vos proches : quand ils terminent leur première course ou livraison, vous recevez {a} et eux {b} sur votre portefeuille SENGA.',
                          {'a': MarketConfig.formatCdf(forReferrer), 'b': MarketConfig.formatCdf(forReferee)}),
                      style: const TextStyle(color: MovaColors.textSecondary, height: 1.4),
                    ),
                    const SizedBox(height: 16),
                    MovaCard(
                      child: Column(
                        children: [
                          Text(tr('Votre code'), style: const TextStyle(color: MovaColors.textSecondary)),
                          const SizedBox(height: 6),
                          SelectableText(code, style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w800, letterSpacing: 2)),
                          const SizedBox(height: 12),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              TextButton.icon(
                                onPressed: () {
                                  Clipboard.setData(ClipboardData(text: code));
                                  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(tr('Code copié'))));
                                },
                                icon: const Icon(Icons.copy),
                                label: Text(tr('Copier')),
                              ),
                              const SizedBox(width: 8),
                              FilledButton.icon(
                                onPressed: () => Share.share(trf('Rejoins SENGA avec mon code {code} : tu reçois un crédit après ta première course.', {'code': code})),
                                icon: const Icon(Icons.share),
                                label: Text(tr('Partager')),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                    Text(
                      trf('Invités : {n} · Récompensés : {r}', {'n': d['invited'] ?? 0, 'r': d['rewarded'] ?? 0}),
                      textAlign: TextAlign.center,
                    ),
                    if (d['canEnterCode'] == true) ...[
                      const SizedBox(height: 24),
                      Text(tr('Vous avez un code de parrainage ?'), style: const TextStyle(fontWeight: FontWeight.w600)),
                      const SizedBox(height: 8),
                      TextField(
                        controller: _codeCtrl,
                        textCapitalization: TextCapitalization.characters,
                        decoration: InputDecoration(hintText: tr('Code de votre parrain'), border: const OutlineInputBorder()),
                      ),
                      const SizedBox(height: 8),
                      MovaButton(label: tr('Valider le code'), isLoading: _saving, onPressed: _saving ? null : _apply),
                    ] else if (d['hasReferrer'] == true) ...[
                      const SizedBox(height: 24),
                      Text(tr('Votre parrain est enregistré.'), textAlign: TextAlign.center),
                    ],
                  ],
                ),
    );
  }
}

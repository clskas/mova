import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/config/market_config.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import '../../core/api/api_client.dart';
import '../../core/error/result.dart';

class WalletScreen extends ConsumerStatefulWidget {
  const WalletScreen({super.key});

  @override
  ConsumerState<WalletScreen> createState() => _WalletScreenState();
}

class _WalletScreenState extends ConsumerState<WalletScreen> {
  int _balance = 0;
  List<Map<String, dynamic>> _transactions = [];
  bool _loading = true;
  bool _topUpLoading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadWallet();
  }

  Future<void> _loadWallet() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final api = ref.read(apiClientProvider);
    await api.loadToken();
    final result = await api.get('/wallet');
    setState(() {
      _loading = false;
      switch (result) {
        case Success(:final data):
          _balance = data['balanceCdf'] as int? ?? 0;
          final raw = data['transactions'] as List? ?? [];
          _transactions = raw.cast<Map<String, dynamic>>();
        case Failure(:final error):
          _error = error.message;
      }
    });
  }

  String _txLabel(Map<String, dynamic> tx) {
    final type = tx['type']?.toString() ?? '';
    final desc = tx['description']?.toString();
    if (desc != null && desc.isNotEmpty) return desc;
    return type == 'CREDIT' ? 'Recharge' : 'Paiement';
  }

  String _formatDate(String? raw) {
    if (raw == null) return '';
    try {
      final dt = DateTime.parse(raw);
      final d = dt.day.toString().padLeft(2, '0');
      final m = dt.month.toString().padLeft(2, '0');
      return '$d/$m/${dt.year}';
    } catch (_) {
      return raw;
    }
  }

  Future<void> _showTopUpSheet(MobileMoneyProvider provider) async {
    final amountController = TextEditingController(text: '10000');
    final phoneController = TextEditingController(
      text: await ref.read(apiClientProvider).loadUserPhone() ?? '+243812345678',
    );

    if (!mounted) return;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) {
        return Padding(
          padding: EdgeInsets.only(
            left: 16,
            right: 16,
            top: 24,
            bottom: MediaQuery.of(ctx).viewInsets.bottom + 24,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Recharger via ${provider.name}',
                style: Theme.of(ctx).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: amountController,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: 'Montant (FC)',
                  prefixIcon: Icon(Icons.payments_outlined),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: phoneController,
                keyboardType: TextInputType.phone,
                decoration: const InputDecoration(
                  labelText: 'Numéro mobile money',
                  prefixIcon: Icon(Icons.phone_outlined),
                ),
              ),
              const SizedBox(height: 20),
              MovaButton(
                label: 'Confirmer la recharge',
                icon: Icons.check,
                isLoading: _topUpLoading,
                onPressed: _topUpLoading
                    ? null
                    : () async {
                        final amount = int.tryParse(amountController.text.trim()) ?? 0;
                        if (amount < 500) {
                          ScaffoldMessenger.of(ctx).showSnackBar(
                            const SnackBar(content: Text('Montant minimum : 500 FC')),
                          );
                          return;
                        }
                        Navigator.pop(ctx);
                        await _topUp(provider.id, amount, phoneController.text.trim());
                      },
              ),
            ],
          ),
        );
      },
    );
    amountController.dispose();
    phoneController.dispose();
  }

  Future<void> _topUp(String provider, int amountCdf, String phone) async {
    setState(() => _topUpLoading = true);
    final api = ref.read(apiClientProvider);
    final result = await api.post('/wallet/top-up', {
      'provider': provider,
      'amountCdf': amountCdf,
      'phone': MarketConfig.normalizePhone(phone),
    });
    if (!mounted) return;
    setState(() => _topUpLoading = false);
    switch (result) {
      case Success(:final data):
        await _loadWallet();
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                data['message']?.toString() ?? 'Recharge de ${MarketConfig.formatCdf(amountCdf)} en cours',
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          );
        }
      case Failure(:final error):
        setState(() => _error = error.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    return MovaScreen(
      title: 'Portefeuille',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          MovaCard(
            child: Column(
              children: [
                const Text('Solde disponible'),
                const SizedBox(height: 8),
                Text(
                  _loading ? '…' : MarketConfig.formatCdf(_balance),
                  style: const TextStyle(
                    fontSize: 32,
                    fontWeight: FontWeight.bold,
                    color: MovaColors.green,
                  ),
                ),
              ],
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 16),
            MovaErrorBanner(message: _error!, onRetry: _loadWallet),
          ],
          const SizedBox(height: 24),
          Text('Recharger avec', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 12),
          ...MarketConfig.mobileMoneyProviders.map((p) => MovaCard(
                margin: const EdgeInsets.only(bottom: 8),
                onTap: _topUpLoading ? null : () => _showTopUpSheet(p),
                child: Row(
                  children: [
                    Container(
                      width: 40,
                      height: 40,
                      decoration: BoxDecoration(
                        color: Color(p.color),
                        borderRadius: BorderRadius.circular(8),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        p.name,
                        style: const TextStyle(fontWeight: FontWeight.w600),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    const Icon(Icons.add_circle_outline, color: MovaColors.violet),
                  ],
                ),
              )),
          const SizedBox(height: 24),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('Transactions', style: Theme.of(context).textTheme.titleMedium),
              if (!_loading)
                IconButton(
                  icon: const Icon(Icons.refresh),
                  onPressed: _loadWallet,
                  tooltip: 'Actualiser',
                ),
            ],
          ),
          const SizedBox(height: 8),
          if (_loading)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 24),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (_transactions.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 24),
              child: Text(
                'Aucune transaction récente',
                textAlign: TextAlign.center,
                style: TextStyle(color: MovaColors.textSecondary),
              ),
            )
          else
            ..._transactions.map((tx) {
              final amount = tx['amountCdf'] as int? ?? 0;
              final isCredit = amount >= 0;
              return Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: MovaCard(
                  child: Row(
                    children: [
                      Icon(
                        isCredit ? Icons.arrow_downward : Icons.arrow_upward,
                        color: isCredit ? MovaColors.green : MovaColors.orange,
                        size: 20,
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              _txLabel(tx),
                              style: const TextStyle(fontWeight: FontWeight.w600),
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                            Text(
                              _formatDate(tx['createdAt']?.toString()),
                              style: const TextStyle(
                                color: MovaColors.textSecondary,
                                fontSize: 12,
                              ),
                            ),
                          ],
                        ),
                      ),
                      Text(
                        '${isCredit ? '+' : ''}${MarketConfig.formatCdf(amount.abs())}',
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          color: isCredit ? MovaColors.green : MovaColors.midnight,
                        ),
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

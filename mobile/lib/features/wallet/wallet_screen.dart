import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/config/market_config.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import '../../core/api/api_client.dart';
import '../../core/cache/wallet_cache.dart';
import '../../core/error/result.dart';
import '../../core/widgets/offline_shell.dart';

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
  bool _topUpSheetOpen = false;
  String? _error;
  DateTime? _lastSync;
  bool _fromCache = false;

  @override
  void initState() {
    super.initState();
    _loadWallet();
  }

  void _applyWalletData({
    required int balance,
    required List<Map<String, dynamic>> transactions,
    String? error,
  }) {
    _balance = balance;
    _transactions = transactions;
    _loading = false;
    _error = error;
    if (!_topUpSheetOpen && mounted) {
      setState(() {});
    }
  }

  Future<void> _loadWallet() async {
    if (!_topUpSheetOpen && mounted) {
      setState(() {
        _loading = true;
        _error = null;
      });
    } else {
      _loading = true;
      _error = null;
    }

    final cached = await WalletCache.load();
    if (!cached.isEmpty && mounted && !_topUpSheetOpen) {
      setState(() {
        _balance = cached.balanceCdf;
        _transactions = cached.transactions;
        _lastSync = cached.syncedAt;
        _fromCache = true;
        _loading = false;
      });
    }

    final api = ref.read(apiClientProvider);
    await api.loadToken();
    await api.checkHealth();
    final result = await api.get('/wallet');
    if (!mounted) return;
    switch (result) {
      case Success(:final data):
        final raw = data['transactions'] as List? ?? [];
        _applyWalletData(
          balance: data['balanceCdf'] as int? ?? 0,
          transactions: raw.cast<Map<String, dynamic>>(),
        );
        _fromCache = data['cached'] == true;
        final syncedRaw = data['syncedAt']?.toString();
        _lastSync = syncedRaw != null
            ? DateTime.tryParse(syncedRaw)
            : (_fromCache ? _lastSync : DateTime.now());
        if (!_fromCache) _lastSync = DateTime.now();
        if (!_topUpSheetOpen && mounted) setState(() {});
      case Failure(:final error):
        _applyWalletData(
          balance: _balance,
          transactions: _transactions,
          error: error.message,
        );
    }
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
    final initialPhone =
        await ref.read(apiClientProvider).loadUserPhone() ?? '+243812345678';
    if (!mounted) return;

    setState(() => _topUpSheetOpen = true);
    final confirmed = await showModalBottomSheet<({int amount, String phone})>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => _WalletTopUpSheet(
        provider: provider,
        initialPhone: initialPhone,
      ),
    );
    if (!mounted) return;
    setState(() => _topUpSheetOpen = false);

    if (confirmed != null) {
      await _topUp(provider.id, confirmed.amount, confirmed.phone);
    }
  }

  Future<void> _topUp(String provider, int amountCdf, String phone) async {
    setState(() => _topUpLoading = true);
    final api = ref.read(apiClientProvider);
    await api.checkHealth();
    final result = await api.post('/wallet/top-up', {
      'provider': provider,
      'amountCdf': amountCdf,
      'phone': MarketConfig.normalizePhone(phone),
    });
    if (!mounted) return;
    setState(() => _topUpLoading = false);
    switch (result) {
      case Success(:final data):
        if (data['offline'] == true) {
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(
                  data['message']?.toString() ??
                      'Enregistré hors ligne, synchronisation à la reconnexion',
                ),
              ),
            );
          }
          return;
        }
        final newBalance = data['balanceCdf'] as int?;
        if (newBalance != null) {
          setState(() => _balance = newBalance);
        }
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
                if (_lastSync != null) ...[
                  const SizedBox(height: 8),
                  Text(
                    formatLastSync(_lastSync),
                    style: TextStyle(
                      color: _fromCache ? MovaColors.orange : MovaColors.textSecondary,
                      fontSize: 12,
                    ),
                  ),
                ],
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

class _WalletTopUpSheet extends StatefulWidget {
  const _WalletTopUpSheet({
    required this.provider,
    required this.initialPhone,
  });

  final MobileMoneyProvider provider;
  final String initialPhone;

  @override
  State<_WalletTopUpSheet> createState() => _WalletTopUpSheetState();
}

class _WalletTopUpSheetState extends State<_WalletTopUpSheet> {
  late final TextEditingController _amountController;
  late final TextEditingController _phoneController;

  @override
  void initState() {
    super.initState();
    _amountController = TextEditingController(text: '10000');
    _phoneController = TextEditingController(text: widget.initialPhone);
  }

  @override
  void dispose() {
    _amountController.dispose();
    _phoneController.dispose();
    super.dispose();
  }

  void _confirm() {
    final amount = int.tryParse(_amountController.text.trim()) ?? 0;
    if (amount < 500) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Montant minimum : 500 FC')),
      );
      return;
    }
    Navigator.pop(
      context,
      (amount: amount, phone: _phoneController.text.trim()),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 24,
        bottom: MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Recharger via ${widget.provider.name}',
            style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _amountController,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(
              labelText: 'Montant (FC)',
              prefixIcon: Icon(Icons.payments_outlined),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _phoneController,
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
            onPressed: _confirm,
          ),
        ],
      ),
    );
  }
}

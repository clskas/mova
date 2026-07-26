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
import '../../core/wallet/wallet_movements.dart';

class WalletScreen extends ConsumerStatefulWidget {
  const WalletScreen({super.key});

  @override
  ConsumerState<WalletScreen> createState() => _WalletScreenState();
}

enum _WalletTxFilter { all, recharge, withdraw }

class _WalletScreenState extends ConsumerState<WalletScreen> {
  int _balance = 0;
  List<Map<String, dynamic>> _transactions = [];
  int _txTotal = 0;
  bool _txLoadingMore = false;
  _WalletTxFilter _txFilter = _WalletTxFilter.all;
  bool _loading = true;
  bool _topUpLoading = false;
  bool _withdrawLoading = false;
  bool _topUpSheetOpen = false;
  bool _withdrawSheetOpen = false;
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
    if (!_topUpSheetOpen && !_withdrawSheetOpen && mounted) {
      setState(() {});
    }
  }

  Future<void> _loadWallet() async {
    if (!_topUpSheetOpen && !_withdrawSheetOpen && mounted) {
      setState(() {
        _loading = true;
        _error = null;
      });
    } else {
      _loading = true;
      _error = null;
    }

    final cached = await WalletCache.load();
    if (!cached.isEmpty && mounted && !_topUpSheetOpen && !_withdrawSheetOpen) {
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
    final results = await Future.wait([
      api.get('/wallet'),
      api.get('/wallet/transactions?limit=100&offset=0'),
    ]);
    if (!mounted) return;
    List<Map<String, dynamic>> txs = _transactions;
    switch (results[0]) {
      case Success(:final data):
        _balance = data['balanceCdf'] as int? ?? 0;
        _fromCache = data['cached'] == true;
        final syncedRaw = data['syncedAt']?.toString();
        _lastSync = syncedRaw != null
            ? DateTime.tryParse(syncedRaw)
            : (_fromCache ? _lastSync : DateTime.now());
        if (!_fromCache) _lastSync = DateTime.now();
      case Failure(:final error):
        _error = error.message;
    }
    switch (results[1]) {
      case Success(:final data):
        final raw = data['data'] as List? ?? data['transactions'] as List? ?? [];
        txs = raw.cast<Map<String, dynamic>>();
        _txTotal = data['total'] as int? ?? txs.length;
      case Failure():
        break;
    }
    _applyWalletData(balance: _balance, transactions: txs, error: _error);
    if (!_topUpSheetOpen && !_withdrawSheetOpen && mounted) setState(() {});
  }

  List<Map<String, dynamic>> get _filteredTransactions {
    return _transactions.where((tx) {
      switch (_txFilter) {
        case _WalletTxFilter.recharge:
          return WalletMovements.isRecharge(tx);
        case _WalletTxFilter.withdraw:
          return WalletMovements.isWithdraw(tx);
        case _WalletTxFilter.all:
          return true;
      }
    }).toList();
  }

  int get _rechargeCount => _transactions.where(WalletMovements.isRecharge).length;
  int get _withdrawCount => _transactions.where(WalletMovements.isWithdraw).length;
  bool get _hasMoreTransactions => _transactions.length < _txTotal;

  Future<void> _loadMoreTransactions() async {
    if (_txLoadingMore || !_hasMoreTransactions) return;
    setState(() => _txLoadingMore = true);
    final api = ref.read(apiClientProvider);
    final offset = _transactions.length;
    final result = await api.get('/wallet/transactions?limit=100&offset=$offset');
    if (!mounted) return;
    switch (result) {
      case Success(:final data):
        final raw = data['data'] as List? ?? [];
        final batch = raw.cast<Map<String, dynamic>>();
        setState(() {
          _transactions = [..._transactions, ...batch];
          _txTotal = data['total'] as int? ?? _transactions.length;
          _txLoadingMore = false;
        });
      case Failure():
        setState(() => _txLoadingMore = false);
    }
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

  Future<void> _showWithdrawSheet() async {
    if (_balance < 500) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Solde insuffisant — minimum 500 FC pour retirer')),
      );
      return;
    }
    final initialPhone =
        await ref.read(apiClientProvider).loadUserPhone() ?? '+243812345678';
    if (!mounted) return;

    setState(() => _withdrawSheetOpen = true);
    final confirmed = await showModalBottomSheet<({int amount, String phone, String provider})>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => _WalletWithdrawSheet(
        maxAmount: _balance,
        initialPhone: initialPhone,
      ),
    );
    if (!mounted) return;
    setState(() => _withdrawSheetOpen = false);

    if (confirmed != null) {
      await _withdraw(confirmed.amount, confirmed.provider, confirmed.phone);
    }
  }

  Future<void> _withdraw(int amountCdf, String provider, String phone) async {
    setState(() => _withdrawLoading = true);
    final api = ref.read(apiClientProvider);
    await api.checkHealth();
    final result = await api.post('/wallet/withdraw', {
      'provider': provider,
      'amountCdf': amountCdf,
      'phone': MarketConfig.normalizePhone(phone),
    });
    if (!mounted) return;
    setState(() => _withdrawLoading = false);
    switch (result) {
      case Success(:final data):
        final newBalance = data['balanceCdf'] as int?;
        if (newBalance != null) {
          setState(() => _balance = newBalance);
        }
        await _loadWallet();
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                data['message']?.toString() ?? 'Retrait de ${MarketConfig.formatCdf(amountCdf)} en cours',
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
                const SizedBox(height: 16),
                MovaButton(
                  label: _withdrawLoading ? 'Retrait…' : 'Retirer vers Mobile Money',
                  icon: Icons.arrow_upward,
                  isSecondary: true,
                  isLoading: _withdrawLoading,
                  onPressed: _withdrawLoading || _topUpLoading || _loading || _balance < 500
                      ? null
                      : _showWithdrawSheet,
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
          if (ref.read(apiClientProvider).isMockMode)
            MovaCard(
              margin: const EdgeInsets.only(bottom: 8),
              onTap: _topUpLoading
                  ? null
                  : () async {
                      final phone =
                          await ref.read(apiClientProvider).loadUserPhone() ?? '+243900000010';
                      await _topUp('MOCK', 50000, phone);
                    },
              child: Row(
                children: [
                  Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      color: MovaColors.violet.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Icon(Icons.science_outlined, color: MovaColors.violet),
                  ),
                  const SizedBox(width: 12),
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Recharge test (simulation)', style: TextStyle(fontWeight: FontWeight.w600)),
                        Text(
                          '+50 000 FC instantanés (simulation hors production)',
                          style: TextStyle(fontSize: 12, color: MovaColors.textSecondary),
                        ),
                      ],
                    ),
                  ),
                  const Icon(Icons.bolt, color: MovaColors.green),
                ],
              ),
            ),
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
              Text('Historique', style: Theme.of(context).textTheme.titleMedium),
              if (!_loading)
                IconButton(
                  icon: const Icon(Icons.refresh),
                  onPressed: _loadWallet,
                  tooltip: 'Actualiser',
                ),
            ],
          ),
          const SizedBox(height: 8),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                ChoiceChip(
                  label: Text('Tout (${_transactions.length})'),
                  selected: _txFilter == _WalletTxFilter.all,
                  onSelected: (_) => setState(() => _txFilter = _WalletTxFilter.all),
                ),
                const SizedBox(width: 8),
                ChoiceChip(
                  label: Text('Recharges ($_rechargeCount)'),
                  selected: _txFilter == _WalletTxFilter.recharge,
                  onSelected: (_) => setState(() => _txFilter = _WalletTxFilter.recharge),
                ),
                const SizedBox(width: 8),
                ChoiceChip(
                  label: Text('Retraits ($_withdrawCount)'),
                  selected: _txFilter == _WalletTxFilter.withdraw,
                  onSelected: (_) => setState(() => _txFilter = _WalletTxFilter.withdraw),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          if (_loading)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 24),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (_filteredTransactions.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 24),
              child: Text(
                'Aucune opération pour ce filtre',
                textAlign: TextAlign.center,
                style: TextStyle(color: MovaColors.textSecondary),
              ),
            )
          else
            ..._filteredTransactions.map((tx) {
              final amount = tx['amountCdf'] as int? ?? 0;
              final isCredit = amount >= 0;
              final isRecharge = WalletMovements.isRecharge(tx);
              final isWithdraw = WalletMovements.isWithdraw(tx);
              return Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: MovaCard(
                  child: Row(
                    children: [
                      Icon(
                        isRecharge
                            ? Icons.add_circle_outline
                            : isWithdraw
                                ? Icons.remove_circle_outline
                                : isCredit
                                    ? Icons.arrow_downward
                                    : Icons.arrow_upward,
                        color: isRecharge
                            ? MovaColors.green
                            : isWithdraw
                                ? MovaColors.orange
                                : isCredit
                                    ? MovaColors.green
                                    : MovaColors.midnight,
                        size: 20,
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              WalletMovements.label(tx),
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
          if (!_loading && _hasMoreTransactions)
            Padding(
              padding: const EdgeInsets.only(top: 8, bottom: 16),
              child: OutlinedButton(
                onPressed: _txLoadingMore ? null : _loadMoreTransactions,
                child: Text(
                  _txLoadingMore
                      ? 'Chargement…'
                      : 'Charger plus (${_transactions.length} / $_txTotal)',
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _WalletWithdrawSheet extends StatefulWidget {
  const _WalletWithdrawSheet({
    required this.maxAmount,
    required this.initialPhone,
  });

  final int maxAmount;
  final String initialPhone;

  @override
  State<_WalletWithdrawSheet> createState() => _WalletWithdrawSheetState();
}

class _WalletWithdrawSheetState extends State<_WalletWithdrawSheet> {
  late final TextEditingController _amountController;
  late final TextEditingController _phoneController;
  late String _providerId;

  @override
  void initState() {
    super.initState();
    _amountController = TextEditingController(
      text: widget.maxAmount >= 5000 ? '5000' : '${widget.maxAmount}',
    );
    _phoneController = TextEditingController(text: widget.initialPhone);
    _providerId = MarketConfig.mobileMoneyProviders.first.id;
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
    if (amount > widget.maxAmount) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Maximum : ${MarketConfig.formatCdf(widget.maxAmount)}')),
      );
      return;
    }
    Navigator.pop(
      context,
      (amount: amount, phone: _phoneController.text.trim(), provider: _providerId),
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
            'Retirer vers Mobile Money',
            style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 8),
          Text(
            'Solde disponible : ${MarketConfig.formatCdf(widget.maxAmount)}',
            style: const TextStyle(color: MovaColors.textSecondary, fontSize: 13),
          ),
          const SizedBox(height: 16),
          DropdownButtonFormField<String>(
            value: _providerId,
            decoration: const InputDecoration(
              labelText: 'Opérateur',
              prefixIcon: Icon(Icons.account_balance_wallet_outlined),
            ),
            items: MarketConfig.mobileMoneyProviders
                .map((p) => DropdownMenuItem(value: p.id, child: Text(p.name)))
                .toList(),
            onChanged: (v) {
              if (v != null) setState(() => _providerId = v);
            },
          ),
          const SizedBox(height: 12),
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
              labelText: 'Numéro Mobile Money',
              prefixIcon: Icon(Icons.phone_outlined),
            ),
          ),
          const SizedBox(height: 20),
          MovaButton(
            label: 'Confirmer le retrait',
            icon: Icons.check,
            onPressed: _confirm,
          ),
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

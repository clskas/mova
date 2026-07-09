import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../core/api/api_client.dart';
import '../../core/billing/driver_earnings_display.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import 'driver_onboarding_screen.dart';

enum _EarningsPeriod { today, week, month, custom }

enum _ServiceFilter { all, ride, delivery, mission }

class EarningsScreen extends ConsumerStatefulWidget {
  const EarningsScreen({super.key});

  @override
  ConsumerState<EarningsScreen> createState() => _EarningsScreenState();
}

class _EarningsScreenState extends ConsumerState<EarningsScreen> {
  Map<String, dynamic>? _data;
  Map<String, dynamic>? _cashDebt;
  Map<String, dynamic>? _activity;
  final _amountController = TextEditingController(text: '5000');
  String? _error;
  bool _loading = true;
  bool _loadingActivity = false;
  bool _withdrawing = false;
  bool _settlingDebt = false;
  _EarningsPeriod _period = _EarningsPeriod.today;
  _ServiceFilter _serviceFilter = _ServiceFilter.all;
  DateTime? _customFrom;
  DateTime? _customTo;

  int _asInt(dynamic value) {
    if (value is int) return value;
    if (value is num) return value.round();
    return int.tryParse(value?.toString() ?? '') ?? 0;
  }

  int get _minWithdraw => _asInt(_data?['minWithdrawCdf']).clamp(500, 999999999);

  bool get _payoutConfigured => _data?['payoutConfigured'] == true;

  String get _payoutLabel {
    final provider = _data?['payoutProvider']?.toString() ?? 'Mobile Money';
    final masked = _data?['payoutPhoneMasked']?.toString();
    if (masked != null && masked.isNotEmpty) return '$provider · $masked';
    return provider;
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _amountController.dispose();
    super.dispose();
  }

  String? _apiTypeFilter() {
    return switch (_serviceFilter) {
      _ServiceFilter.all => 'ALL',
      _ServiceFilter.ride => 'RIDE',
      _ServiceFilter.delivery => 'DELIVERY',
      _ServiceFilter.mission => 'MISSION',
    };
  }

  ({DateTime from, DateTime to})? _dateRange() {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    switch (_period) {
      case _EarningsPeriod.today:
        return (from: today, to: today);
      case _EarningsPeriod.week:
        final start = today.subtract(Duration(days: today.weekday - 1));
        return (from: start, to: today);
      case _EarningsPeriod.month:
        return (from: DateTime(now.year, now.month, 1), to: today);
      case _EarningsPeriod.custom:
        if (_customFrom == null || _customTo == null) return null;
        return (from: _customFrom!, to: _customTo!);
    }
  }

  String _fmtDate(DateTime d) => DateFormat('yyyy-MM-dd').format(d);

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final api = ref.read(apiClientProvider);
    await api.checkHealth();
    final results = await Future.wait([
      api.get('/drivers/earnings'),
      api.getCashDebtSummary(),
    ]);
    if (!mounted) return;
    switch (results[0]) {
      case Success(:final data):
        setState(() => _data = data);
      case Failure(:final error):
        setState(() {
          _data = const {};
          _error = error.message;
        });
    }
    switch (results[1]) {
      case Success(:final data):
        setState(() => _cashDebt = data);
      case Failure():
        setState(() => _cashDebt = const {'totalOpenCdf': 0, 'openCount': 0, 'debts': []});
    }
    setState(() => _loading = false);
    await _loadActivity();
  }

  Future<void> _loadActivity() async {
    final range = _dateRange();
    if (range == null) return;
    setState(() => _loadingActivity = true);
    final api = ref.read(apiClientProvider);
    final result = await api.getDriverEarningsActivity(
      from: _fmtDate(range.from),
      to: _fmtDate(range.to),
      type: _apiTypeFilter(),
    );
    if (!mounted) return;
    setState(() {
      _loadingActivity = false;
      if (result case Success(:final data)) {
        _activity = data;
      }
    });
  }

  Future<void> _pickCustomRange() async {
    final now = DateTime.now();
    final picked = await showDateRangePicker(
      context: context,
      firstDate: DateTime(now.year - 2),
      lastDate: now,
      initialDateRange: _customFrom != null && _customTo != null
          ? DateTimeRange(start: _customFrom!, end: _customTo!)
          : DateTimeRange(start: now.subtract(const Duration(days: 7)), end: now),
    );
    if (picked == null || !mounted) return;
    setState(() {
      _period = _EarningsPeriod.custom;
      _customFrom = picked.start;
      _customTo = picked.end;
    });
    await _loadActivity();
  }

  int get _openCashDebtCdf => _asInt(_cashDebt?['totalOpenCdf']);

  int get _periodNetCdf => _asInt(_activity?['summary']?['netCdf']);

  int get _periodCount => _asInt(_activity?['summary']?['count']);

  Future<void> _settleCashDebts() async {
    final total = _openCashDebtCdf;
    if (total <= 0) return;
    final available = _asInt(_data?['withdrawableCdf'] ?? _data?['walletBalanceCdf']);
    if (available < total) {
      setState(() => _error =
          'Solde insuffisant pour régler ${MarketConfig.formatCdf(total)} (disponible : ${MarketConfig.formatCdf(available)})');
      return;
    }
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Régler les dettes espèces'),
        content: Text(
          'MOVA débitera ${MarketConfig.formatCdf(total)} de votre portefeuille pour solder les encaissements cash à reverser.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Annuler')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Régler')),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() {
      _settlingDebt = true;
      _error = null;
    });
    final api = ref.read(apiClientProvider);
    final result = await api.settleCashDebts();
    if (!mounted) return;
    setState(() => _settlingDebt = false);
    switch (result) {
      case Success(:final data):
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(data['message']?.toString() ?? 'Dettes espèces réglées')),
        );
        await _load();
      case Failure(:final error):
        setState(() => _error = error.message);
    }
  }

  Future<void> _openDossier() async {
    await Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => const DriverOnboardingScreen(canSkipToHome: true)),
    );
    if (mounted) await _load();
  }

  Future<void> _withdraw() async {
    if (!_payoutConfigured) {
      setState(() => _error = 'Configurez votre numéro Mobile Money dans Mon dossier.');
      return;
    }
    final amount = int.tryParse(_amountController.text.trim());
    if (amount == null || amount < _minWithdraw) {
      setState(() => _error = 'Montant minimum : ${MarketConfig.formatCdf(_minWithdraw)}');
      return;
    }
    final available = _asInt(_data?['withdrawableCdf'] ?? _data?['walletBalanceCdf']);
    if (amount > available) {
      setState(() => _error = 'Solde disponible : ${MarketConfig.formatCdf(available)}');
      return;
    }
    setState(() {
      _withdrawing = true;
      _error = null;
    });
    final api = ref.read(apiClientProvider);
    final result = await api.post('/drivers/withdraw', {'amountCdf': amount});
    if (!mounted) return;
    setState(() => _withdrawing = false);
    switch (result) {
      case Success(:final data):
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(data['message']?.toString() ?? 'Retrait en cours…')),
        );
        await _load();
      case Failure(:final error):
        setState(() => _error = error.message);
    }
  }

  Widget _periodChip(String label, _EarningsPeriod period) {
    final selected = _period == period;
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: ChoiceChip(
        label: Text(label),
        selected: selected,
        onSelected: _loading || _loadingActivity
            ? null
            : (_) async {
                setState(() => _period = period);
                await _loadActivity();
              },
      ),
    );
  }

  Widget _serviceChip(String label, _ServiceFilter filter) {
    final selected = _serviceFilter == filter;
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: FilterChip(
        label: Text(label),
        selected: selected,
        onSelected: _loadingActivity
            ? null
            : (_) async {
                setState(() => _serviceFilter = filter);
                await _loadActivity();
              },
      ),
    );
  }

  Widget _summaryHero() {
    final balance = _asInt(_data?['withdrawableCdf'] ?? _data?['walletBalanceCdf']);
    return MovaCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('Solde disponible', style: TextStyle(color: MovaColors.textSecondary, fontSize: 13)),
          const SizedBox(height: 6),
          Text(
            MarketConfig.formatCdf(balance),
            style: const TextStyle(fontSize: 28, fontWeight: FontWeight.bold, color: MovaColors.green),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _period == _EarningsPeriod.today
                          ? 'Gains aujourd\'hui'
                          : 'Gains période',
                      style: const TextStyle(fontSize: 12, color: MovaColors.textSecondary),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      MarketConfig.formatCdf(_periodNetCdf),
                      style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
                    ),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  const Text('Missions', style: TextStyle(fontSize: 12, color: MovaColors.textSecondary)),
                  const SizedBox(height: 4),
                  Text('$_periodCount', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _lifetimeStats() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Text('Vue d\'ensemble', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(child: _statTile('Aujourd\'hui', _data?['todayCdf'])),
            const SizedBox(width: 8),
            Expanded(child: _statTile('Semaine', _data?['weekCdf'])),
          ],
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(child: _statTile('Mois', _data?['monthCdf'])),
            const SizedBox(width: 8),
            Expanded(child: _statTile('Total', _data?['totalCdf'])),
          ],
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(child: _statTile('Courses (net)', _data?['rideEarningsCdf'])),
            const SizedBox(width: 8),
            Expanded(child: _statTile('Livraisons (net)', _data?['deliveryEarningsCdf'])),
          ],
        ),
      ],
    );
  }

  Widget _statTile(String label, dynamic value) {
    return MovaCard(
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(fontSize: 11, color: MovaColors.textSecondary)),
          const SizedBox(height: 4),
          Text(
            MarketConfig.formatCdf(_asInt(value)),
            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
          ),
        ],
      ),
    );
  }

  Widget _activityList() {
    final items = (_activity?['items'] as List?)?.cast<Map<String, dynamic>>() ?? [];
    if (_loadingActivity) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 24),
        child: Center(child: CircularProgressIndicator()),
      );
    }
    if (_period == _EarningsPeriod.custom && (_customFrom == null || _customTo == null)) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 16),
        child: Text(
          'Choisissez une plage de dates pour afficher l\'historique.',
          style: TextStyle(color: MovaColors.textSecondary),
        ),
      );
    }
    if (items.isEmpty) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 16),
        child: Text(
          'Aucune mission terminée sur cette période.',
          style: TextStyle(color: MovaColors.textSecondary),
        ),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Text('Activité', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
        const SizedBox(height: 8),
        ...items.map((item) {
          final when = item['completedAt']?.toString();
          final whenLabel = when != null
              ? (DateTime.tryParse(when)?.toLocal() ?? DateTime.now())
              : null;
          return MovaCard(
            margin: const EdgeInsets.only(bottom: 8),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        DriverEarningsDisplay.activityTypeLabel(item['referenceType']?.toString()),
                        style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        item['label']?.toString() ?? 'Mission',
                        style: const TextStyle(fontSize: 12, color: MovaColors.textSecondary),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      if (whenLabel != null)
                        Text(
                          DateFormat('dd/MM/yyyy · HH:mm').format(whenLabel),
                          style: const TextStyle(fontSize: 11, color: MovaColors.textSecondary),
                        ),
                    ],
                  ),
                ),
                Text(
                  MarketConfig.formatCdf(_asInt(item['driverNetCdf'])),
                  style: const TextStyle(fontWeight: FontWeight.bold, color: MovaColors.green),
                ),
              ],
            ),
          );
        }),
      ],
    );
  }

  Widget _cashDebtSection() {
    final total = _openCashDebtCdf;
    if (total <= 0) return const SizedBox.shrink();
    return MovaCard(
      margin: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Icon(Icons.payments_outlined, color: MovaColors.orange),
              const SizedBox(width: 8),
              const Expanded(
                child: Text('Dettes espèces à reverser', style: TextStyle(fontWeight: FontWeight.bold)),
              ),
              Text(
                MarketConfig.formatCdf(total),
                style: const TextStyle(fontWeight: FontWeight.bold, color: MovaColors.orange),
              ),
            ],
          ),
          const SizedBox(height: 12),
          MovaButton(
            label: 'Régler depuis le portefeuille',
            icon: Icons.account_balance_wallet,
            isLoading: _settlingDebt,
            onPressed: _settlingDebt || _withdrawing ? null : _settleCashDebts,
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return MovaScreen(
      title: 'Revenus',
      scrollable: false,
      actions: [
        IconButton(icon: const Icon(Icons.refresh), onPressed: _loading || _withdrawing ? null : _load),
      ],
      child: _loading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(
                  child: MovaFlexScroll(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        if (_error != null) ...[
                          MovaErrorBanner(message: _error!, onRetry: _load),
                          const SizedBox(height: 12),
                        ],
                        _summaryHero(),
                        const SizedBox(height: 16),
                        SingleChildScrollView(
                          scrollDirection: Axis.horizontal,
                          child: Row(
                            children: [
                              _periodChip('Aujourd\'hui', _EarningsPeriod.today),
                              _periodChip('Semaine', _EarningsPeriod.week),
                              _periodChip('Mois', _EarningsPeriod.month),
                              ChoiceChip(
                                label: const Text('Personnalisé'),
                                selected: _period == _EarningsPeriod.custom,
                                onSelected: _loading || _loadingActivity ? null : (_) => _pickCustomRange(),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 10),
                        SingleChildScrollView(
                          scrollDirection: Axis.horizontal,
                          child: Row(
                            children: [
                              _serviceChip('Tout', _ServiceFilter.all),
                              _serviceChip('Courses', _ServiceFilter.ride),
                              _serviceChip('Livraisons', _ServiceFilter.delivery),
                              _serviceChip('Missions', _ServiceFilter.mission),
                            ],
                          ),
                        ),
                        const SizedBox(height: 16),
                        _cashDebtSection(),
                        _lifetimeStats(),
                        const SizedBox(height: 16),
                        _activityList(),
                      ],
                    ),
                  ),
                ),
                const Divider(height: 24),
                const Text('Retrait Mobile Money', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                const SizedBox(height: 8),
                if (_payoutConfigured)
                  Text('Vers $_payoutLabel', style: const TextStyle(color: MovaColors.textSecondary, fontSize: 13))
                else
                  const Text(
                    'Configurez votre numéro dans Mon dossier pour activer le retrait.',
                    style: TextStyle(color: MovaColors.error, fontSize: 13),
                  ),
                const SizedBox(height: 12),
                TextField(
                  controller: _amountController,
                  enabled: !_withdrawing && _payoutConfigured,
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(
                    labelText: 'Montant retrait (FC)',
                    helperText: 'Minimum ${MarketConfig.formatCdf(_minWithdraw)}',
                    prefixIcon: const Icon(Icons.payments_outlined),
                  ),
                ),
                const SizedBox(height: 12),
                MovaButton(
                  label: _payoutConfigured ? 'Retirer vers Mobile Money' : 'Configurer Mobile Money',
                  icon: _payoutConfigured ? Icons.account_balance : Icons.settings,
                  isLoading: _withdrawing,
                  onPressed: _withdrawing ? null : (_payoutConfigured ? _withdraw : _openDossier),
                ),
              ],
            ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/config/market_config.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/api/api_client.dart';
import '../../core/error/result.dart';
import 'driver_onboarding_screen.dart';

class KycScreen extends ConsumerWidget {
  const KycScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return const DriverOnboardingScreen(canSkipToHome: true);
  }
}

class EarningsScreen extends ConsumerStatefulWidget {
  const EarningsScreen({super.key});

  @override
  ConsumerState<EarningsScreen> createState() => _EarningsScreenState();
}

class _EarningsScreenState extends ConsumerState<EarningsScreen> {
  Map<String, dynamic>? _data;
  Map<String, dynamic>? _cashDebt;
  final _amountController = TextEditingController(text: '5000');
  String? _error;
  bool _loading = true;
  bool _withdrawing = false;
  bool _settlingDebt = false;

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
        setState(() {
          _data = data;
        });
      case Failure(:final error):
        setState(() {
          _data = const {};
          _error = error.message;
        });
    }
    switch (results[1]) {
      case Success(:final data):
        setState(() {
          _cashDebt = data;
          _loading = false;
        });
      case Failure():
        setState(() {
          _cashDebt = const {'totalOpenCdf': 0, 'openCount': 0, 'debts': []};
          _loading = false;
        });
    }
  }

  int get _openCashDebtCdf => _asInt(_cashDebt?['totalOpenCdf']);

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
        final message = data['message']?.toString() ?? 'Dettes espèces réglées';
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
        await _load();
      case Failure(:final error):
        setState(() => _error = error.message);
    }
  }

  String _debtCategoryLabel(String? category) {
    switch (category) {
      case 'PLATFORM_FEE':
        return 'Commission MOVA';
      case 'RESTAURANT_SHARE':
        return 'Part restaurant';
      case 'PARTNER_SHARE':
        return 'Part partenaire';
      default:
        return category ?? 'Dette';
    }
  }

  Widget _cashDebtSection() {
    final total = _openCashDebtCdf;
    if (total <= 0) return const SizedBox.shrink();

    final debts = (_cashDebt?['debts'] as List?)?.cast<Map<String, dynamic>>() ?? [];
    final byCategory = _cashDebt?['byCategory'] as Map<String, dynamic>? ?? {};

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        MovaCard(
          margin: const EdgeInsets.only(bottom: 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  const Icon(Icons.payments_outlined, color: MovaColors.orange),
                  const SizedBox(width: 8),
                  const Expanded(
                    child: Text(
                      'Dettes espèces à reverser',
                      style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
                    ),
                  ),
                  Text(
                    MarketConfig.formatCdf(total),
                    style: const TextStyle(
                      fontWeight: FontWeight.bold,
                      color: MovaColors.orange,
                      fontSize: 16,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              const Text(
                'Après un encaissement cash, ces montants doivent être reversés à MOVA (commission + parts restaurant/partenaire).',
                style: TextStyle(fontSize: 12, color: MovaColors.textSecondary),
              ),
              if (_asInt(byCategory['platformFeeCdf']) > 0) ...[
                const SizedBox(height: 6),
                Text(
                  'Commission MOVA : ${MarketConfig.formatCdf(_asInt(byCategory['platformFeeCdf']))}',
                  style: const TextStyle(fontSize: 12),
                ),
              ],
              if (_asInt(byCategory['restaurantShareCdf']) > 0) ...[
                Text(
                  'Restaurants : ${MarketConfig.formatCdf(_asInt(byCategory['restaurantShareCdf']))}',
                  style: const TextStyle(fontSize: 12),
                ),
              ],
              if (_asInt(byCategory['partnerShareCdf']) > 0) ...[
                Text(
                  'Partenaires : ${MarketConfig.formatCdf(_asInt(byCategory['partnerShareCdf']))}',
                  style: const TextStyle(fontSize: 12),
                ),
              ],
              const SizedBox(height: 12),
              MovaButton(
                label: 'Régler depuis le portefeuille',
                icon: Icons.account_balance_wallet,
                isLoading: _settlingDebt,
                onPressed: _settlingDebt || _withdrawing ? null : _settleCashDebts,
              ),
            ],
          ),
        ),
        if (debts.isNotEmpty) ...[
          const Text(
            'Détail des dettes ouvertes',
            style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
          ),
          const SizedBox(height: 6),
          ...debts.take(5).map(
            (d) => MovaCard(
              margin: const EdgeInsets.only(bottom: 6),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _debtCategoryLabel(d['category']?.toString()),
                          style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
                        ),
                        if (d['description'] != null)
                          Text(
                            d['description'].toString(),
                            style: const TextStyle(fontSize: 11, color: MovaColors.textSecondary),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                      ],
                    ),
                  ),
                  Text(
                    MarketConfig.formatCdf(_asInt(d['amountCdf'])),
                    style: const TextStyle(fontWeight: FontWeight.bold),
                  ),
                ],
              ),
            ),
          ),
          if (debts.length > 5)
            Text(
              '+ ${debts.length - 5} autre(s)',
              style: const TextStyle(fontSize: 11, color: MovaColors.textSecondary),
            ),
          const SizedBox(height: 8),
        ],
      ],
    );
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
        final message = data['message']?.toString() ?? 'Retrait en cours…';
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
        await _load();
      case Failure(:final error):
        setState(() => _error = error.message);
    }
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
                        _cashDebtSection(),
                        _earningsRow('Aujourd\'hui', _data!['todayCdf']),
                        _earningsRow('Cette semaine', _data!['weekCdf']),
                        _earningsRow('Ce mois', _data!['monthCdf']),
                        _earningsRow('Total', _data!['totalCdf']),
                        _earningsRow('Solde disponible (retrait)', _data!['withdrawableCdf'] ?? _data!['walletBalanceCdf']),
                        _earningsRow('Courses (net)', _data!['rideEarningsCdf']),
                        _earningsRow('Livraisons (net)', _data!['deliveryEarningsCdf']),
                        _earningsRow('Courses terminées', _data!['rideCount']),
                        _earningsRow('Livraisons terminées', _data!['deliveryCount']),
                      ],
                    ),
                  ),
                ),
                const Divider(height: 24),
                const Text(
                  'Retrait Mobile Money',
                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                ),
                const SizedBox(height: 8),
                if (_payoutConfigured)
                  Text(
                    'Vers $_payoutLabel',
                    style: const TextStyle(color: MovaColors.textSecondary, fontSize: 13),
                  )
                else
                  Text(
                    'Configurez votre numéro dans Mon dossier pour activer le retrait.',
                    style: const TextStyle(color: MovaColors.error, fontSize: 13),
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
                  onPressed: _withdrawing
                      ? null
                      : (_payoutConfigured ? _withdraw : _openDossier),
                ),
              ],
            ),
    );
  }

  Widget _earningsRow(String label, dynamic amount) {
    return MovaCard(
      margin: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          const SizedBox(width: 8),
          Flexible(
            child: Text(
              '${_asInt(amount)} FC',
              style: const TextStyle(fontWeight: FontWeight.bold),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.end,
            ),
          ),
        ],
      ),
    );
  }
}

class IncidentScreen extends ConsumerStatefulWidget {
  const IncidentScreen({super.key});

  @override
  ConsumerState<IncidentScreen> createState() => _IncidentScreenState();
}

class _IncidentScreenState extends ConsumerState<IncidentScreen> {
  final _descController = TextEditingController();
  String _type = 'OTHER';
  bool _loading = false;

  Future<void> _submit() async {
    setState(() => _loading = true);
    final api = ref.read(apiClientProvider);
    final result = await api.post('/incidents', {
      'type': _type,
      'description': _descController.text.trim(),
    });
    if (!mounted) return;
    setState(() => _loading = false);
    switch (result) {
      case Success():
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Incident signalé')),
        );
        Navigator.pop(context);
      case Failure(:final error):
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(error.message)),
        );
    }
  }

  @override
  void dispose() {
    _descController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MovaScreen(
      title: 'Signaler un incident',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          DropdownButtonFormField<String>(
            value: _type,
            decoration: const InputDecoration(labelText: 'Type'),
            items: const [
              DropdownMenuItem(value: 'ACCIDENT', child: Text('Accident')),
              DropdownMenuItem(value: 'HARASSMENT', child: Text('Harcèlement')),
              DropdownMenuItem(value: 'OTHER', child: Text('Autre')),
            ],
            onChanged: (v) => setState(() => _type = v ?? 'OTHER'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _descController,
            maxLines: 4,
            decoration: const InputDecoration(labelText: 'Description'),
          ),
          const SizedBox(height: 16),
          MovaButton(
            label: 'Envoyer',
            isLoading: _loading,
            onPressed: _submit,
          ),
        ],
      ),
    );
  }
}

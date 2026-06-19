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
  final _amountController = TextEditingController(text: '5000');
  String? _error;
  bool _loading = true;
  bool _withdrawing = false;

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
    final result = await api.get('/drivers/earnings');
    if (!mounted) return;
    switch (result) {
      case Success(:final data):
        setState(() {
          _data = data;
          _loading = false;
        });
      case Failure(:final error):
        setState(() {
          _data = const {};
          _error = error.message;
          _loading = false;
        });
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

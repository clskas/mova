import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
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
    final api = ref.read(apiClientProvider);
    await api.checkHealth();
    final result = await api.get('/drivers/earnings');
    if (result case Success(:final data)) setState(() => _data = data);
  }

  Future<void> _withdraw() async {
    final amount = int.tryParse(_amountController.text.trim());
    if (amount == null || amount < 1000) {
      setState(() => _error = 'Montant minimum : 1 000 FC');
      return;
    }
    final available = (_data?['withdrawableCdf'] ?? _data?['walletBalanceCdf']) as int? ?? 0;
    if (amount > available) {
      setState(() => _error = 'Solde disponible : $available FC. Ouvrez Revenus pour synchroniser.');
      return;
    }
    final api = ref.read(apiClientProvider);
    final phone = await api.loadUserPhone() ?? '+243812345678';
    final result = await api.post('/wallet/withdraw', {
      'amountCdf': amount,
      'provider': 'ORANGE_MONEY',
      'phone': phone,
    });
    if (!mounted) return;
    switch (result) {
      case Success():
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Retrait en cours…')),
        );
        await _load();
      case Failure(:final error):
        setState(() => _error = error.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    return MovaScreen(
      title: 'Revenus',
      child: _data == null
          ? const Center(child: CircularProgressIndicator())
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _earningsRow('Aujourd\'hui', _data!['todayCdf']),
                _earningsRow('Cette semaine', _data!['weekCdf']),
                _earningsRow('Ce mois', _data!['monthCdf']),
                _earningsRow('Total', _data!['totalCdf']),
                if (_data!['withdrawableCdf'] != null)
                  _earningsRow('Solde disponible (retrait)', _data!['withdrawableCdf']),
                if (_data!['rideEarningsCdf'] != null)
                  _earningsRow('Courses (net)', _data!['rideEarningsCdf']),
                if (_data!['deliveryEarningsCdf'] != null)
                  _earningsRow('Livraisons (net)', _data!['deliveryEarningsCdf']),
                if (_data!['rideCount'] != null)
                  _earningsRow('Courses terminées', _data!['rideCount']),
                if (_data!['deliveryCount'] != null)
                  _earningsRow('Livraisons terminées', _data!['deliveryCount']),
                const SizedBox(height: 24),
                TextField(
                  controller: _amountController,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: 'Montant retrait (FC)',
                    prefixIcon: Icon(Icons.payments_outlined),
                  ),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  MovaErrorBanner(message: _error!),
                ],
                const SizedBox(height: 16),
                MovaButton(
                  label: 'Retrait mobile money',
                  icon: Icons.account_balance,
                  onPressed: _withdraw,
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
              '${(amount as int? ?? 0).toString()} FC',
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
    await api.checkHealth();
    final result = await api.post('/incidents', {
      'type': _type,
      'description': _descController.text,
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
  Widget build(BuildContext context) {
    return MovaScreen(
      title: 'Signaler un incident',
      child: Column(
        children: [
          DropdownButtonFormField<String>(
            value: _type,
            decoration: const InputDecoration(labelText: 'Type'),
            items: const [
              DropdownMenuItem(value: 'ACCIDENT', child: Text('Accident')),
              DropdownMenuItem(value: 'HARASSMENT', child: Text('Harcèlement')),
              DropdownMenuItem(value: 'FRAUD', child: Text('Fraude')),
              DropdownMenuItem(value: 'OTHER', child: Text('Autre')),
            ],
            onChanged: (v) => setState(() => _type = v!),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _descController,
            maxLines: 4,
            decoration: const InputDecoration(labelText: 'Description'),
          ),
          const SizedBox(height: 24),
          MovaButton(label: 'Envoyer', isLoading: _loading, onPressed: _submit),
        ],
      ),
    );
  }
}

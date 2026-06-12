import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/api/api_client.dart';
import '../../core/error/result.dart';
import 'package:url_launcher/url_launcher.dart';

class KycScreen extends ConsumerStatefulWidget {
  const KycScreen({super.key});

  @override
  ConsumerState<KycScreen> createState() => _KycScreenState();
}

class _KycScreenState extends ConsumerState<KycScreen> {
  bool _loading = false;

  Future<void> _upload(String type) async {
    setState(() => _loading = true);
    final api = ref.read(apiClientProvider);
    await api.post('/drivers/kyc', {
      'type': type,
      'url': 'https://placeholder.mova.cd/kyc/$type.jpg',
    });
    setState(() => _loading = false);
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Document $type envoyé pour validation')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return MovaScreen(
      title: 'Documents KYC',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'Téléversez vos documents pour validation',
            style: TextStyle(color: MovaColors.textSecondary),
          ),
          const SizedBox(height: 24),
          ...['Permis de conduire', 'Carte grise', 'Photo identité'].map(
            (doc) => Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: MovaButton(
                label: 'Uploader — $doc',
                isSecondary: true,
                isLoading: _loading,
                icon: Icons.camera_alt,
                onPressed: () => _upload(doc.toLowerCase().replaceAll(' ', '_')),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class RideRequestScreen extends StatefulWidget {
  const RideRequestScreen({super.key});

  @override
  State<RideRequestScreen> createState() => _RideRequestScreenState();
}

class _RideRequestScreenState extends State<RideRequestScreen> {
  int _countdown = 30;

  @override
  void initState() {
    super.initState();
    _startCountdown();
  }

  void _startCountdown() {
    Future.doWhile(() async {
      await Future.delayed(const Duration(seconds: 1));
      if (!mounted) return false;
      setState(() => _countdown--);
      return _countdown > 0;
    });
  }

  Future<void> _openNavigation() async {
    const url = 'https://www.google.com/maps/dir/?api=1&destination=-4.35,15.35';
    if (await canLaunchUrl(Uri.parse(url))) {
      await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    }
  }

  @override
  Widget build(BuildContext context) {
    return MovaScreen(
      title: 'Nouvelle course',
      child: Column(
        children: [
          MovaCard(
            child: Column(
              children: [
                const Icon(Icons.person_pin_circle, size: 48, color: MovaColors.violet),
                const SizedBox(height: 12),
                const Text('Course vers Limete', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                const Text('2 500 FC • 3.2 km'),
                const SizedBox(height: 16),
                Text('$_countdown s', style: const TextStyle(fontSize: 32, color: MovaColors.orange)),
              ],
            ),
          ),
          const SizedBox(height: 24),
          MovaButton(label: 'Accepter', icon: Icons.check, onPressed: _openNavigation),
          const SizedBox(height: 8),
          MovaButton(label: 'Refuser', isSecondary: true, icon: Icons.close, onPressed: () => Navigator.pop(context)),
        ],
      ),
    );
  }
}

class EarningsScreen extends ConsumerStatefulWidget {
  const EarningsScreen({super.key});

  @override
  ConsumerState<EarningsScreen> createState() => _EarningsScreenState();
}

class _EarningsScreenState extends ConsumerState<EarningsScreen> {
  Map<String, dynamic>? _data;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final api = ref.read(apiClientProvider);
    final result = await api.get('/drivers/earnings');
    if (result case Success(:final data)) setState(() => _data = data);
  }

  @override
  Widget build(BuildContext context) {
    return MovaScreen(
      title: 'Revenus',
      child: _data == null
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                _earningsRow('Aujourd\'hui', _data!['todayCdf']),
                _earningsRow('Cette semaine', _data!['weekCdf']),
                _earningsRow('Ce mois', _data!['monthCdf']),
                _earningsRow('Total', _data!['totalCdf']),
                const SizedBox(height: 24),
                MovaButton(
                  label: 'Retrait mobile money',
                  icon: Icons.account_balance,
                  onPressed: () async {
                    final api = ref.read(apiClientProvider);
                    await api.post('/wallet/withdraw', {
                      'amountCdf': 5000,
                      'provider': 'ORANGE_MONEY',
                      'phone': '+243812345678',
                    });
                    if (mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Retrait en cours…')),
                      );
                    }
                  },
                ),
              ],
            ),
    );
  }

  Widget _earningsRow(String label, dynamic amount) {
    return MovaCard(
      margin: const EdgeInsets.only(bottom: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label),
          Text(
            '${(amount as int? ?? 0).toString()} FC',
            style: const TextStyle(fontWeight: FontWeight.bold),
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

  Future<void> _submit() async {
    final api = ref.read(apiClientProvider);
    await api.post('/incidents', {
      'type': _type,
      'description': _descController.text,
    });
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Incident signalé')),
      );
      Navigator.pop(context);
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
          MovaButton(label: 'Envoyer', onPressed: _submit),
        ],
      ),
    );
  }
}

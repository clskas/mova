import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/api/api_client.dart';
import '../../core/error/result.dart';

class KycScreen extends ConsumerStatefulWidget {
  const KycScreen({super.key});

  @override
  ConsumerState<KycScreen> createState() => _KycScreenState();
}

class _KycScreenState extends ConsumerState<KycScreen> {
  final _picker = ImagePicker();
  String? _uploadingType;
  String? _error;

  static const _docs = [
    ('permis_de_conduire', 'Permis de conduire'),
    ('carte_grise', 'Carte grise'),
    ('photo_identite', 'Photo identité'),
  ];

  Future<void> _upload(String type, String label) async {
    final file = await _picker.pickImage(source: ImageSource.camera, imageQuality: 80);
    if (file == null) return;

    setState(() {
      _uploadingType = type;
      _error = null;
    });
    final api = ref.read(apiClientProvider);
    await api.checkHealth();
    final upload = await api.uploadParcelPhoto(File(file.path));
    if (!mounted) return;
    switch (upload) {
      case Success(:final data):
        final url = data;
        final result = await api.post('/drivers/kyc', {'type': type, 'url': url});
        setState(() => _uploadingType = null);
        if (!mounted) return;
        switch (result) {
          case Success():
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text('$label envoyé pour validation')),
            );
          case Failure(:final error):
            setState(() => _error = error.message);
        }
      case Failure(:final error):
        setState(() {
          _uploadingType = null;
          _error = error.message;
        });
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
            'Photographiez vos documents pour validation',
            style: TextStyle(color: MovaColors.textSecondary),
          ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            MovaErrorBanner(message: _error!),
          ],
          const SizedBox(height: 24),
          ..._docs.map(
            (doc) => Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: MovaButton(
                label: 'Photographier — ${doc.$2}',
                isSecondary: true,
                isLoading: _uploadingType == doc.$1,
                icon: Icons.camera_alt,
                onPressed: _uploadingType != null ? null : () => _upload(doc.$1, doc.$2),
              ),
            ),
          ),
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
              children: [
                _earningsRow('Aujourd\'hui', _data!['todayCdf']),
                _earningsRow('Cette semaine', _data!['weekCdf']),
                _earningsRow('Ce mois', _data!['monthCdf']),
                _earningsRow('Total', _data!['totalCdf']),
                if (_data!['rideCount'] != null)
                  _earningsRow('Courses', _data!['rideCount']),
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

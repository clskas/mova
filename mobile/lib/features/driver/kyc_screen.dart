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

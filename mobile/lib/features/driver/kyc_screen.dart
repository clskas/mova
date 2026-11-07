import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/api/api_client.dart';
import '../../core/error/result.dart';
import '../../core/safety/sos_helper.dart';
import 'driver_onboarding_screen.dart';
import '../../core/i18n/i18n.dart';

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
    final desc = _descController.text.trim();
    if (desc.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(tr('Décrivez la situation'))),
      );
      return;
    }
    setState(() => _loading = true);
    if (_type == 'SOS') {
      await triggerSosAlert(
        ref,
        context,
        description: 'SOS chauffeur — $desc',
      );
      if (mounted) {
        setState(() => _loading = false);
        Navigator.pop(context);
      }
      return;
    }
    final api = ref.read(apiClientProvider);
    final result = await api.post('/incidents', {
      'type': _type,
      'description': desc,
    });
    if (!mounted) return;
    setState(() => _loading = false);
    switch (result) {
      case Success():
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(tr('Incident signalé'))),
        );
        Navigator.pop(context);
      case Failure(:final error):
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(tr(error.message))),
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
      title: tr('Signaler un incident'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          DropdownButtonFormField<String>(
            value: _type,
            decoration: InputDecoration(labelText: tr('Type')),
            items: [
              DropdownMenuItem(value: 'SOS', child: Text(tr('SOS — urgence'))),
              DropdownMenuItem(value: 'ACCIDENT', child: Text(tr('Accident'))),
              DropdownMenuItem(value: 'HARASSMENT', child: Text(tr('Harcèlement'))),
              DropdownMenuItem(value: 'OTHER', child: Text(tr('Autre'))),
            ],
            onChanged: (v) => setState(() => _type = v ?? 'OTHER'),
          ),
          if (_type == 'SOS') ...[
            const SizedBox(height: 8),
            Text(
              tr('Urgence : votre position GPS sera envoyée à l\'équipe SENGA (SMS + admin).'),
              style: TextStyle(fontSize: 13, color: MovaColors.red.withValues(alpha: 0.9)),
            ),
          ],
          const SizedBox(height: 12),
          TextField(
            controller: _descController,
            maxLines: 4,
            decoration: InputDecoration(labelText: tr('Description')),
          ),
          const SizedBox(height: 16),
          MovaButton(
            label: _type == 'SOS' ? tr('Envoyer SOS') : tr('Envoyer'),
            isLoading: _loading,
            onPressed: _loading ? null : _submit,
          ),
        ],
      ),
    );
  }
}

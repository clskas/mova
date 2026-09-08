import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/error/result.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import '../auth/widgets/six_digit_pin_field.dart';

/// Fenêtre bloquante : PIN d'activation après KYC OK (`issueLoginPin`).
/// Distinct du PIN de connexion quotidien et de l'OTP Google.
class DriverActivationPinScreen extends ConsumerStatefulWidget {
  const DriverActivationPinScreen({
    super.key,
    required this.onActivated,
    this.onOpenDossier,
  });

  final Future<void> Function(BuildContext pinContext) onActivated;
  final void Function(BuildContext pinContext)? onOpenDossier;

  @override
  ConsumerState<DriverActivationPinScreen> createState() => _DriverActivationPinScreenState();
}

class _DriverActivationPinScreenState extends ConsumerState<DriverActivationPinScreen> {
  final _pinController = TextEditingController();
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _pinController.addListener(_onPinChanged);
  }

  void _onPinChanged() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _pinController.removeListener(_onPinChanged);
    _pinController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final pin = _pinController.text.trim();
    if (pin.length != 6) {
      setState(() => _error = 'Le code PIN doit contenir 6 chiffres.');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    final api = ref.read(apiClientProvider);
    final result = await api.post('/drivers/activation-pin', {'pin': pin});
    if (!mounted) return;
    setState(() => _loading = false);
    switch (result) {
      case Success():
        FocusManager.instance.primaryFocus?.unfocus();
        await widget.onActivated(context);
      case Failure(:final error):
        setState(() => _error = error.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      child: MovaScreen(
        title: 'Code PIN d\'activation',
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Icon(Icons.lock_outline, size: 56, color: MovaColors.violet),
            const SizedBox(height: 16),
            Text(
              'Code PIN d\'activation',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: MovaColors.midnight,
                  ),
            ),
            const SizedBox(height: 8),
            const Text(
              'Votre dossier KYC est validé. Saisissez le code à 6 chiffres envoyé par SMS ou e-mail pour commencer à travailler. Ce n\'est pas un code Google.',
              textAlign: TextAlign.center,
              style: TextStyle(color: MovaColors.textSecondary),
            ),
            const SizedBox(height: 28),
            SixDigitPinField(
              controller: _pinController,
              label: 'Code PIN d\'activation (6 chiffres)',
              autofocus: true,
            ),
            if (_error != null) ...[
              const SizedBox(height: 16),
              MovaErrorBanner(message: _error!),
            ],
            const SizedBox(height: 24),
            MovaButton(
              label: 'Activer le compte',
              isLoading: _loading,
              onPressed: _pinController.text.trim().length == 6 ? _submit : null,
              icon: Icons.check,
            ),
            if (widget.onOpenDossier != null) ...[
              const SizedBox(height: 12),
              TextButton(
                onPressed: () => widget.onOpenDossier!(context),
                child: const Text('Ouvrir mon dossier'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

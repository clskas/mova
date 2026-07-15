import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_client.dart';
import '../../core/error/result.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import 'widgets/six_digit_pin_field.dart';

/// Configuration du code PIN local après la première connexion SMS.
class LocalPinSetupScreen extends ConsumerStatefulWidget {
  const LocalPinSetupScreen({
    super.key,
    required this.onCompleted,
    this.title = 'Créer votre code PIN',
  });

  final Future<void> Function() onCompleted;
  final String title;

  @override
  ConsumerState<LocalPinSetupScreen> createState() => _LocalPinSetupScreenState();
}

class _LocalPinSetupScreenState extends ConsumerState<LocalPinSetupScreen> {
  final _pinController = TextEditingController();
  final _confirmController = TextEditingController();
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _pinController.dispose();
    _confirmController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final pin = _pinController.text.trim();
    final confirm = _confirmController.text.trim();
    if (pin.length != 6 || confirm.length != 6) {
      setState(() => _error = 'Le code PIN doit contenir 6 chiffres.');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    final api = ref.read(apiClientProvider);
    final result = await api.post('/auth/pin/setup', {
      'pin': pin,
      'confirmPin': confirm,
    });
    if (!mounted) return;
    setState(() => _loading = false);
    switch (result) {
      case Success():
        // Retirer le focus (fermer le clavier) avant la navigation : sinon le
        // TextField encore focalisé est détruit pendant pop/pushReplacement et
        // déclenche l'assertion Flutter `InheritedElement._dependents.isEmpty`.
        FocusManager.instance.primaryFocus?.unfocus();
        await widget.onCompleted();
      case Failure(:final error):
        setState(() => _error = error.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    return MovaScreen(
      title: widget.title,
      centerContent: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Icon(Icons.lock_outline, size: 56, color: MovaColors.violet),
          const SizedBox(height: 16),
          Text(
            'Choisissez un code PIN à 6 chiffres',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.bold,
                  color: MovaColors.midnight,
                ),
          ),
          const SizedBox(height: 8),
          const Text(
            'Vous l\'utiliserez pour vous reconnecter sans SMS.',
            textAlign: TextAlign.center,
            style: TextStyle(color: MovaColors.textSecondary),
          ),
          const SizedBox(height: 28),
          SixDigitPinField(
            controller: _pinController,
            label: 'Nouveau code PIN',
            autofocus: true,
          ),
          const SizedBox(height: 16),
          SixDigitPinField(
            controller: _confirmController,
            label: 'Confirmer le code PIN',
          ),
          if (_error != null) ...[
            const SizedBox(height: 16),
            MovaErrorBanner(message: _error!),
          ],
          const SizedBox(height: 24),
          MovaButton(
            label: 'Enregistrer mon PIN',
            isLoading: _loading,
            onPressed: _submit,
            icon: Icons.check,
          ),
        ],
      ),
    );
  }
}

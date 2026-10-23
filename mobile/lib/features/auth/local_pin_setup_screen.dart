import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_client.dart';
import '../../core/error/result.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import 'pin_session.dart';
import 'widgets/six_digit_pin_field.dart';

/// PIN de connexion after the first SMS or Google email code — not the driver KYC activation PIN.
class LocalPinSetupScreen extends ConsumerStatefulWidget {
  const LocalPinSetupScreen({
    super.key,
    required this.onCompleted,
    this.onCancel,
    this.title = connectionPinHeadingFr,
    this.reset = false,
  });

  final Future<void> Function() onCompleted;
  /// Called when the user dismisses without saving (X / system back) and no route to pop.
  final VoidCallback? onCancel;
  final String title;
  final bool reset;

  @override
  ConsumerState<LocalPinSetupScreen> createState() => _LocalPinSetupScreenState();
}

class _LocalPinSetupScreenState extends ConsumerState<LocalPinSetupScreen> {
  final _pinController = TextEditingController();
  final _confirmController = TextEditingController();
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _pinController.addListener(_onPinChanged);
    _confirmController.addListener(_onPinChanged);
  }

  void _onPinChanged() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _pinController.removeListener(_onPinChanged);
    _confirmController.removeListener(_onPinChanged);
    _pinController.dispose();
    _confirmController.dispose();
    super.dispose();
  }

  void _dismiss() {
    FocusManager.instance.primaryFocus?.unfocus();
    final nav = Navigator.of(context);
    if (nav.canPop()) {
      nav.pop();
      return;
    }
    widget.onCancel?.call();
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
    return PopScope(
      canPop: true,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _dismiss();
      },
      child: Scaffold(
        resizeToAvoidBottomInset: true,
        appBar: AppBar(
          leading: IconButton(
            icon: const Icon(Icons.close),
            tooltip: 'Fermer',
            onPressed: _dismiss,
          ),
          title: Text(
            widget.title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ),
        body: SafeArea(
          child: LayoutBuilder(
            builder: (context, constraints) {
              return SingleChildScrollView(
                physics: kMovaScrollPhysics,
                keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
                child: ConstrainedBox(
                  constraints: BoxConstraints(minHeight: constraints.maxHeight),
                  child: Align(
                    alignment: Alignment.center,
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 420),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            const Icon(Icons.lock_outline, size: 56, color: MovaColors.violet),
                            const SizedBox(height: 16),
                            Text(
                              widget.title,
                              textAlign: TextAlign.center,
                              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                                    fontWeight: FontWeight.bold,
                                    color: MovaColors.midnight,
                                  ),
                            ),
                            const SizedBox(height: 8),
                            Text(
                              widget.reset
                                  ? 'Obligatoire pour les prochaines connexions. 6 chiffres — évitez 123456 ou des chiffres identiques.'
                                  : pinSetupHintFr,
                              textAlign: TextAlign.center,
                              style: const TextStyle(color: MovaColors.textSecondary),
                            ),
                            const SizedBox(height: 28),
                            SixDigitPinField(
                              controller: _pinController,
                              label: 'Nouveau PIN',
                              autofocus: true,
                            ),
                            const SizedBox(height: 16),
                            SixDigitPinField(
                              controller: _confirmController,
                              label: 'Confirmer le PIN',
                            ),
                            if (_error != null) ...[
                              const SizedBox(height: 16),
                              MovaErrorBanner(message: _error!),
                            ],
                            const SizedBox(height: 24),
                            MovaButton(
                              label: 'Enregistrer le PIN',
                              isLoading: _loading,
                              onPressed: _pinController.text.trim().length == 6 &&
                                      _confirmController.text.trim().length == 6
                                  ? _submit
                                  : null,
                              icon: Icons.check,
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              );
            },
          ),
        ),
      ),
    );
  }
}

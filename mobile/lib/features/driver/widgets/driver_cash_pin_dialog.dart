import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Résultat de validation du PIN côté API.
typedef PinValidationResult = ({bool ok, String? message});

/// Saisie du code PIN passager (livraison ou paiement espèces).
class DriverCashPinDialog extends StatefulWidget {
  const DriverCashPinDialog({
    super.key,
    this.title = 'Confirmer espèces',
    this.label = 'Code PIN passager',
    this.validate,
  });

  final String title;
  final String label;
  final Future<PinValidationResult> Function(String pin)? validate;

  static Future<String?> show(
    BuildContext context, {
    String title = 'Confirmer espèces',
    String label = 'Code PIN passager',
    Future<PinValidationResult> Function(String pin)? validate,
  }) {
    return showDialog<String>(
      context: context,
      barrierDismissible: false,
      builder: (_) => DriverCashPinDialog(
        title: title,
        label: label,
        validate: validate,
      ),
    );
  }

  @override
  State<DriverCashPinDialog> createState() => _DriverCashPinDialogState();
}

class _DriverCashPinDialogState extends State<DriverCashPinDialog> {
  late final TextEditingController _controller;
  String? _error;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController();
    _controller.addListener(_onPinChanged);
  }

  @override
  void dispose() {
    _controller.removeListener(_onPinChanged);
    _controller.dispose();
    super.dispose();
  }

  void _onPinChanged() {
    final pin = _controller.text.trim();
    if (pin.length == 4 && !_submitting) {
      _submit(pin);
    }
  }

  Future<void> _submit(String pin) async {
    if (_submitting || pin.isEmpty) return;
    if (widget.validate == null) {
      if (!mounted) return;
      Navigator.of(context, rootNavigator: true).pop(pin);
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });
    final result = await widget.validate!(pin);
    if (!mounted) return;
    if (result.ok) {
      if (!mounted) return;
      Navigator.of(context, rootNavigator: true).pop(pin);
      return;
    }
    setState(() {
      _submitting = false;
      _error = result.message ?? 'Code PIN incorrect';
      _controller.clear();
    });
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      scrollable: true,
      title: Text(widget.title),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
            controller: _controller,
            keyboardType: TextInputType.number,
            maxLength: 4,
            autofocus: true,
            enabled: !_submitting,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            decoration: InputDecoration(
              labelText: widget.label,
              errorText: _error,
            ),
          ),
          if (_submitting) ...[
            const SizedBox(height: 12),
            const Center(child: CircularProgressIndicator()),
          ],
        ],
      ),
      actions: [
        TextButton(
          onPressed: _submitting ? null : () => Navigator.pop(context),
          child: const Text('Annuler'),
        ),
        if (widget.validate == null)
          TextButton(
            onPressed: _submitting
                ? null
                : () => _submit(_controller.text.trim()),
            child: const Text('Valider'),
          ),
      ],
    );
  }
}

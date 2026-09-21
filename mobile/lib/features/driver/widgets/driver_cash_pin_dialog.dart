import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../core/config/market_config.dart';
import '../../../core/theme/mova_colors.dart';

/// Résultat de validation du PIN côté API.
typedef PinValidationResult = ({bool ok, String? message});

/// Saisie du code PIN passager (livraison ou paiement espèces).
class DriverCashPinDialog extends StatefulWidget {
  const DriverCashPinDialog({
    super.key,
    this.title = 'Confirmer espèces',
    this.label = 'Code PIN passager',
    this.passengerTotalCdf,
    this.driverNetCdf,
    this.validate,
  });

  final String title;
  final String label;
  /// Total que le passager doit remettre (brut course / livraison).
  final int? passengerTotalCdf;
  /// Part nette chauffeur (info secondaire).
  final int? driverNetCdf;
  final Future<PinValidationResult> Function(String pin)? validate;

  static Future<String?> show(
    BuildContext context, {
    String title = 'Confirmer espèces',
    String label = 'Code PIN passager',
    int? passengerTotalCdf,
    int? driverNetCdf,
    Future<PinValidationResult> Function(String pin)? validate,
  }) {
    return showDialog<String>(
      context: context,
      barrierDismissible: false,
      builder: (_) => DriverCashPinDialog(
        title: title,
        label: label,
        passengerTotalCdf: passengerTotalCdf,
        driverNetCdf: driverNetCdf,
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
    final total = widget.passengerTotalCdf;
    final net = widget.driverNetCdf;
    return AlertDialog(
      scrollable: true,
      title: Text(widget.title),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (total != null && total > 0) ...[
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: MovaColors.orange.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: MovaColors.orange.withValues(alpha: 0.35)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'À encaisser auprès du passager',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: MovaColors.textSecondary,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    MarketConfig.formatCdf(total),
                    style: const TextStyle(
                      fontSize: 26,
                      fontWeight: FontWeight.bold,
                      color: MovaColors.orange,
                    ),
                  ),
                  if (net != null && net > 0 && net != total) ...[
                    const SizedBox(height: 6),
                    Text(
                      'Dont votre part nette ~${MarketConfig.formatCdf(net)} '
                      '(le reste = commission SENGA à reverser)',
                      style: const TextStyle(fontSize: 12, color: MovaColors.textSecondary),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 14),
          ],
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

import 'package:flutter/material.dart';

import '../../../core/config/market_config.dart';
import '../../../core/theme/mova_colors.dart';

/// Confirmation « Cash reçu » (sans PIN) — style Uber.
class DriverCashReceivedDialog extends StatefulWidget {
  const DriverCashReceivedDialog({
    super.key,
    this.title = 'Cash reçu ?',
    this.passengerTotalCdf,
    this.driverNetCdf,
    this.confirm,
  });

  final String title;
  final int? passengerTotalCdf;
  final int? driverNetCdf;
  final Future<({bool ok, String? message})> Function()? confirm;

  static Future<bool> show(
    BuildContext context, {
    String title = 'Cash reçu ?',
    int? passengerTotalCdf,
    int? driverNetCdf,
    Future<({bool ok, String? message})> Function()? confirm,
  }) async {
    final result = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (_) => DriverCashReceivedDialog(
        title: title,
        passengerTotalCdf: passengerTotalCdf,
        driverNetCdf: driverNetCdf,
        confirm: confirm,
      ),
    );
    return result == true;
  }

  @override
  State<DriverCashReceivedDialog> createState() => _DriverCashReceivedDialogState();
}

class _DriverCashReceivedDialogState extends State<DriverCashReceivedDialog> {
  String? _error;
  bool _submitting = false;

  Future<void> _submit() async {
    if (_submitting) return;
    setState(() {
      _submitting = true;
      _error = null;
    });
    final confirm = widget.confirm;
    if (confirm == null) {
      if (mounted) Navigator.pop(context, true);
      return;
    }
    final result = await confirm();
    if (!mounted) return;
    if (result.ok) {
      Navigator.pop(context, true);
      return;
    }
    setState(() {
      _submitting = false;
      _error = result.message ?? 'Confirmation impossible.';
    });
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.title),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (widget.passengerTotalCdf != null && widget.passengerTotalCdf! > 0) ...[
            Text(
              'Montant à encaisser',
              style: TextStyle(color: MovaColors.textSecondary, fontSize: 13),
            ),
            const SizedBox(height: 4),
            Text(
              MarketConfig.formatCdf(widget.passengerTotalCdf!),
              style: const TextStyle(
                fontSize: 26,
                fontWeight: FontWeight.bold,
                color: MovaColors.orange,
              ),
            ),
            if (widget.driverNetCdf != null &&
                widget.driverNetCdf! > 0 &&
                widget.driverNetCdf != widget.passengerTotalCdf) ...[
              const SizedBox(height: 6),
              Text(
                'Votre part nette ~${MarketConfig.formatCdf(widget.driverNetCdf!)}',
                style: const TextStyle(fontSize: 13, color: MovaColors.textSecondary),
              ),
            ],
            const SizedBox(height: 12),
          ],
          const Text(
            'Confirmez uniquement après avoir reçu les espèces du client.',
            style: TextStyle(fontSize: 14),
          ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(_error!, style: const TextStyle(color: Colors.red, fontSize: 13)),
          ],
        ],
      ),
      actions: [
        TextButton(
          onPressed: _submitting ? null : () => Navigator.pop(context, false),
          child: const Text('Annuler'),
        ),
        FilledButton(
          onPressed: _submitting ? null : _submit,
          child: _submitting
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                )
              : const Text('Cash reçu'),
        ),
      ],
    );
  }
}

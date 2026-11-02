import 'package:flutter/material.dart';

import '../../../core/config/market_config.dart';
import '../../../core/theme/mova_colors.dart';

enum CashDialogResult { confirmed, disputed, dismissed }

/// Confirmation « Cash reçu » (sans PIN) — avec option « Cash non reçu » (litige).
class DriverCashReceivedDialog extends StatefulWidget {
  const DriverCashReceivedDialog({
    super.key,
    this.title = 'Cash reçu ?',
    this.passengerTotalCdf,
    this.driverNetCdf,
    this.autoConfirmHours = 24,
    this.confirm,
    this.dispute,
  });

  final String title;
  final int? passengerTotalCdf;
  final int? driverNetCdf;
  final int autoConfirmHours;
  final Future<({bool ok, String? message})> Function()? confirm;
  /// Litige : espèces non reçues (bloque auto-confirm + rebloque le passager).
  final Future<({bool ok, String? message})> Function()? dispute;

  static Future<CashDialogResult> show(
    BuildContext context, {
    String title = 'Cash reçu ?',
    int? passengerTotalCdf,
    int? driverNetCdf,
    int autoConfirmHours = 24,
    Future<({bool ok, String? message})> Function()? confirm,
    Future<({bool ok, String? message})> Function()? dispute,
  }) async {
    final result = await showDialog<CashDialogResult>(
      context: context,
      barrierDismissible: false,
      builder: (_) => DriverCashReceivedDialog(
        title: title,
        passengerTotalCdf: passengerTotalCdf,
        driverNetCdf: driverNetCdf,
        autoConfirmHours: autoConfirmHours,
        confirm: confirm,
        dispute: dispute,
      ),
    );
    return result ?? CashDialogResult.dismissed;
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
      if (mounted) Navigator.of(context).pop(CashDialogResult.confirmed);
      return;
    }
    final result = await confirm();
    if (!mounted) return;
    if (result.ok) {
      Navigator.of(context).pop(CashDialogResult.confirmed);
      return;
    }
    setState(() {
      _submitting = false;
      _error = result.message ?? 'Confirmation impossible.';
    });
  }

  Future<void> _dispute() async {
    if (_submitting) return;
    final dispute = widget.dispute;
    if (dispute == null) return;
    final sure = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Cash non reçu ?'),
        content: const Text(
          'Le passager sera notifié et bloqué pour de nouvelles courses jusqu’à résolution. '
          'N’utilisez ceci que si vous n’avez vraiment pas reçu les espèces.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Annuler')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Confirmer litige'),
          ),
        ],
      ),
    );
    if (sure != true || !mounted) return;
    setState(() {
      _submitting = true;
      _error = null;
    });
    final result = await dispute();
    if (!mounted) return;
    if (result.ok) {
      // Ferme explicitement le dialogue principal (pas seulement la confirmation).
      Navigator.of(context).pop(CashDialogResult.disputed);
      return;
    }
    setState(() {
      _submitting = false;
      _error = result.message ?? 'Impossible d’enregistrer le litige.';
    });
  }

  @override
  Widget build(BuildContext context) {
    final hours = widget.autoConfirmHours.clamp(1, 168);
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
          Text(
            'Confirmez uniquement après avoir reçu les espèces du client. '
            'Sans action de votre part, le paiement pourra être clôturé automatiquement après $hours h.',
            style: const TextStyle(fontSize: 14),
          ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(_error!, style: const TextStyle(color: Colors.red, fontSize: 13)),
          ],
        ],
      ),
      actions: [
        if (widget.dispute != null)
          TextButton(
            onPressed: _submitting ? null : _dispute,
            child: Text(
              'Cash non reçu',
              style: TextStyle(color: Colors.red.shade700),
            ),
          ),
        TextButton(
          onPressed: _submitting ? null : () => Navigator.of(context).pop(CashDialogResult.dismissed),
          child: const Text('Plus tard'),
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

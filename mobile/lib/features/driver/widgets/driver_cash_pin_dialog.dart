import 'package:flutter/material.dart';

/// Saisie du code PIN passager (livraison ou paiement espèces).
class DriverCashPinDialog extends StatefulWidget {
  const DriverCashPinDialog({
    super.key,
    this.title = 'Confirmer espèces',
    this.label = 'Code PIN passager',
  });

  final String title;
  final String label;

  static Future<String?> show(
    BuildContext context, {
    String title = 'Confirmer espèces',
    String label = 'Code PIN passager',
  }) {
    return showDialog<String>(
      context: context,
      builder: (_) => DriverCashPinDialog(title: title, label: label),
    );
  }

  @override
  State<DriverCashPinDialog> createState() => _DriverCashPinDialogState();
}

class _DriverCashPinDialogState extends State<DriverCashPinDialog> {
  late final TextEditingController _controller;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.title),
      content: TextField(
        controller: _controller,
        keyboardType: TextInputType.number,
        maxLength: 4,
        autofocus: true,
        decoration: InputDecoration(labelText: widget.label),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Annuler'),
        ),
        TextButton(
          onPressed: () => Navigator.pop(context, _controller.text.trim()),
          child: const Text('Valider'),
        ),
      ],
    );
  }
}

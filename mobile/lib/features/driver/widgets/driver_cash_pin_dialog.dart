import 'package:flutter/material.dart';

/// Saisie du code PIN passager pour confirmer un paiement espèces (chauffeur).
class DriverCashPinDialog extends StatefulWidget {
  const DriverCashPinDialog({super.key});

  static Future<String?> show(BuildContext context) {
    return showDialog<String>(
      context: context,
      builder: (_) => const DriverCashPinDialog(),
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
      title: const Text('Confirmer espèces'),
      content: TextField(
        controller: _controller,
        keyboardType: TextInputType.number,
        maxLength: 4,
        autofocus: true,
        decoration: const InputDecoration(labelText: 'Code PIN passager'),
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

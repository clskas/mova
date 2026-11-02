import 'package:flutter/material.dart';

import '../../core/error/result.dart';
import '../../core/widgets/mova_widgets.dart';

Future<void> showCashClaimResult({
  required BuildContext context,
  required Result<Map<String, dynamic>> claim,
  required VoidCallback onClaimed,
}) async {
  if (!context.mounted) return;
  final msg = switch (claim) {
    Success(:final data) => () {
        onClaimed();
        return data['message']?.toString() ??
            'Déclaration enregistrée. Le chauffeur ou le livreur doit confirmer « J’ai reçu les espèces ».';
      }(),
    Failure(:final error) => error.message,
  };
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
}

/// Déclaration passager « j’ai payé en espèces » (reçu, suivi, ou litige).
class CashPaidClaimButton extends StatelessWidget {
  const CashPaidClaimButton({super.key, required this.claimed, required this.onPressed});

  final bool claimed;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return MovaButton(
      label: claimed ? 'Déclaration espèces envoyée' : 'J\'ai payé en espèces',
      isSecondary: true,
      icon: Icons.payments_outlined,
      onPressed: claimed ? null : onPressed,
    );
  }
}

import 'package:flutter/material.dart';

import '../../../core/config/market_config.dart';
import '../../../core/theme/mova_colors.dart';

/// Fenêtre de confirmation PIN espèces (passager — livraisons & courses).
Future<bool> showCashPinConfirmDialog(
  BuildContext context, {
  required String pin,
  required int amountCdf,
  String peerLabel = 'livreur',
}) async {
  final result = await showDialog<bool>(
    context: context,
    barrierDismissible: false,
    builder: (ctx) => AlertDialog(
      scrollable: true,
      title: const Text('Paiement espèces'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            MarketConfig.formatCdf(amountCdf),
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.bold,
              color: MovaColors.green,
            ),
          ),
          const SizedBox(height: 12),
          Text(
            'Remettez l\'argent au $peerLabel, puis communiquez-lui ce code PIN :',
            textAlign: TextAlign.center,
            style: const TextStyle(color: MovaColors.textSecondary, fontSize: 13),
          ),
          const SizedBox(height: 16),
          Text(
            pin,
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 32,
              fontWeight: FontWeight.bold,
              letterSpacing: 8,
              color: MovaColors.green,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Le $peerLabel saisit ce code dans son application pour confirmer le paiement.',
            textAlign: TextAlign.center,
            style: TextStyle(color: MovaColors.textSecondary.withValues(alpha: 0.9), fontSize: 12),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(ctx, false),
          child: const Text('Changer de mode'),
        ),
        ElevatedButton(
          onPressed: () => Navigator.pop(ctx, true),
          child: const Text('Confirmer le paiement'),
        ),
      ],
    ),
  );
  return result == true;
}

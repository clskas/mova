import 'package:flutter/material.dart';

import '../../core/theme/mova_colors.dart';
import '../billing/receipt_screen.dart';

final _receiptMeta = RegExp(r'\[mova-receipt:([A-Z_]+):([^\]]+)\]');

String deliveryChatRoleLabel(String role) {
  return switch (role) {
    'passenger' => 'Client',
    'driver' => 'Livreur',
    'partner' => 'Restaurant',
    _ => role,
  };
}

bool isReceiptChatMessage(String text) {
  final t = text.trim();
  return t.startsWith('📄 Reçu SENGA') ||
      t.startsWith('📄 Facture SENGA') ||
      _receiptMeta.hasMatch(text);
}

class ReceiptChatRef {
  const ReceiptChatRef({required this.type, required this.id});
  final String type;
  final String id;
}

ReceiptChatRef? parseReceiptChatRef(
  String text, {
  String? fallbackType,
  String? fallbackId,
}) {
  final match = _receiptMeta.firstMatch(text);
  if (match != null) {
    return ReceiptChatRef(type: match.group(1)!, id: match.group(2)!);
  }
  if (fallbackType != null && fallbackId != null && isReceiptChatMessage(text)) {
    return ReceiptChatRef(type: fallbackType, id: fallbackId);
  }
  return null;
}

/// Texte affiché sans la ligne metadata machine.
String receiptChatDisplayText(String text) {
  return text.replaceAll(_receiptMeta, '').trimRight();
}

void openReceiptFromChat(BuildContext context, ReceiptChatRef ref) {
  final type = ref.type.toUpperCase();
  if (type == 'RIDE') {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => ReceiptScreen(rideId: ref.id)),
    );
    return;
  }
  Navigator.push(
    context,
    MaterialPageRoute(
      builder: (_) => ReceiptScreen(serviceType: type, serviceId: ref.id),
    ),
  );
}

Widget buildChatMessageBubble({
  required BuildContext context,
  required String text,
  required bool isMine,
  String? senderRoleLabel,
  String? fallbackReceiptType,
  String? fallbackReceiptId,
  double maxWidthFactor = 0.75,
}) {
  final receipt = parseReceiptChatRef(
    text,
    fallbackType: fallbackReceiptType,
    fallbackId: fallbackReceiptId,
  );
  final maxWidth = MediaQuery.sizeOf(context).width * maxWidthFactor;

  if (receipt != null) {
    final display = receiptChatDisplayText(text);
    return Align(
      alignment: isMine ? Alignment.centerRight : Alignment.centerLeft,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: () => openReceiptFromChat(context, receipt),
          borderRadius: BorderRadius.circular(12),
          child: Container(
            margin: const EdgeInsets.symmetric(vertical: 4, horizontal: 4),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            constraints: BoxConstraints(maxWidth: maxWidth),
            decoration: BoxDecoration(
              color: isMine
                  ? MovaColors.violet.withValues(alpha: 0.18)
                  : MovaColors.cloud,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: MovaColors.violet.withValues(alpha: 0.45),
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(Icons.receipt_long, color: MovaColors.violet, size: 20),
                    const SizedBox(width: 6),
                    const Expanded(
                      child: Text(
                        'Reçu de paiement',
                        style: TextStyle(fontWeight: FontWeight.w600, color: MovaColors.violet),
                      ),
                    ),
                    Icon(Icons.open_in_new, size: 16, color: MovaColors.violet.withValues(alpha: 0.8)),
                  ],
                ),
                if (display.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Text(
                    display,
                    style: const TextStyle(fontSize: 13, height: 1.35),
                  ),
                ],
                const SizedBox(height: 4),
                Text(
                  'Appuyer pour ouvrir',
                  style: TextStyle(fontSize: 11, color: MovaColors.textSecondary.withValues(alpha: 0.9)),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  return Align(
    alignment: isMine ? Alignment.centerRight : Alignment.centerLeft,
    child: Container(
      margin: const EdgeInsets.symmetric(vertical: 4, horizontal: 4),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      constraints: BoxConstraints(maxWidth: maxWidth),
      decoration: BoxDecoration(
        color: isMine
            ? MovaColors.violet.withValues(alpha: 0.15)
            : MovaColors.cloud,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: isMine
              ? MovaColors.violet.withValues(alpha: 0.3)
              : MovaColors.textSecondary.withValues(alpha: 0.25),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          if (senderRoleLabel != null && senderRoleLabel.isNotEmpty) ...[
            Text(
              senderRoleLabel,
              style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w600,
                color: MovaColors.textSecondary.withValues(alpha: 0.9),
              ),
            ),
            const SizedBox(height: 2),
          ],
          Text(text),
        ],
      ),
    ),
  );
}

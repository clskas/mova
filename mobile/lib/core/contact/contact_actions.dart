import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../theme/mova_colors.dart';

/// Digits only for tel:/wa.me (keeps leading country code).
String? dialablePhoneDigits(String? raw) {
  final trimmed = raw?.trim() ?? '';
  if (trimmed.isEmpty || trimmed.contains('*')) return null;
  final digits = trimmed.replaceAll(RegExp(r'[^\d+]'), '');
  if (digits.isEmpty) return null;
  return digits;
}

String? whatsappMeUrl(String? raw) {
  final digits = dialablePhoneDigits(raw);
  if (digits == null) return null;
  final wa = digits.startsWith('+') ? digits.substring(1) : digits.replaceFirst(RegExp(r'^0+'), '243');
  if (wa.isEmpty) return null;
  return 'https://wa.me/$wa';
}

Future<void> launchPhoneCall(String? raw) async {
  final digits = dialablePhoneDigits(raw);
  if (digits == null) return;
  final uri = Uri.parse('tel:$digits');
  if (await canLaunchUrl(uri)) {
    await launchUrl(uri);
  }
}

Future<void> launchWhatsApp(String? raw) async {
  final url = whatsappMeUrl(raw);
  if (url == null) return;
  final uri = Uri.parse(url);
  if (await canLaunchUrl(uri)) {
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }
}

/// Sheet: Appeler + WhatsApp when a real phone number is available.
Future<void> showCallWhatsAppSheet(
  BuildContext context, {
  required String? phone,
  String peerLabel = 'Contact',
}) async {
  final digits = dialablePhoneDigits(phone);
  if (digits == null) {
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Numéro $peerLabel indisponible')),
    );
    return;
  }

  if (!context.mounted) return;
  await showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    builder: (ctx) {
      return SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Contacter $peerLabel',
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 4),
              Text(
                digits,
                style: const TextStyle(color: MovaColors.textSecondary, fontSize: 14),
              ),
              const SizedBox(height: 16),
              ListTile(
                leading: const Icon(Icons.phone, color: MovaColors.green),
                title: const Text('Appeler'),
                onTap: () async {
                  Navigator.pop(ctx);
                  await launchPhoneCall(digits);
                },
              ),
              ListTile(
                leading: const Icon(Icons.chat, color: Color(0xFF25D366)),
                title: const Text('WhatsApp'),
                onTap: () async {
                  Navigator.pop(ctx);
                  await launchWhatsApp(digits);
                  if (!context.mounted) return;
                  if (whatsappMeUrl(digits) == null) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Impossible d\'ouvrir WhatsApp')),
                    );
                  }
                },
              ),
            ],
          ),
        ),
      );
    },
  );
}

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/theme/mova_colors.dart';

/// Affiche le téléphone conducteur (masqué ou complet) et lance un appel si possible.
Future<void> showCarpoolContact(BuildContext context, {String? contactPhone}) async {
  final phone = contactPhone?.trim();
  if (phone == null || phone.isEmpty) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Numéro conducteur indisponible pour le moment.')),
    );
    return;
  }

  final dialable = !phone.contains('*');
  if (dialable) {
    final uri = Uri.parse('tel:$phone');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
      return;
    }
  }

  if (!context.mounted) return;
  showDialog<void>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: const Text('Contacter le conducteur'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.phone_outlined, color: MovaColors.violet),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  phone,
                  style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            dialable
                ? 'Impossible d\'ouvrir l\'application téléphone sur cet appareil.'
                : 'Numéro masqué jusqu\'à confirmation de la réservation. '
                    'Le numéro complet sera visible une fois votre place confirmée.',
            style: const TextStyle(color: MovaColors.textSecondary, fontSize: 13),
          ),
        ],
      ),
      actions: [
        if (dialable)
          TextButton(
            onPressed: () async {
              final uri = Uri.parse('tel:$phone');
              if (await canLaunchUrl(uri)) await launchUrl(uri);
            },
            child: const Text('Appeler'),
          ),
        TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Fermer')),
      ],
    ),
  );
}

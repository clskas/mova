import 'package:flutter/material.dart';
import '../core/theme/mova_colors.dart';

/// Champ code promo réutilisable sur les écrans de commande.
class PromoCodeField extends StatelessWidget {
  const PromoCodeField({
    super.key,
    required this.controller,
    this.onChanged,
    this.compact = false,
    this.margin = const EdgeInsets.only(bottom: 12),
  });

  final TextEditingController controller;
  final VoidCallback? onChanged;
  final bool compact;
  final EdgeInsets margin;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: margin,
      child: TextField(
        controller: controller,
        textCapitalization: TextCapitalization.characters,
        style: compact ? const TextStyle(fontSize: 14) : null,
        decoration: InputDecoration(
          isDense: compact,
          labelText: compact ? 'Code promo' : 'Code promo (optionnel)',
          hintText: 'Ex. MOVA10',
          labelStyle: compact ? const TextStyle(fontSize: 13) : null,
          prefixIcon: Icon(Icons.local_offer_outlined, size: compact ? 20 : 24),
        ),
        onChanged: (_) => onChanged?.call(),
      ),
    );
  }
}

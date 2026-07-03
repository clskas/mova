import 'package:flutter/material.dart';
import '../core/theme/mova_colors.dart';

/// Champ code promo réutilisable sur les écrans de commande.
class PromoCodeField extends StatelessWidget {
  const PromoCodeField({
    super.key,
    required this.controller,
    this.onChanged,
    this.margin = const EdgeInsets.only(bottom: 12),
  });

  final TextEditingController controller;
  final VoidCallback? onChanged;
  final EdgeInsets margin;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: margin,
      child: TextField(
        controller: controller,
        textCapitalization: TextCapitalization.characters,
        decoration: const InputDecoration(
          labelText: 'Code promo (optionnel)',
          hintText: 'Ex. MOVA10',
          prefixIcon: Icon(Icons.local_offer_outlined),
          isDense: true,
        ),
        onChanged: (_) => onChanged?.call(),
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../core/theme/mova_colors.dart';

/// Champ de saisie d'un code à 6 chiffres (PIN ou OTP).
class SixDigitPinField extends StatelessWidget {
  const SixDigitPinField({
    super.key,
    required this.controller,
    this.label = 'Code à 6 chiffres',
    this.enabled = true,
    this.autofocus = false,
  });

  final TextEditingController controller;
  final String label;
  final bool enabled;
  final bool autofocus;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      keyboardType: TextInputType.number,
      maxLength: 6,
      autofocus: autofocus,
      enabled: enabled,
      obscureText: true,
      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
      decoration: InputDecoration(
        labelText: label,
        prefixIcon: const Icon(Icons.pin_outlined),
        counterText: '',
      ),
      style: const TextStyle(
        fontSize: 22,
        letterSpacing: 8,
        fontWeight: FontWeight.w600,
        color: MovaColors.midnight,
      ),
      textAlign: TextAlign.center,
    );
  }
}

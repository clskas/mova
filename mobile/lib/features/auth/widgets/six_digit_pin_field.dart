import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../../core/theme/mova_colors.dart';

/// Champ de saisie d'un code à 6 chiffres (PIN local ou OTP SMS/e-mail).
///
/// Pour un OTP SMS, passer [forOneTimeCode] afin d’activer l’autofill système
/// (bannière « De Messages » / clavier Android, comme WhatsApp).
class SixDigitPinField extends StatelessWidget {
  const SixDigitPinField({
    super.key,
    required this.controller,
    this.label = 'Code à 6 chiffres',
    this.enabled = true,
    this.autofocus = false,
    this.forOneTimeCode = false,
    this.onCompleted,
  });

  final TextEditingController controller;
  final String label;
  final bool enabled;
  final bool autofocus;

  /// OTP SMS / e-mail : suggestion automatique du code (pas pour le PIN local).
  final bool forOneTimeCode;

  /// Appelé quand les 6 chiffres sont saisis (autofill ou clavier).
  final ValueChanged<String>? onCompleted;

  @override
  Widget build(BuildContext context) {
    final field = TextField(
      controller: controller,
      // number + oneTimeCode: iOS Security Code AutoFill + Android SMS suggestion.
      keyboardType: TextInputType.number,
      maxLength: 6,
      autofocus: autofocus,
      enabled: enabled,
      // obscureText bloque l’autofill OTP sur iOS/Android — uniquement pour le PIN.
      obscureText: !forOneTimeCode,
      autocorrect: false,
      enableSuggestions: forOneTimeCode,
      autofillHints: forOneTimeCode
          ? const [AutofillHints.oneTimeCode]
          : const [AutofillHints.password],
      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
      textInputAction: TextInputAction.done,
      decoration: InputDecoration(
        labelText: label,
        prefixIcon: Icon(
          forOneTimeCode ? Icons.sms_outlined : Icons.pin_outlined,
        ),
        counterText: '',
        helperText: forOneTimeCode
            ? 'Le code SMS se remplit automatiquement — acceptez la suggestion'
            : null,
        helperMaxLines: 2,
      ),
      style: const TextStyle(
        fontSize: 22,
        letterSpacing: 8,
        fontWeight: FontWeight.w600,
        color: MovaColors.midnight,
      ),
      textAlign: TextAlign.center,
      scrollPadding: const EdgeInsets.fromLTRB(20, 24, 20, 140),
      onChanged: (value) {
        if (value.trim().length == 6) {
          onCompleted?.call(value.trim());
        }
      },
    );

    if (!forOneTimeCode) return field;
    return AutofillGroup(child: field);
  }
}

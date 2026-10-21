import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../../core/theme/mova_colors.dart';

/// Champ de saisie d'un code à 6 chiffres (PIN local ou OTP SMS/e-mail).
///
/// Pour un OTP SMS, passer [forOneTimeCode] afin d’activer l’autofill système
/// (iOS Messages / Android Gboard — suggestion au-dessus du clavier).
class SixDigitPinField extends StatefulWidget {
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
  State<SixDigitPinField> createState() => _SixDigitPinFieldState();
}

class _SixDigitPinFieldState extends State<SixDigitPinField> {
  late final FocusNode _focusNode;

  @override
  void initState() {
    super.initState();
    _focusNode = FocusNode(debugLabel: 'six_digit_otp');
    if (widget.autofocus && widget.forOneTimeCode) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _ensureFocused());
    }
  }

  @override
  void didUpdateWidget(covariant SixDigitPinField oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.autofocus &&
        widget.forOneTimeCode &&
        widget.enabled &&
        (!oldWidget.autofocus || !oldWidget.enabled)) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _ensureFocused());
    }
  }

  void _ensureFocused() {
    if (!mounted || !widget.enabled) return;
    if (!_focusNode.hasFocus) {
      _focusNode.requestFocus();
    }
  }

  @override
  void dispose() {
    _focusNode.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final forOtp = widget.forOneTimeCode;
    final field = TextField(
      controller: widget.controller,
      focusNode: _focusNode,
      // number + oneTimeCode → iOS UITextContentType.oneTimeCode (QuickType bar).
      keyboardType: const TextInputType.numberWithOptions(decimal: false, signed: false),
      maxLength: 6,
      autofocus: widget.autofocus,
      enabled: widget.enabled,
      // obscureText bloque l’autofill OTP sur iOS/Android — uniquement pour le PIN.
      obscureText: !forOtp,
      autocorrect: false,
      enableSuggestions: forOtp,
      enableIMEPersonalizedLearning: false,
      smartDashesType: SmartDashesType.disabled,
      smartQuotesType: SmartQuotesType.disabled,
      autofillHints: forOtp
          ? const [AutofillHints.oneTimeCode]
          : const [AutofillHints.password],
      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
      textInputAction: TextInputAction.done,
      decoration: InputDecoration(
        labelText: widget.label,
        prefixIcon: Icon(
          forOtp ? Icons.sms_outlined : Icons.pin_outlined,
        ),
        counterText: '',
        helperText: forOtp
            ? 'Touchez le code proposé au-dessus du clavier dès réception du SMS'
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
          widget.onCompleted?.call(value.trim());
        }
      },
    );

    if (!forOtp) return field;
    return AutofillGroup(child: field);
  }
}

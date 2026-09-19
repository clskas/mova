import 'package:flutter/material.dart';
import '../../../core/theme/mova_colors.dart';

/// Pavé 6 points + clavier, aligné sur resto/location `PinDigitPad`.
/// Backspace uses a Material icon inside [FittedBox] so the left arrow is not clipped.
class PinDigitPad extends StatelessWidget {
  const PinDigitPad({
    super.key,
    required this.value,
    required this.onChanged,
    this.disabled = false,
    this.accent = MovaColors.violet,
  });

  final String value;
  final ValueChanged<String> onChanged;
  final bool disabled;
  final Color accent;

  static const _keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'];

  void _press(String key) {
    if (disabled || key.isEmpty) return;
    if (key == 'back') {
      if (value.isNotEmpty) onChanged(value.substring(0, value.length - 1));
      return;
    }
    if (value.length < 6) onChanged('$value$key');
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: List.generate(6, (i) {
            final filled = i < value.length;
            return Container(
              margin: const EdgeInsets.symmetric(horizontal: 5),
              width: 14,
              height: 14,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: filled ? accent : const Color(0xFFE5E7EB),
              ),
            );
          }),
        ),
        const SizedBox(height: 20),
        ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 280),
          child: GridView.count(
            crossAxisCount: 3,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 10,
            crossAxisSpacing: 10,
            // Taller cells so the backspace glyph (arrow + X) is not clipped.
            childAspectRatio: 1.25,
            children: [
              for (final key in _keys)
                key.isEmpty
                    ? const SizedBox.shrink()
                    : Material(
                        color: Colors.white,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                          side: const BorderSide(color: Color(0xFFF3F4F6)),
                        ),
                        clipBehavior: Clip.none,
                        child: InkWell(
                          onTap: disabled ? null : () => _press(key),
                          borderRadius: BorderRadius.circular(12),
                          child: Center(
                            child: key == 'back'
                                ? const Padding(
                                    padding: EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                                    child: FittedBox(
                                      fit: BoxFit.scaleDown,
                                      child: Icon(
                                        Icons.backspace_outlined,
                                        size: 28,
                                        color: MovaColors.midnight,
                                      ),
                                    ),
                                  )
                                : Text(
                                    key,
                                    style: const TextStyle(
                                      fontSize: 22,
                                      fontWeight: FontWeight.w600,
                                      color: MovaColors.midnight,
                                    ),
                                  ),
                          ),
                        ),
                      ),
            ],
          ),
        ),
      ],
    );
  }
}

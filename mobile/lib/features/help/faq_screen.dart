import 'package:flutter/material.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import 'help_config.dart';

class FaqScreen extends StatelessWidget {
  const FaqScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return MovaScreen(
      title: 'FAQ',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            '${kFaqItems.length} questions fréquentes',
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: MovaColors.textSecondary,
                ),
          ),
          const SizedBox(height: 12),
          ...kFaqItems.map(
            (item) => Card(
              margin: const EdgeInsets.only(bottom: 8),
              child: ExpansionTile(
                title: Text(
                  item.question,
                  style: const TextStyle(
                    fontWeight: FontWeight.w600,
                    fontSize: 14,
                  ),
                ),
                iconColor: MovaColors.violet,
                collapsedIconColor: MovaColors.violet,
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                    child: Align(
                      alignment: Alignment.centerLeft,
                      child: Text(
                        item.answer,
                        style: const TextStyle(
                          color: MovaColors.textSecondary,
                          height: 1.45,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

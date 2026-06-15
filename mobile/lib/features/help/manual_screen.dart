import 'package:flutter/material.dart';
import '../../core/config/market_config.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import 'help_config.dart';
import 'legal_screen.dart';

class ManualScreen extends StatelessWidget {
  const ManualScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return MovaScreen(
      title: 'Manuel utilisateur',
      actions: [
        IconButton(
          icon: const Icon(Icons.article_outlined),
          tooltip: 'Version complète',
          onPressed: () => Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => const LegalScreen(
                title: 'Manuel complet',
                asset: 'assets/legal/manuel_fr.md',
              ),
            ),
          ),
        ),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Guide pas à pas — ${MarketConfig.coverageLabel}, ${MarketConfig.currency}',
            style: theme.textTheme.bodyMedium?.copyWith(color: MovaColors.textSecondary),
          ),
          const SizedBox(height: 12),
          ...kManualChapters.map((chapter) => _ChapterTile(chapter: chapter)),
        ],
      ),
    );
  }
}

class _ChapterTile extends StatelessWidget {
  const _ChapterTile({required this.chapter});

  final ManualChapter chapter;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ExpansionTile(
        leading: Text(chapter.icon, style: const TextStyle(fontSize: 22)),
        title: Text(
          chapter.title,
          style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
        ),
        iconColor: MovaColors.violet,
        collapsedIconColor: MovaColors.violet,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                ...chapter.steps.asMap().entries.map(
                  (e) => Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          width: 22,
                          height: 22,
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                            color: MovaColors.violet.withValues(alpha: 0.12),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            '${e.key + 1}',
                            style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.bold,
                              color: MovaColors.violet,
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            e.value,
                            style: const TextStyle(height: 1.4),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                if (chapter.tip != null) ...[
                  const SizedBox(height: 4),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: MovaColors.orange.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Icon(Icons.lightbulb_outline, size: 18, color: MovaColors.orange),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            chapter.tip!,
                            style: const TextStyle(fontSize: 13, color: MovaColors.midnight),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

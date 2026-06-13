import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';

class LegalScreen extends StatelessWidget {
  const LegalScreen({super.key, required this.title, required this.asset});

  final String title;
  final String asset;

  @override
  Widget build(BuildContext context) {
    return MovaScreen(
      title: title,
      child: FutureBuilder<String>(
        future: rootBundle.loadString(asset),
        builder: (context, snapshot) {
          if (snapshot.hasError) {
            return const Center(
              child: Text(
                'Document indisponible. Réessayez plus tard.',
                style: TextStyle(color: MovaColors.textSecondary),
              ),
            );
          }
          if (snapshot.hasData) {
            return Markdown(
              data: snapshot.data!,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              styleSheet: MarkdownStyleSheet(
                h1: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.bold,
                      color: MovaColors.midnight,
                    ),
                h2: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w600,
                      color: MovaColors.violet,
                    ),
                p: Theme.of(context).textTheme.bodyMedium,
              ),
            );
          }
          return const Center(child: CircularProgressIndicator(color: MovaColors.violet));
        },
      ),
    );
  }
}

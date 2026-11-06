import 'package:flutter/material.dart';

import '../navigation/mova_navigator.dart';
import '../theme/mova_colors.dart';
import '../widgets/mova_widgets.dart';
import 'i18n.dart';

/// « Langue / Language » card for the profile screen.
class LanguagePickerCard extends StatelessWidget {
  const LanguagePickerCard({super.key});

  Future<void> _choose(BuildContext context, String code) async {
    if (code == appLanguage.value) return;
    await setAppLanguage(code);
    // Rebuild every screen in the new language: back to the app's home.
    final home = movaAppHomeBuilder;
    if (home == null) return;
    movaNavigatorKey.currentState?.pushAndRemoveUntil(
      MaterialPageRoute<void>(builder: (_) => home()),
      (_) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    return MovaCard(
      key: const Key('languagePicker'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.language, color: MovaColors.violet),
              const SizedBox(width: 8),
              Text(tr('Langue de l\'application'), style: const TextStyle(fontWeight: FontWeight.w600)),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            tr('La langue s\'applique à toute l\'app.'),
            style: const TextStyle(fontSize: 12, color: MovaColors.textSecondary),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            children: [
              for (final lang in kAppLanguages)
                ChoiceChip(
                  key: Key('language_${lang.code}'),
                  label: Text(lang.label),
                  selected: appLanguage.value == lang.code,
                  onSelected: (_) => _choose(context, lang.code),
                ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            tr('Lingala et Kiswahili : bientôt disponibles.'),
            style: const TextStyle(fontSize: 12, color: MovaColors.textSecondary),
          ),
        ],
      ),
    );
  }
}

import 'dart:async';

import 'package:flutter/material.dart';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_client.dart';
import '../navigation/mova_navigator.dart';
import '../theme/mova_colors.dart';
import '../widgets/mova_widgets.dart';
import 'i18n.dart';
import 'i18n_remote.dart';

/// « Langue / Language » card for the profile screen. Shows only the languages the super admin
/// left visible; hidden entirely when French is the only one.
class LanguagePickerCard extends StatelessWidget {
  const LanguagePickerCard({super.key});

  Future<void> _choose(BuildContext context, String code) async {
    if (code == appLanguage.value) return;
    final api = ProviderScope.containerOf(context, listen: false).read(apiClientProvider);
    final messenger = ScaffoldMessenger.of(context);
    if (kDownloadedLanguages.contains(code)) {
      // Swahili / Lingala texts come from the server: download them first.
      messenger.showSnackBar(SnackBar(content: Text(tr('Téléchargement de la langue…')), duration: const Duration(seconds: 2)));
      final got = await refreshDownloadedStrings(api, code);
      final saved = await downloadedStringCount(code);
      if (saved == 0) {
        messenger.showSnackBar(
          SnackBar(content: Text(tr('Cette langue n’a pas pu être téléchargée. Vérifiez votre connexion et réessayez.'))),
        );
        return;
      }
      if (got.total > 0 && got.done < got.total * 0.9) {
        messenger.showSnackBar(
          SnackBar(content: Text(tr('Traduction en cours de préparation : certains textes restent en français pour le moment.'))),
        );
      }
    }
    await setAppLanguage(code);
    // Server copy of the choice: push notifications and SMS follow it too.
    unawaited(api.syncLanguageToProfile(force: true));
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
    return ValueListenableBuilder<List<String>>(
      valueListenable: visibleAppLanguages,
      builder: (context, visible, _) {
        final langs = kAppLanguages.where((l) => visible.contains(l.code)).toList();
        if (langs.length <= 1) return const SizedBox.shrink();
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
                runSpacing: 4,
                children: [
                  for (final lang in langs)
                    ChoiceChip(
                      key: Key('language_${lang.code}'),
                      label: Text(lang.label),
                      selected: appLanguage.value == lang.code,
                      onSelected: (_) => _choose(context, lang.code),
                    ),
                ],
              ),
              if (visible.any(kDownloadedLanguages.contains)) ...[
                const SizedBox(height: 6),
                Text(
                  tr('Kiswahili et Lingala : traduits automatiquement, signalez-nous toute erreur.'),
                  style: const TextStyle(fontSize: 12, color: MovaColors.textSecondary),
                ),
              ],
            ],
          ),
        );
      },
    );
  }
}

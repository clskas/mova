import '../../core/i18n/i18n.dart';
import 'assistant_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/auth/session.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import 'contact_support_screen.dart';
import 'faq_screen.dart';
import 'help_config.dart';
import 'legal_screen.dart';
import 'manual_screen.dart';
import '../geo/suggest_place_screen.dart';
import '../profile/profile_screen.dart';
import '../driver/driver_notification_settings_screen.dart';

/// Centre d'aide minimal pour l'application Chauffeur SENGA.
class DriverHelpScreen extends ConsumerWidget {
  const DriverHelpScreen({super.key});

  void _open(BuildContext context, Widget screen) {
    Navigator.push(context, MaterialPageRoute(builder: (_) => screen));
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MovaScreen(
      title: tr('Aide Chauffeur'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            tr('Ressources pour les chauffeurs et livreurs SENGA en RDC.'),
            style: TextStyle(color: MovaColors.textSecondary, height: 1.4),
          ),
          const SizedBox(height: 16),
          ListTile(
            leading: const Icon(Icons.smart_toy_outlined, color: MovaColors.green),
            title: Text(tr('Assistant SENGA (IA)'), style: TextStyle(fontWeight: FontWeight.w600)),
            subtitle: Text(tr('Une question sur l\'app ? Réponse immédiate, dans votre langue')),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => _open(context, const AssistantScreen()),
          ),
          ListTile(
            leading: const Icon(Icons.menu_book_outlined, color: MovaColors.violet),
            title: Text(tr('Manuel utilisateur'), style: TextStyle(fontWeight: FontWeight.w600)),
            subtitle: Text(tr('En ligne, courses, dossier, PIN, revenus')),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => _open(
              context,
              ManualScreen(
                title: tr('Manuel chauffeur'),
                subtitle: tr('Guide SENGA Driver — simple et court'),
                chapters: kDriverManualChapters,
                showFullManual: false,
              ),
            ),
          ),
          ListTile(
            leading: const Icon(Icons.person_outline, color: MovaColors.violet),
            title: Text(tr('Compte et connexion'), style: TextStyle(fontWeight: FontWeight.w600)),
            subtitle: Text(tr('Lier Google ou un numéro +243 — un seul compte chauffeur')),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => _open(context, ProfileScreen(title: tr('Compte et connexion'))),
          ),
          ListTile(
            leading: const Icon(Icons.notifications_outlined, color: MovaColors.orange),
            title: Text(tr('Notifications'), style: TextStyle(fontWeight: FontWeight.w600)),
            subtitle: Text(tr('Mute et choix du son des missions')),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => _open(context, const DriverNotificationSettingsScreen()),
          ),
          ListTile(
            leading: const Icon(Icons.place_outlined, color: MovaColors.green),
            title: Text(tr('Nommer un lieu'), style: TextStyle(fontWeight: FontWeight.w600)),
            subtitle: Text(tr('Chez Mama X, pin GPS — ou marché / hôpital à valider')),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => _open(context, const SuggestPlaceScreen()),
          ),
          ListTile(
            leading: const Icon(Icons.quiz_outlined, color: MovaColors.green),
            title: const Text('FAQ', style: TextStyle(fontWeight: FontWeight.w600)),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => _open(context, const FaqScreen()),
          ),
          ListTile(
            leading: const Icon(Icons.support_agent_outlined, color: MovaColors.orange),
            title: Text(tr('Contacter le support'), style: TextStyle(fontWeight: FontWeight.w600)),
            subtitle: Text(tr('Coordonnées publiées par AfriSoft')),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => _open(context, const ContactSupportScreen()),
          ),
          ListTile(
            leading: const Icon(Icons.gavel_outlined, color: MovaColors.midnight),
            title: Text(tr('CGU & Confidentialité'), style: TextStyle(fontWeight: FontWeight.w600)),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => _open(
              context,
              const LegalScreen(
                title: 'CGU',
                asset: 'assets/legal/cgu_fr.md',
                apiPath: '/public/cgu',
              ),
            ),
          ),
          const SizedBox(height: 16),
          OutlinedButton.icon(
            onPressed: () async {
              final confirm = await showDialog<bool>(
                context: context,
                builder: (ctx) => AlertDialog(
                  title: Text(tr('Déconnexion')),
                  content: Text(tr('Voulez-vous vous déconnecter de SENGA Driver ?')),
                  actions: [
                    TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(tr('Annuler'))),
                    TextButton(
                      onPressed: () => Navigator.pop(ctx, true),
                      child: Text(tr('Déconnexion'), style: TextStyle(color: MovaColors.orange)),
                    ),
                  ],
                ),
              );
              if (confirm == true && context.mounted) {
                await logoutDriver(context, ref);
              }
            },
            icon: const Icon(Icons.logout, color: MovaColors.orange),
            label: Text(tr('Se déconnecter'), style: TextStyle(color: MovaColors.orange)),
          ),
        ],
      ),
    );
  }
}

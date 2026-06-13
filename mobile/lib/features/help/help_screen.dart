import 'package:flutter/material.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import 'contact_support_screen.dart';
import 'faq_screen.dart';
import 'help_config.dart';
import 'legal_screen.dart';
import 'manual_screen.dart';

class HelpScreen extends StatelessWidget {
  const HelpScreen({super.key});

  void _open(BuildContext context, Widget screen) {
    Navigator.push(context, MaterialPageRoute(builder: (_) => screen));
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return MovaScreen(
      title: HelpConfig.hubTitle,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [
                  MovaColors.violet.withValues(alpha: 0.12),
                  MovaColors.green.withValues(alpha: 0.08),
                ],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              children: [
                const Icon(Icons.help_center, color: MovaColors.violet, size: 36),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Aide & Manuel',
                        style: theme.textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.bold,
                          color: MovaColors.midnight,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Documentation, FAQ et support — Kinshasa, RDC',
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: MovaColors.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          _HelpLink(
            icon: Icons.menu_book_outlined,
            iconColor: MovaColors.violet,
            title: 'Manuel utilisateur',
            subtitle: 'Tous les modules MOVA, pas à pas',
            onTap: () => _open(context, const ManualScreen()),
          ),
          _HelpLink(
            icon: Icons.quiz_outlined,
            iconColor: MovaColors.green,
            title: 'FAQ',
            subtitle: '${kFaqItems.length} questions fréquentes',
            onTap: () => _open(context, const FaqScreen()),
          ),
          _HelpLink(
            icon: Icons.support_agent_outlined,
            iconColor: MovaColors.orange,
            title: 'Contacter le support',
            subtitle: HelpConfig.supportPhone,
            onTap: () => _open(context, const ContactSupportScreen()),
          ),
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 8),
            child: Divider(),
          ),
          Text(
            'Documents légaux',
            style: theme.textTheme.labelLarge?.copyWith(color: MovaColors.textSecondary),
          ),
          const SizedBox(height: 4),
          _HelpLink(
            icon: Icons.gavel_outlined,
            iconColor: MovaColors.midnight,
            title: 'Conditions d\'utilisation',
            subtitle: 'CGU MOVA RDC',
            onTap: () => _open(
              context,
              const LegalScreen(title: 'CGU', asset: 'assets/legal/cgu_fr.md'),
            ),
          ),
          _HelpLink(
            icon: Icons.privacy_tip_outlined,
            iconColor: MovaColors.midnight,
            title: 'Politique de confidentialité',
            subtitle: 'Protection de vos données',
            onTap: () => _open(
              context,
              const LegalScreen(title: 'Confidentialité', asset: 'assets/legal/privacy_fr.md'),
            ),
          ),
        ],
      ),
    );
  }
}

class _HelpLink extends StatelessWidget {
  const _HelpLink({
    required this.icon,
    required this.iconColor,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final IconData icon;
  final Color iconColor;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: Icon(icon, color: iconColor),
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Text(
          subtitle,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
        ),
        trailing: const Icon(Icons.chevron_right, color: MovaColors.textSecondary),
        onTap: onTap,
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/config/market_config.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import 'help_config.dart';

class ContactSupportScreen extends StatelessWidget {
  const ContactSupportScreen({super.key});

  Future<void> _launch(BuildContext context, Uri uri) async {
    final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!ok && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Impossible d\'ouvrir le lien')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return MovaScreen(
      title: 'Contacter le support',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          MovaCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(Icons.support_agent, color: MovaColors.violet),
                    const SizedBox(width: 8),
                    Text(
                      'Assistance MOVA',
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  'Notre équipe vous répond en français pour toute question sur vos courses, livraisons ou paiements en CDF.',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: MovaColors.textSecondary,
                    height: 1.4,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          _ContactTile(
            icon: Icons.phone,
            iconColor: MovaColors.green,
            title: 'Téléphone',
            subtitle: HelpConfig.supportPhone,
            onTap: () => _launch(context, Uri.parse('tel:${HelpConfig.supportPhoneDial}')),
          ),
          _ContactTile(
            icon: Icons.email_outlined,
            iconColor: MovaColors.violet,
            title: 'E-mail',
            subtitle: HelpConfig.supportEmail,
            onTap: () => _launch(
              context,
              Uri(
                scheme: 'mailto',
                path: HelpConfig.supportEmail,
                query: 'subject=Assistance MOVA',
              ),
            ),
          ),
          _ContactTile(
            icon: Icons.chat,
            iconColor: const Color(0xFF25D366),
            title: 'WhatsApp',
            subtitle: HelpConfig.supportPhone,
            onTap: () => _launch(context, Uri.parse(HelpConfig.whatsAppUrl)),
          ),
          const SizedBox(height: 8),
          MovaCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Row(
                  children: [
                    Icon(Icons.schedule, color: MovaColors.orange, size: 20),
                    SizedBox(width: 8),
                    Text('Horaires', style: TextStyle(fontWeight: FontWeight.w600)),
                  ],
                ),
                const SizedBox(height: 8),
                Text(HelpConfig.supportHours),
                const SizedBox(height: 4),
                Text(
                  'Fuseau : ${MarketConfig.timezone}',
                  style: const TextStyle(color: MovaColors.textSecondary, fontSize: 13),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          MovaCard(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(Icons.location_on_outlined, color: MovaColors.midnight, size: 20),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    HelpConfig.supportAddress,
                    style: theme.textTheme.bodyMedium,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ContactTile extends StatelessWidget {
  const _ContactTile({
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
        subtitle: Text(subtitle),
        trailing: const Icon(Icons.open_in_new, size: 18, color: MovaColors.textSecondary),
        onTap: onTap,
      ),
    );
  }
}

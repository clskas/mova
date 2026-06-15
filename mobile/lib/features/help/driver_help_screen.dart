import 'package:flutter/material.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import 'contact_support_screen.dart';
import 'faq_screen.dart';
import 'help_config.dart';
import 'legal_screen.dart';

/// Centre d'aide minimal pour l'application Chauffeur MOVA.
class DriverHelpScreen extends StatelessWidget {
  const DriverHelpScreen({super.key});

  void _open(BuildContext context, Widget screen) {
    Navigator.push(context, MaterialPageRoute(builder: (_) => screen));
  }

  @override
  Widget build(BuildContext context) {
    return MovaScreen(
      title: 'Aide Chauffeur',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'Ressources pour les chauffeurs et livreurs MOVA en RDC.',
            style: TextStyle(color: MovaColors.textSecondary, height: 1.4),
          ),
          const SizedBox(height: 16),
          _Tile(
            icon: Icons.verified_user_outlined,
            title: 'Documents KYC',
            subtitle: 'Permis, carte grise, pièce d\'identité — obligatoires avant mise en ligne.',
          ),
          _Tile(
            icon: Icons.toggle_on_outlined,
            title: 'Disponibilité',
            subtitle: 'Activez le switch pour recevoir des courses, colis et repas.',
          ),
          _Tile(
            icon: Icons.account_balance_wallet_outlined,
            title: 'Revenus',
            subtitle: 'Consultez vos gains du jour en CDF et l\'historique des prestations.',
          ),
          const Divider(height: 24),
          ListTile(
            leading: const Icon(Icons.quiz_outlined, color: MovaColors.green),
            title: const Text('FAQ', style: TextStyle(fontWeight: FontWeight.w600)),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => _open(context, const FaqScreen()),
          ),
          ListTile(
            leading: const Icon(Icons.support_agent_outlined, color: MovaColors.orange),
            title: const Text('Contacter le support', style: TextStyle(fontWeight: FontWeight.w600)),
            subtitle: Text(HelpConfig.supportPhone),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => _open(context, const ContactSupportScreen()),
          ),
          ListTile(
            leading: const Icon(Icons.gavel_outlined, color: MovaColors.midnight),
            title: const Text('CGU & Confidentialité', style: TextStyle(fontWeight: FontWeight.w600)),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => _open(
              context,
              const LegalScreen(title: 'CGU', asset: 'assets/legal/cgu_fr.md'),
            ),
          ),
        ],
      ),
    );
  }
}

class _Tile extends StatelessWidget {
  const _Tile({required this.icon, required this.title, required this.subtitle});

  final IconData icon;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: MovaColors.violet, size: 22),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
                const SizedBox(height: 2),
                Text(subtitle, style: const TextStyle(color: MovaColors.textSecondary, fontSize: 13)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/api/api_client.dart';
import '../../core/error/result.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import 'company_contact.dart';

class ContactSupportScreen extends ConsumerStatefulWidget {
  const ContactSupportScreen({super.key});

  @override
  ConsumerState<ContactSupportScreen> createState() => _ContactSupportScreenState();
}

class _ContactSupportScreenState extends ConsumerState<ContactSupportScreen> {
  bool _loading = true;
  String? _error;
  List<CompanyContact> _contacts = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final result = await ref.read(apiClientProvider).getCompanyContacts();
    if (!mounted) return;
    switch (result) {
      case Success(:final data):
        setState(() {
          _contacts = data.map(CompanyContact.fromJson).toList();
          _loading = false;
        });
      case Failure():
        setState(() {
          _contacts = const [];
          _loading = false;
          _error = 'Impossible de charger les contacts.';
        });
    }
  }

  Future<void> _launch(Uri uri) async {
    final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!ok && mounted) {
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
                      'Assistance SENGA',
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  'Les coordonnées ci-dessous sont celles publiées par AfriSoft. Si la liste est vide, aucun contact n\'a encore été ajouté.',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: MovaColors.textSecondary,
                    height: 1.4,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          if (_loading)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 32),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (_error != null)
            MovaCard(
              child: Column(
                children: [
                  Text(_error!, style: const TextStyle(color: MovaColors.textSecondary)),
                  const SizedBox(height: 8),
                  TextButton(onPressed: _load, child: const Text('Réessayer')),
                ],
              ),
            )
          else if (_contacts.isEmpty)
            const MovaCard(
              child: Text(
                'Aucun contact pour le moment.',
                textAlign: TextAlign.center,
                style: TextStyle(color: MovaColors.textSecondary, height: 1.4),
              ),
            )
          else
            ..._contacts.map((contact) => _ContactCard(
                  contact: contact,
                  onLaunch: _launch,
                )),
        ],
      ),
    );
  }
}

class _ContactCard extends StatelessWidget {
  const _ContactCard({required this.contact, required this.onLaunch});

  final CompanyContact contact;
  final Future<void> Function(Uri uri) onLaunch;

  @override
  Widget build(BuildContext context) {
    final subtitle = [
      if (contact.title != null) contact.title!,
      if (contact.department != null) contact.department!,
    ].join(' · ');

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: MovaCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(contact.name, style: const TextStyle(fontWeight: FontWeight.w700)),
            if (subtitle.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(subtitle, style: const TextStyle(color: MovaColors.textSecondary, fontSize: 13)),
            ],
            if (contact.notes != null) ...[
              const SizedBox(height: 4),
              Text(contact.notes!, style: const TextStyle(color: MovaColors.textSecondary, fontSize: 13)),
            ],
            const SizedBox(height: 8),
            if (contact.phone != null)
              _ContactTile(
                icon: Icons.phone,
                iconColor: MovaColors.green,
                title: 'Téléphone',
                subtitle: contact.phone!,
                onTap: () {
                  final uri = contact.telUri;
                  if (uri != null) onLaunch(Uri.parse(uri));
                },
              ),
            if (contact.email != null)
              _ContactTile(
                icon: Icons.email_outlined,
                iconColor: MovaColors.violet,
                title: 'E-mail',
                subtitle: contact.email!,
                onTap: () {
                  final uri = contact.mailtoUri;
                  if (uri != null) onLaunch(Uri.parse(uri));
                },
              ),
            if (contact.whatsappUri != null)
              _ContactTile(
                icon: Icons.chat,
                iconColor: const Color(0xFF25D366),
                title: 'WhatsApp',
                subtitle: contact.phone ?? 'WhatsApp',
                onTap: () => onLaunch(Uri.parse(contact.whatsappUri!)),
              ),
          ],
        ),
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
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: Icon(icon, color: iconColor),
      title: Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
      subtitle: Text(subtitle),
      trailing: const Icon(Icons.open_in_new, size: 18, color: MovaColors.textSecondary),
      onTap: onTap,
    );
  }
}

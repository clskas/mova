import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import '../../core/widgets/mova_screen.dart';

class HelpScreen extends StatelessWidget {
  const HelpScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return MovaScreen(
      title: 'Aide & Manuel',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ListTile(
            leading: const Icon(Icons.menu_book),
            title: const Text('Manuel utilisateur'),
            onTap: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const LegalScreen(title: 'Manuel', asset: 'assets/legal/cgu_fr.md')),
            ),
          ),
          ListTile(
            leading: const Icon(Icons.gavel),
            title: const Text('Conditions d\'utilisation'),
            onTap: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const LegalScreen(title: 'CGU', asset: 'assets/legal/cgu_fr.md')),
            ),
          ),
          ListTile(
            leading: const Icon(Icons.privacy_tip),
            title: const Text('Politique de confidentialité'),
            onTap: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const LegalScreen(title: 'Confidentialité', asset: 'assets/legal/privacy_fr.md')),
            ),
          ),
          const Divider(),
          const ListTile(
            leading: Icon(Icons.phone),
            title: Text('Support WhatsApp'),
            subtitle: Text('+243 900 000 000'),
          ),
        ],
      ),
    );
  }
}

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
          if (snapshot.hasData) {
            return Markdown(data: snapshot.data!);
          }
          return const Center(child: CircularProgressIndicator());
        },
      ),
    );
  }
}

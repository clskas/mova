import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/error/result.dart';
import '../../core/i18n/i18n.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';

/// Up to 3 people told by SMS when the user raises a SOS.
class TrustedContactsScreen extends ConsumerStatefulWidget {
  const TrustedContactsScreen({super.key});

  @override
  ConsumerState<TrustedContactsScreen> createState() => _TrustedContactsScreenState();
}

class _TrustedContactsScreenState extends ConsumerState<TrustedContactsScreen> {
  final _names = List.generate(3, (_) => TextEditingController());
  final _phones = List.generate(3, (_) => TextEditingController());
  bool _loading = true;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    for (final c in [..._names, ..._phones]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    final result = await ref.read(apiClientProvider).get('/incidents/trusted-contacts', skipCache: true);
    if (!mounted) return;
    setState(() {
      _loading = false;
      if (result case Success(:final data) when data is List) {
        for (var i = 0; i < data.length && i < 3; i++) {
          final row = data[i];
          if (row is! Map) continue;
          _names[i].text = row['name']?.toString() ?? '';
          _phones[i].text = row['phone']?.toString() ?? '';
        }
      } else if (result case Failure(:final error)) {
        _error = error.message;
      }
    });
  }

  Future<void> _save() async {
    final contacts = <Map<String, String>>[];
    for (var i = 0; i < 3; i++) {
      final name = _names[i].text.trim();
      final phone = _phones[i].text.trim();
      if (name.isEmpty && phone.isEmpty) continue;
      contacts.add({'name': name, 'phone': phone});
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    final result = await ref
        .read(apiClientProvider)
        .post('/incidents/trusted-contacts', {'contacts': contacts}, retries: 1, skipOffline: true);
    if (!mounted) return;
    setState(() => _saving = false);
    switch (result) {
      case Success():
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(tr('Contacts d’urgence enregistrés.'))));
        Navigator.pop(context);
      case Failure(:final error):
        setState(() => _error = error.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    return MovaScreen(
      title: tr('Contacts d’urgence'),
      child: _loading
          ? const Padding(padding: EdgeInsets.all(32), child: Center(child: CircularProgressIndicator()))
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  tr('Si vous déclenchez un SOS, ces personnes reçoivent un SMS avec votre position. 3 contacts au plus.'),
                  style: const TextStyle(color: MovaColors.textSecondary),
                ),
                const SizedBox(height: 16),
                for (var i = 0; i < 3; i++)
                  MovaCard(
                    key: Key('trustedContact$i'),
                    child: Column(
                      children: [
                        TextField(
                          controller: _names[i],
                          decoration: InputDecoration(labelText: trf('Contact {n} — nom', {'n': i + 1})),
                        ),
                        TextField(
                          controller: _phones[i],
                          keyboardType: TextInputType.phone,
                          decoration: InputDecoration(labelText: tr('Téléphone'), hintText: '+243 8XX XXX XXX'),
                        ),
                      ],
                    ),
                  ),
                if (_error != null) ...[
                  const SizedBox(height: 8),
                  Text(_error!, style: const TextStyle(color: MovaColors.error)),
                ],
                const SizedBox(height: 16),
                MovaButton(
                  label: _saving ? tr('Enregistrement…') : tr('Enregistrer'),
                  icon: Icons.save_outlined,
                  onPressed: _saving ? null : _save,
                ),
                const SizedBox(height: 8),
                Text(
                  tr('Prévenez-les : ils recevront un SMS de SENGA uniquement en cas d’alerte SOS.'),
                  style: const TextStyle(fontSize: 12, color: MovaColors.textSecondary),
                ),
              ],
            ),
    );
  }
}

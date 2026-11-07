import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/api/api_client.dart';
import '../../../core/error/result.dart';
import '../../../core/i18n/i18n.dart';
import '../../../core/theme/mova_colors.dart';

/// Smile ID identity check (document + live selfie), shown only when the admin turned it on
/// (Règles plateforme). The page opens in the browser; the verdict goes to the admin file.
class SmileIdVerificationCard extends ConsumerStatefulWidget {
  const SmileIdVerificationCard({super.key});

  @override
  ConsumerState<SmileIdVerificationCard> createState() => _SmileIdVerificationCardState();
}

class _SmileIdVerificationCardState extends ConsumerState<SmileIdVerificationCard> with WidgetsBindingObserver {
  Map<String, dynamic>? _view;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _load();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  /// Back from the browser: the status may have changed.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _load();
  }

  Future<void> _load() async {
    final result = await ref.read(apiClientProvider).get('/drivers/smile-id', skipCache: true, retries: 1);
    if (!mounted || result is! Success) return;
    final data = result.data;
    if (data is Map) setState(() => _view = Map<String, dynamic>.from(data));
  }

  Future<void> _start() async {
    setState(() => _busy = true);
    var link = _view?['link']?.toString();
    if (link == null || link.isEmpty) {
      final result = await ref.read(apiClientProvider).post('/drivers/smile-id/link', {}, retries: 1, skipOffline: true);
      if (result is Success<Map<String, dynamic>>) {
        _view = result.data;
        link = result.data['link']?.toString();
      }
    }
    if (!mounted) return;
    setState(() => _busy = false);
    if (link == null || link.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(tr('Vérification indisponible pour le moment. Réessayez plus tard.'))),
      );
      return;
    }
    final ok = await launchUrl(Uri.parse(link), mode: LaunchMode.externalApplication);
    if (!ok && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(tr('Impossible d\'ouvrir la page de vérification.'))),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final view = _view;
    if (view == null || view['visible'] != true) return const SizedBox.shrink();
    final status = view['status']?.toString();
    final canStart = view['canStart'] == true;

    final (IconData icon, Color color, String title, String body) = switch (status) {
      'clear' => (
          Icons.verified_user,
          MovaColors.green,
          tr('Identité vérifiée'),
          tr('Merci : votre identité a été vérifiée.'),
        ),
      'processing' || 'attention' => (
          Icons.hourglass_top,
          MovaColors.orange,
          tr('Vérification en cours'),
          tr('Votre vérification est en cours d\'examen. Vous serez informé du résultat.'),
        ),
      'block' => (
          Icons.error_outline,
          Colors.red,
          tr('Vérification non validée'),
          tr('Votre vérification n\'a pas été validée. Contactez le support SENGA.'),
        ),
      'error' => (
          Icons.error_outline,
          MovaColors.orange,
          tr('Vérification interrompue'),
          tr('Un problème technique a interrompu la vérification. Vous pouvez recommencer.'),
        ),
      _ => (
          Icons.badge_outlined,
          MovaColors.violet,
          tr('Vérifier mon identité'),
          tr('Photographiez votre carte d\'électeur, passeport ou permis, puis prenez un selfie. Cela prend 2 minutes.'),
        ),
    };

    return Card(
      margin: const EdgeInsets.symmetric(vertical: 8),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(icon, color: color),
                const SizedBox(width: 8),
                Expanded(child: Text(title, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15))),
              ],
            ),
            const SizedBox(height: 6),
            Text(body, style: TextStyle(color: MovaColors.textSecondary, fontSize: 13)),
            if (canStart) ...[
              const SizedBox(height: 10),
              SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  onPressed: _busy ? null : _start,
                  icon: _busy
                      ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.open_in_new),
                  label: Text(status == 'error' ? tr('Recommencer la vérification') : tr('Commencer la vérification')),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

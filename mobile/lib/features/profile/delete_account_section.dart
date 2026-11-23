import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/auth/session.dart';
import '../../core/config/app_version.dart';
import '../../core/error/result.dart';
import '../../core/i18n/i18n.dart';
import '../../core/theme/mova_colors.dart';

/// « Supprimer mon compte » (App Store 5.1.1(v)): asked twice, then the account is deleted
/// on the server and the app goes back to the sign-in screen.
class DeleteAccountSection extends ConsumerStatefulWidget {
  const DeleteAccountSection({super.key});

  @override
  ConsumerState<DeleteAccountSection> createState() => _DeleteAccountSectionState();
}

class _DeleteAccountSectionState extends ConsumerState<DeleteAccountSection> {
  bool _busy = false;

  Future<void> _start() async {
    final first = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(tr('Supprimer mon compte ?')),
        content: Text(
          tr('Vos données personnelles (nom, téléphone, e-mail, photo, documents) seront effacées et le compte fermé définitivement. Le solde éventuel de votre portefeuille sera perdu : utilisez-le ou retirez-le avant. L’historique des courses et paiements est conservé de façon anonyme, comme la loi l’exige.'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(tr('Annuler'))),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(tr('Continuer'), style: const TextStyle(color: MovaColors.error)),
          ),
        ],
      ),
    );
    if (first != true || !mounted) return;
    final second = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(tr('Confirmer la suppression')),
        content: Text(tr('Cette action est définitive et ne peut pas être annulée.')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(tr('Annuler'))),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: MovaColors.error),
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(tr('Supprimer définitivement')),
          ),
        ],
      ),
    );
    if (second != true || !mounted) return;
    setState(() => _busy = true);
    final result = await ref.read(apiClientProvider).deleteAccount();
    if (!mounted) return;
    setState(() => _busy = false);
    switch (result) {
      case Success():
        await showDialog<void>(
          context: context,
          builder: (ctx) => AlertDialog(
            title: Text(tr('Compte supprimé')),
            content: Text(tr('Votre compte SENGA a été supprimé. Merci d’avoir utilisé SENGA.')),
            actions: [TextButton(onPressed: () => Navigator.pop(ctx), child: Text(tr('OK')))],
          ),
        );
        if (!mounted) return;
        if (AppFlavor.isDriver) {
          await logoutDriver(context, ref);
        } else {
          await logoutPassenger(context, ref);
        }
      case Failure(:final error):
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 32),
        const Divider(),
        const SizedBox(height: 8),
        OutlinedButton.icon(
          key: const Key('delete-account'),
          style: OutlinedButton.styleFrom(
            foregroundColor: MovaColors.error,
            side: const BorderSide(color: MovaColors.error),
            padding: const EdgeInsets.symmetric(vertical: 14),
          ),
          onPressed: _busy ? null : _start,
          icon: _busy
              ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
              : const Icon(Icons.delete_forever_outlined),
          label: Text(tr('Supprimer mon compte')),
        ),
        const SizedBox(height: 8),
        Text(
          tr('Efface vos données personnelles et ferme le compte définitivement.'),
          textAlign: TextAlign.center,
          style: TextStyle(color: MovaColors.textSecondary, fontSize: 12),
        ),
      ],
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/cache/user_profile_cache.dart';
import '../../core/error/result.dart';
import '../../core/offline/connectivity_service.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';

class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  final _firstName = TextEditingController();
  final _lastName = TextEditingController();
  final _email = TextEditingController();
  bool _loading = true;
  bool _saving = false;
  String? _error;
  String? _phone;
  DateTime? _lastSync;
  bool _offlinePending = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _firstName.dispose();
    _lastName.dispose();
    _email.dispose();
    super.dispose();
  }

  void _applyProfile(Map<String, dynamic> data, {DateTime? syncedAt, bool offline = false}) {
    _phone = data['phone']?.toString();
    _firstName.text = data['firstName']?.toString() ?? '';
    _lastName.text = data['lastName']?.toString() ?? '';
    _email.text = data['email']?.toString() ?? '';
    _lastSync = syncedAt;
    _offlinePending = offline;
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final api = ref.read(apiClientProvider);
    final result = await api.getCurrentUser(forceRefresh: true);
    if (!mounted) return;
    switch (result) {
      case Success(:final data):
        final offline = data['offline'] == true;
        setState(() {
          _applyProfile(data, offline: offline);
          _loading = false;
        });
      case Failure(:final error):
        final cached = await UserProfileCache.load();
        if (cached.profile != null && mounted) {
          setState(() {
            _applyProfile(cached.profile!, syncedAt: cached.syncedAt);
            _loading = false;
            _error = 'Profil hors ligne (dernière synchro).';
          });
        } else if (mounted) {
          setState(() {
            _loading = false;
            _error = error.message;
          });
        }
    }
  }

  bool _isValidEmail(String email) =>
      RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(email);

  Future<void> _save() async {
    final firstName = _firstName.text.trim();
    final lastName = _lastName.text.trim();
    final email = _email.text.trim();
    if (email.isNotEmpty && !_isValidEmail(email)) {
      setState(() => _error = 'Adresse e-mail invalide (ex. nom@domaine.com).');
      return;
    }

    setState(() {
      _saving = true;
      _error = null;
    });
    final api = ref.read(apiClientProvider);
    final result = await api.updateUserProfile(
      firstName: firstName,
      lastName: lastName,
      email: email,
    );
    if (!mounted) return;
    setState(() => _saving = false);

    switch (result) {
      case Success(:final data):
        final offline = data['offline'] == true;
        if (!offline) {
          final refresh = await api.getCurrentUser(forceRefresh: true);
          if (!mounted) return;
          switch (refresh) {
            case Success(:final data):
              setState(() {
                _applyProfile(data);
                _offlinePending = false;
              });
            case Failure():
              setState(() {
                _applyProfile(data);
                _offlinePending = false;
              });
          }
        } else {
          setState(() {
            _applyProfile(data, offline: true);
            _offlinePending = true;
          });
        }
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              offline
                  ? 'Profil enregistré hors ligne — synchronisation à la reconnexion.'
                  : 'Profil mis à jour.',
            ),
          ),
        );
      case Failure(:final error):
        setState(() => _error = error.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final offline = ref.watch(offlineStateProvider).valueOrNull?.isOffline == true;

    return MovaScreen(
      title: 'Mon profil',
      child: _loading
          ? const Center(child: CircularProgressIndicator(color: MovaColors.violet))
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                MovaCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          CircleAvatar(
                            radius: 28,
                            backgroundColor: MovaColors.violet.withValues(alpha: 0.15),
                            child: const Icon(Icons.person, color: MovaColors.violet, size: 32),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'Identité (optionnelle)',
                                  style: Theme.of(context).textTheme.titleSmall?.copyWith(
                                        fontWeight: FontWeight.bold,
                                      ),
                                ),
                                const SizedBox(height: 4),
                                const Text(
                                  'Vous pouvez utiliser SENGA avec votre numéro seul. '
                                  'Ajoutez votre nom pour personnaliser l\'accueil et le chat.',
                                  style: TextStyle(color: MovaColors.textSecondary, fontSize: 12),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                      if (_phone != null && _phone!.isNotEmpty) ...[
                        const SizedBox(height: 12),
                        Text(
                          'Téléphone (connexion)',
                          style: Theme.of(context).textTheme.labelMedium?.copyWith(
                                color: MovaColors.textSecondary,
                              ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          _phone!,
                          style: const TextStyle(fontWeight: FontWeight.w600),
                        ),
                      ],
                      if (_lastSync != null) ...[
                        const SizedBox(height: 8),
                        Text(
                          'Dernière synchro : ${_formatSync(_lastSync!)}',
                          style: const TextStyle(color: MovaColors.textSecondary, fontSize: 11),
                        ),
                      ],
                    ],
                  ),
                ),
                if (offline || _offlinePending) ...[
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: MovaColors.violet.withValues(alpha: 0.08),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: MovaColors.violet.withValues(alpha: 0.25)),
                    ),
                    child: const Text(
                      'Modifications possibles hors ligne — envoyées au serveur à la reconnexion.',
                      style: TextStyle(color: MovaColors.textSecondary, fontSize: 12),
                    ),
                  ),
                ],
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  MovaErrorBanner(message: _error!, onRetry: _load),
                ],
                const SizedBox(height: 16),
                TextField(
                  controller: _firstName,
                  textCapitalization: TextCapitalization.words,
                  decoration: const InputDecoration(
                    labelText: 'Prénom (optionnel)',
                    prefixIcon: Icon(Icons.badge_outlined),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _lastName,
                  textCapitalization: TextCapitalization.words,
                  decoration: const InputDecoration(
                    labelText: 'Nom (optionnel)',
                    prefixIcon: Icon(Icons.badge_outlined),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _email,
                  keyboardType: TextInputType.emailAddress,
                  decoration: const InputDecoration(
                    labelText: 'E-mail (optionnel)',
                    hintText: 'pour reçus et support',
                    prefixIcon: Icon(Icons.email_outlined),
                  ),
                ),
                const SizedBox(height: 24),
                MovaButton(
                  label: 'Enregistrer',
                  icon: Icons.save_outlined,
                  isLoading: _saving,
                  onPressed: _saving ? null : _save,
                ),
              ],
            ),
    );
  }

  String _formatSync(DateTime dt) {
    final local = dt.toLocal();
    return '${local.day.toString().padLeft(2, '0')}/'
        '${local.month.toString().padLeft(2, '0')} '
        '${local.hour.toString().padLeft(2, '0')}:'
        '${local.minute.toString().padLeft(2, '0')}';
  }
}

import 'package:flutter/material.dart';

import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import 'driver_alert_prefs.dart';
import 'driver_job_alert_service.dart';
import '../../core/i18n/i18n.dart';

/// Paramètres son des notifications chauffeur / livreur.
class DriverNotificationSettingsScreen extends StatefulWidget {
  const DriverNotificationSettingsScreen({super.key});

  @override
  State<DriverNotificationSettingsScreen> createState() =>
      _DriverNotificationSettingsScreenState();
}

class _DriverNotificationSettingsScreenState
    extends State<DriverNotificationSettingsScreen> {
  bool _loading = true;
  bool _muted = false;
  DriverAlertSoundStyle _style = DriverAlertSoundStyle.senga;
  bool _testing = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    await DriverAlertPrefs.ensureLoaded();
    if (!mounted) return;
    setState(() {
      _muted = DriverAlertPrefs.muted;
      _style = DriverAlertPrefs.style;
      _loading = false;
    });
  }

  Future<void> _setMuted(bool value) async {
    await DriverAlertPrefs.setMuted(value);
    if (!mounted) return;
    setState(() => _muted = value);
  }

  Future<void> _setStyle(DriverAlertSoundStyle value) async {
    await DriverAlertPrefs.setStyle(value);
    if (!mounted) return;
    setState(() => _style = value);
  }

  Future<void> _test() async {
    if (_testing) return;
    setState(() => _testing = true);
    try {
      if (_muted) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(tr('Son coupé — désactivez le mute pour tester.'))),
        );
        return;
      }
      await DriverJobAlertService.notify(
        title: tr('Test SENGA Driver'),
        body: _style == DriverAlertSoundStyle.senga
            ? tr('Son SENGA des missions')
            : tr('Son système du téléphone'),
      );
    } finally {
      if (mounted) setState(() => _testing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return MovaScreen(
      title: tr('Notifications'),
      child: _loading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  tr('Son des nouvelles courses, livraisons et missions.'),
                  style: TextStyle(color: MovaColors.textSecondary, height: 1.4),
                ),
                const SizedBox(height: 20),
                SwitchListTile.adaptive(
                  contentPadding: EdgeInsets.zero,
                  secondary: Icon(
                    _muted ? Icons.notifications_off_outlined : Icons.notifications_active_outlined,
                    color: MovaColors.violet,
                  ),
                  title: Text(tr('Son des alertes'), style: TextStyle(fontWeight: FontWeight.w600)),
                  subtitle: Text(_muted ? tr('Coupé (vibration seule)') : tr('Activé')),
                  value: !_muted,
                  onChanged: (on) => _setMuted(!on),
                ),
                const Divider(height: 28),
                Text(
                  tr('Choix du son'),
                  style: Theme.of(context).textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w700,
                        color: MovaColors.midnightSoft,
                      ),
                ),
                const SizedBox(height: 8),
                RadioListTile<DriverAlertSoundStyle>(
                  contentPadding: EdgeInsets.zero,
                  value: DriverAlertSoundStyle.senga,
                  groupValue: _style,
                  onChanged: _muted
                      ? null
                      : (v) {
                          if (v != null) _setStyle(v);
                        },
                  title: Text(tr('Son SENGA')),
                  subtitle: Text(tr('Son dédié des missions')),
                ),
                RadioListTile<DriverAlertSoundStyle>(
                  contentPadding: EdgeInsets.zero,
                  value: DriverAlertSoundStyle.system,
                  groupValue: _style,
                  onChanged: _muted
                      ? null
                      : (v) {
                          if (v != null) _setStyle(v);
                        },
                  title: Text(tr('Son du téléphone')),
                  subtitle: Text(tr('Son de notification par défaut')),
                ),
                const SizedBox(height: 16),
                OutlinedButton.icon(
                  onPressed: _testing ? null : _test,
                  icon: _testing
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.volume_up_outlined),
                  label: Text(_testing ? tr('Test…') : tr('Tester le son')),
                ),
                const SizedBox(height: 12),
                Text(
                  tr('Pour une nouvelle course ou livraison, le son SENGA sonne en boucle '
                  '(comme un appel) jusqu’à acceptation, refus ou annulation par le passager. '
                  'Le test ci-dessus joue un bip unique.'),
                  style: TextStyle(fontSize: 12, color: MovaColors.textMuted, height: 1.35),
                ),
              ],
            ),
    );
  }
}

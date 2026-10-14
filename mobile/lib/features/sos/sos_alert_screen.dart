import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/contact/contact_actions.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';

/// Détail d'une alerte SOS + actions d'intervention (Maps, secours).
class SosAlertScreen extends StatelessWidget {
  const SosAlertScreen({
    super.key,
    this.incidentId,
    this.title,
    this.body,
    this.lat,
    this.lng,
    this.rideId,
    this.referenceType,
    this.referenceId,
    this.forOps = false,
  });

  final String? incidentId;
  final String? title;
  final String? body;
  final double? lat;
  final double? lng;
  final String? rideId;
  final String? referenceType;
  final String? referenceId;
  final bool forOps;

  bool get _hasGps => lat != null && lng != null;

  String get _mapsUrl => 'https://maps.google.com/?q=$lat,$lng';

  static const _adminLitigesUrl = 'https://admin.mova.cd/litiges';

  Future<void> _open(BuildContext context, String url) async {
    final ok = await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    if (!ok && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Impossible d\'ouvrir le lien')),
      );
    }
  }

  Future<void> _callEmergency() async {
    await launchPhoneCall('112');
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final heading = (title != null && title!.trim().isNotEmpty)
        ? title!.trim()
        : 'Alerte SOS';
    final detail = (body != null && body!.trim().isNotEmpty)
        ? body!.trim()
        : 'Une urgence a été signalée sur SENGA.';

    return MovaScreen(
      title: 'Alerte SOS',
      scrollable: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          MovaCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: MovaColors.red,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: const Text(
                        'SOS',
                        style: TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w800,
                          fontSize: 12,
                          letterSpacing: 0.6,
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        heading,
                        style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Text(detail, style: theme.textTheme.bodyMedium),
                if (rideId != null && rideId!.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  Text(
                    'Course : $rideId',
                    style: theme.textTheme.bodySmall?.copyWith(color: MovaColors.textSecondary),
                  ),
                ],
                if (referenceType != null &&
                    referenceType!.isNotEmpty &&
                    referenceId != null &&
                    referenceId!.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(
                    '$referenceType : $referenceId',
                    style: theme.textTheme.bodySmall?.copyWith(color: MovaColors.textSecondary),
                  ),
                ],
                if (incidentId != null && incidentId!.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(
                    'Réf. ${incidentId!.length > 12 ? '${incidentId!.substring(0, 8)}…' : incidentId}',
                    style: theme.textTheme.bodySmall?.copyWith(color: MovaColors.textMuted),
                  ),
                ],
                if (_hasGps) ...[
                  const SizedBox(height: 8),
                  Text(
                    'GPS : ${lat!.toStringAsFixed(5)}, ${lng!.toStringAsFixed(5)}',
                    style: theme.textTheme.bodySmall?.copyWith(color: MovaColors.textSecondary),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 16),
          Text(
            'Intervenir',
            style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 8),
          if (_hasGps)
            FilledButton.icon(
              onPressed: () => _open(context, _mapsUrl),
              icon: const Icon(Icons.map_outlined),
              style: FilledButton.styleFrom(
                backgroundColor: MovaColors.red,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 14),
              ),
              label: const Text('Ouvrir la position sur Maps'),
            ),
          if (_hasGps) const SizedBox(height: 10),
          OutlinedButton.icon(
            onPressed: _callEmergency,
            icon: const Icon(Icons.emergency_outlined, color: MovaColors.red),
            label: const Text('Appeler les secours (112)'),
          ),
          if (forOps) ...[
            const SizedBox(height: 10),
            OutlinedButton.icon(
              onPressed: () => _open(context, _adminLitigesUrl),
              icon: const Icon(Icons.admin_panel_settings_outlined),
              label: const Text('Ouvrir Litiges (admin)'),
            ),
          ],
          const SizedBox(height: 20),
          Text(
            forOps
                ? 'Traitez l’urgence dans Litiges admin. La position GPS et les appels ci-dessus aident l’intervention.'
                : 'L’équipe SENGA a été alertée. Ouvrez la carte ou appelez les secours si vous pouvez intervenir.',
            style: theme.textTheme.bodySmall?.copyWith(color: MovaColors.textSecondary),
          ),
        ],
      ),
    );
  }
}

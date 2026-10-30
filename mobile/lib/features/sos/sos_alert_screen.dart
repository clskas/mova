import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api/api_client.dart';
import '../../core/contact/contact_actions.dart';
import '../../core/error/result.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';

class SosEmergencyNumber {
  const SosEmergencyNumber({required this.label, required this.phone});
  final String label;
  final String phone;
}

/// Détail d'une alerte SOS + actions d'intervention (Maps, secours).
class SosAlertScreen extends StatefulWidget {
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

  @override
  State<SosAlertScreen> createState() => _SosAlertScreenState();
}

class _SosAlertScreenState extends State<SosAlertScreen> {
  static const _adminLitigesUrl = 'https://admin.mova.cd/litiges';
  static const _fallback = [
    SosEmergencyNumber(label: 'Secours (112)', phone: '112'),
  ];

  List<SosEmergencyNumber> _numbers = _fallback;
  bool _loadingNumbers = true;

  bool get _hasGps => widget.lat != null && widget.lng != null;

  String get _mapsUrl => 'https://maps.google.com/?q=${widget.lat},${widget.lng}';

  @override
  void initState() {
    super.initState();
    _loadEmergencyNumbers();
  }

  Future<void> _loadEmergencyNumbers() async {
    try {
      final api = ApiClient();
      final result = await api.get('/public/client-config');
      if (!mounted) return;
      if (result case Success(:final data)) {
        final raw = data['sosEmergencyContacts'];
        if (raw is List && raw.isNotEmpty) {
          final parsed = <SosEmergencyNumber>[];
          for (final row in raw) {
            if (row is! Map) continue;
            final label = row['label']?.toString().trim() ?? '';
            final phone = row['phone']?.toString().trim() ?? '';
            if (label.isEmpty || phone.isEmpty) continue;
            // Public API already filters enabled; keep defensive check.
            if (row['enabled'] == false) continue;
            parsed.add(SosEmergencyNumber(label: label, phone: phone));
          }
          if (parsed.isNotEmpty) {
            setState(() {
              _numbers = parsed;
              _loadingNumbers = false;
            });
            return;
          }
        }
      }
    } catch (_) {
      /* fallback 112 */
    }
    if (mounted) {
      setState(() {
        _numbers = _fallback;
        _loadingNumbers = false;
      });
    }
  }

  Future<void> _open(BuildContext context, String url) async {
    final ok = await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    if (!ok && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Impossible d\'ouvrir le lien')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final heading = (widget.title != null && widget.title!.trim().isNotEmpty)
        ? widget.title!.trim()
        : 'Alerte SOS';
    final detail = (widget.body != null && widget.body!.trim().isNotEmpty)
        ? widget.body!.trim()
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
                if (widget.rideId != null && widget.rideId!.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  Text(
                    'Course : ${widget.rideId}',
                    style: theme.textTheme.bodySmall?.copyWith(color: MovaColors.textSecondary),
                  ),
                ],
                if (widget.referenceType != null &&
                    widget.referenceType!.isNotEmpty &&
                    widget.referenceId != null &&
                    widget.referenceId!.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(
                    '${widget.referenceType} : ${widget.referenceId}',
                    style: theme.textTheme.bodySmall?.copyWith(color: MovaColors.textSecondary),
                  ),
                ],
                if (widget.incidentId != null && widget.incidentId!.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(
                    'Réf. ${widget.incidentId!.length > 12 ? '${widget.incidentId!.substring(0, 8)}…' : widget.incidentId}',
                    style: theme.textTheme.bodySmall?.copyWith(color: MovaColors.textMuted),
                  ),
                ],
                if (_hasGps) ...[
                  const SizedBox(height: 8),
                  Text(
                    'GPS : ${widget.lat!.toStringAsFixed(5)}, ${widget.lng!.toStringAsFixed(5)}',
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
          if (_loadingNumbers)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 8),
              child: Center(child: SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2))),
            )
          else
            ..._numbers.map(
              (n) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: OutlinedButton.icon(
                  onPressed: () => launchPhoneCall(n.phone),
                  icon: const Icon(Icons.emergency_outlined, color: MovaColors.red),
                  label: Text('Appeler — ${n.label} (${n.phone})'),
                ),
              ),
            ),
          if (widget.forOps) ...[
            const SizedBox(height: 0),
            OutlinedButton.icon(
              onPressed: () => _open(context, _adminLitigesUrl),
              icon: const Icon(Icons.admin_panel_settings_outlined),
              label: const Text('Ouvrir Litiges (admin)'),
            ),
          ],
          const SizedBox(height: 20),
          Text(
            widget.forOps
                ? 'Traitez l’urgence dans Litiges admin. La position GPS et les appels ci-dessus aident l’intervention.'
                : 'L’équipe SENGA a été alertée. Ouvrez la carte ou appelez les secours si vous pouvez intervenir.',
            style: theme.textTheme.bodySmall?.copyWith(color: MovaColors.textSecondary),
          ),
        ],
      ),
    );
  }
}

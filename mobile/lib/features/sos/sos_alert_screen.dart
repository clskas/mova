import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api/api_client.dart';
import '../../core/contact/contact_actions.dart';
import '../../core/error/result.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import '../help/company_contact.dart';

/// Détail d'une alerte SOS + actions d'intervention (Maps, secours, support).
class SosAlertScreen extends ConsumerStatefulWidget {
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
  ConsumerState<SosAlertScreen> createState() => _SosAlertScreenState();
}

class _SosAlertScreenState extends ConsumerState<SosAlertScreen> {
  List<CompanyContact> _support = const [];

  bool get _hasGps => widget.lat != null && widget.lng != null;

  String get _mapsUrl => 'https://maps.google.com/?q=${widget.lat},${widget.lng}';

  static const _adminLitigesUrl = 'https://admin.mova.cd/litiges';

  @override
  void initState() {
    super.initState();
    _loadSupport();
  }

  Future<void> _loadSupport() async {
    final result = await ref.read(apiClientProvider).getCompanyContacts();
    if (!mounted) return;
    if (result case Success(:final data)) {
      setState(() {
        _support = data
            .map(CompanyContact.fromJson)
            .where((c) => (c.phone ?? '').trim().isNotEmpty)
            .toList();
      });
    }
  }

  Future<void> _open(String url) async {
    final ok = await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    if (!ok && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Impossible d\'ouvrir le lien')),
      );
    }
  }

  Future<void> _callEmergency() async {
    // Numéros d’urgence courants RDC / internationaux.
    await launchPhoneCall('112');
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
              onPressed: () => _open(_mapsUrl),
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
          if (_support.isNotEmpty) ...[
            const SizedBox(height: 10),
            OutlinedButton.icon(
              onPressed: () => showCallWhatsAppSheet(
                context,
                phone: _support.first.phone,
                peerLabel: _support.first.name,
              ),
              icon: const Icon(Icons.support_agent_outlined),
              label: Text('Contacter ${_support.first.name}'),
            ),
          ],
          if (widget.forOps) ...[
            const SizedBox(height: 10),
            OutlinedButton.icon(
              onPressed: () => _open(_adminLitigesUrl),
              icon: const Icon(Icons.admin_panel_settings_outlined),
              label: const Text('Ouvrir Litiges (admin)'),
            ),
          ],
          const SizedBox(height: 20),
          Text(
            widget.forOps
                ? 'Traitez l’urgence dans Litiges admin. La position GPS et les appels ci-dessus aident l’intervention.'
                : 'L’équipe support SENGA a été alertée. Vous pouvez ouvrir la carte, appeler les secours ou le support.',
            style: theme.textTheme.bodySmall?.copyWith(color: MovaColors.textSecondary),
          ),
        ],
      ),
    );
  }
}

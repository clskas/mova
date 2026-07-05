import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api/api_client.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/geo/maps_launcher.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';

List<Map<String, dynamic>> rentalTimelineSteps(String? status) {
  const steps = [
    ('CONFIRMED', 'Réservation confirmée'),
    ('IN_PROGRESS', 'Véhicule remis — location en cours'),
    ('RETURNED', 'Véhicule rendu'),
  ];
  if (status == 'CLOSED') {
    return [{'label': 'Réservation annulée', 'done': true}];
  }
  final order = steps.map((s) => s.$1).toList();
  final idx = order.indexOf(status ?? 'CONFIRMED');
  return steps
      .asMap()
      .entries
      .map((e) => {'label': e.value.$2, 'done': idx >= 0 && e.key <= idx})
      .toList();
}

class DriverRentalMissionScreen extends ConsumerStatefulWidget {
  const DriverRentalMissionScreen({
    super.key,
    required this.inquiryId,
    this.initialMission,
  });

  final String inquiryId;
  final Map<String, dynamic>? initialMission;

  @override
  ConsumerState<DriverRentalMissionScreen> createState() => _DriverRentalMissionScreenState();
}

class _DriverRentalMissionScreenState extends ConsumerState<DriverRentalMissionScreen> {
  Map<String, dynamic>? _inquiry;
  bool _loading = true;
  bool _saving = false;
  String? _error;

  String get _status =>
      _inquiry?['status']?.toString() ?? widget.initialMission?['status']?.toString() ?? 'CONFIRMED';

  @override
  void initState() {
    super.initState();
    if (widget.initialMission != null) {
      _inquiry = Map<String, dynamic>.from(widget.initialMission!);
    }
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = _inquiry == null;
      _error = null;
    });
    final result = await ref.read(apiClientProvider).get('/rental/inquiries/${widget.inquiryId}');
    if (!mounted) return;
    setState(() {
      _loading = false;
      switch (result) {
        case Success(:final data):
          _inquiry = data['inquiry'] as Map<String, dynamic>? ?? data;
          _error = null;
        case Failure(:final error):
          _error = error.message;
      }
    });
  }

  Future<void> _advanceStatus(String nextStatus, String successMessage) async {
    setState(() {
      _saving = true;
      _error = null;
    });
    final result = await ref.read(apiClientProvider).patch(
      '/rental/inquiries/${widget.inquiryId}/driver-status',
      {'status': nextStatus},
    );
    if (!mounted) return;
    setState(() => _saving = false);
    switch (result) {
      case Success(:final data):
        setState(() {
          _inquiry = data['inquiry'] as Map<String, dynamic>? ??
              data['rental'] as Map<String, dynamic>? ??
              _inquiry;
        });
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(successMessage)));
        if (nextStatus == 'RETURNED') {
          Navigator.pop(context, true);
        } else {
          await _load();
        }
      case Failure(:final error):
        setState(() => _error = error.message);
    }
  }

  Future<void> _callPhone(String? phone) async {
    final normalized = phone?.trim();
    if (normalized == null || normalized.isEmpty) return;
    final uri = Uri.parse('tel:$normalized');
    if (!await launchUrl(uri)) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Impossible d\'ouvrir l\'appel')),
        );
      }
    }
  }

  String? _formatPeriod() {
    final startRaw = _inquiry?['startDate'] ?? widget.initialMission?['startDate'];
    final endRaw = _inquiry?['endDate'] ?? widget.initialMission?['endDate'];
    if (startRaw == null || endRaw == null) return null;
    final start = DateTime.tryParse(startRaw.toString())?.toLocal();
    final end = DateTime.tryParse(endRaw.toString())?.toLocal();
    if (start == null || end == null) return null;
    String fmt(DateTime d) =>
        '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year}';
    return '${fmt(start)} → ${fmt(end)}';
  }

  @override
  Widget build(BuildContext context) {
    if (_loading && _inquiry == null) {
      return const MovaScreen(
        title: 'Mission location',
        scrollable: false,
        child: Center(child: CircularProgressIndicator(color: MovaColors.violet)),
      );
    }

    final vehicleName =
        _inquiry?['vehicle']?['name']?.toString() ??
        _inquiry?['vehicleName']?.toString() ??
        widget.initialMission?['vehicleName']?.toString() ??
        'Véhicule';
    final pickup = _inquiry?['pickupAddress']?.toString() ??
        _inquiry?['pickupCity']?.toString() ??
        widget.initialMission?['pickupAddress']?.toString() ??
        '—';
    final returnCity = _inquiry?['returnCity']?.toString() ?? widget.initialMission?['returnCity']?.toString();
    final logistics = _inquiry?['logisticsModeLabel']?.toString();
    final contactPhone = _inquiry?['contactPhone']?.toString() ?? widget.initialMission?['contactPhone']?.toString();
    final price = _inquiry?['priceCdf'] ?? _inquiry?['totalCdf'] ?? widget.initialMission?['priceCdf'];
    final period = _formatPeriod();
    final steps = rentalTimelineSteps(_status);

    return MovaScreen(
      title: 'Mission location',
      scrollable: false,
      child: MovaFlexScroll(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (_error != null) ...[
              MovaCard(child: Text(_error!, style: const TextStyle(color: MovaColors.error))),
              const SizedBox(height: 12),
            ],
            MovaCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    _statusLabel(_status),
                    style: const TextStyle(fontWeight: FontWeight.bold, color: MovaColors.violet),
                  ),
                  const SizedBox(height: 8),
                  Text(vehicleName, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
                  if (period != null) ...[
                    const SizedBox(height: 8),
                    Text('Période : $period'),
                  ],
                  const SizedBox(height: 8),
                  Text('Lieu', style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                  Text(pickup, style: const TextStyle(fontWeight: FontWeight.w600), maxLines: 3, overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 8),
                  MovaButton(
                    label: 'Navigation vers le lieu',
                    icon: Icons.directions,
                    isSecondary: true,
                    onPressed: () => MapsLauncher.openAddressSearch(pickup),
                  ),
                  if (returnCity != null && returnCity.isNotEmpty && returnCity != pickup) ...[
                    const SizedBox(height: 4),
                    Text('Retour : $returnCity', style: const TextStyle(fontSize: 13)),
                  ],
                  if (logistics != null) ...[
                    const SizedBox(height: 8),
                    Text('Logistique : $logistics', style: const TextStyle(fontSize: 13)),
                  ],
                  if (price != null) ...[
                    const SizedBox(height: 8),
                    Text(
                      MarketConfig.formatCdf(price is int ? price : int.tryParse(price.toString()) ?? 0),
                      style: const TextStyle(fontWeight: FontWeight.bold, color: MovaColors.green),
                    ),
                  ],
                  if (contactPhone != null && contactPhone.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    MovaButton(
                      label: 'Appeler le passager',
                      icon: Icons.phone,
                      onPressed: () => _callPhone(contactPhone),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 12),
            MovaCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Étapes', style: TextStyle(fontWeight: FontWeight.w600)),
                  const SizedBox(height: 8),
                  ...steps.map((step) {
                    final done = step['done'] == true;
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 6),
                      child: Row(
                        children: [
                          Icon(
                            done ? Icons.check_circle : Icons.radio_button_unchecked,
                            size: 18,
                            color: done ? MovaColors.green : MovaColors.textSecondary,
                          ),
                          const SizedBox(width: 8),
                          Expanded(child: Text(step['label']?.toString() ?? '')),
                        ],
                      ),
                    );
                  }),
                ],
              ),
            ),
            const SizedBox(height: 12),
            if (_status == 'CONFIRMED')
              MovaButton(
                label: 'Remise effectuée → En cours',
                icon: Icons.directions_car,
                isLoading: _saving,
                onPressed: _saving
                    ? null
                    : () => _advanceStatus('IN_PROGRESS', 'Location passée en cours'),
              ),
            if (_status == 'IN_PROGRESS')
              MovaButton(
                label: 'Véhicule rendu',
                icon: Icons.check,
                isLoading: _saving,
                onPressed: _saving
                    ? null
                    : () => _advanceStatus('RETURNED', 'Retour enregistré'),
              ),
            if (_status == 'PENDING' || _status == 'CONTACTED') ...[
              MovaCard(
                child: Text(
                  _inquiry?['nextStepHint']?.toString() ??
                      'En attente de confirmation du propriétaire avant la remise.',
                  style: const TextStyle(fontSize: 13, color: MovaColors.textSecondary),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  String _statusLabel(String status) {
    return switch (status.toUpperCase()) {
      'PENDING' => 'En attente',
      'CONTACTED' => 'Prise en charge propriétaire',
      'CONFIRMED' => 'Confirmée — prêt pour la remise',
      'IN_PROGRESS' => 'Location en cours',
      'RETURNED' => 'Terminée',
      _ => status,
    };
  }
}

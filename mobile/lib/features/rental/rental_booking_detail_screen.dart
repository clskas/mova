import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/api/api_client.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/services/cancel_eligibility.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import '../booking/payment_screen.dart';

class RentalBookingDetailScreen extends ConsumerStatefulWidget {
  const RentalBookingDetailScreen({
    super.key,
    required this.bookingId,
    this.initialBooking,
  });

  final String bookingId;
  final Map<String, dynamic>? initialBooking;

  @override
  ConsumerState<RentalBookingDetailScreen> createState() => _RentalBookingDetailScreenState();
}

class _RentalBookingDetailScreenState extends ConsumerState<RentalBookingDetailScreen> {
  Map<String, dynamic>? _booking;
  bool _loading = true;
  bool _actionLoading = false;
  String? _error;
  Timer? _pollTimer;

  @override
  void initState() {
    super.initState();
    if (widget.initialBooking != null) {
      _booking = widget.initialBooking;
      _loading = false;
    }
    _loadBooking();
    _pollTimer = Timer.periodic(const Duration(seconds: 8), (_) => _loadBooking(silent: true));
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }

  Future<void> _loadBooking({bool silent = false}) async {
    if (widget.bookingId.isEmpty) {
      setState(() => _loading = false);
      return;
    }
    if (!silent) setState(() => _loading = _booking == null);
    final api = ref.read(apiClientProvider);
    final result = await api.get('/rental/bookings/${widget.bookingId}', skipCache: true);
    if (!mounted) return;
    setState(() {
      if (!silent) _loading = false;
      switch (result) {
        case Success(:final data):
          final raw = data is Map<String, dynamic> ? data : Map<String, dynamic>.from(data as Map);
          _booking = raw['inquiry'] as Map<String, dynamic>? ??
              raw['booking'] as Map<String, dynamic>? ??
              raw;
          _error = null;
        case Failure(:final error):
          if (_booking == null) _error = error.message;
      }
    });
  }

  String _formatDate(String? raw) {
    if (raw == null || raw.isEmpty) return '';
    try {
      final dt = DateTime.parse(raw);
      return '${dt.day.toString().padLeft(2, '0')}/${dt.month.toString().padLeft(2, '0')}/${dt.year}';
    } catch (_) {
      return raw;
    }
  }

  Future<void> _callOwner(String? phone) async {
    if (phone == null || phone.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Numéro propriétaire indisponible')),
      );
      return;
    }
    final uri = Uri.parse('tel:$phone');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    }
  }

  Future<void> _confirmHandover() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Confirmer la réception'),
        content: const Text(
          'Confirmez-vous avoir reçu le véhicule ? La location passera au statut « En cours ».',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Annuler')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Oui, j\'ai reçu le véhicule')),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    setState(() => _actionLoading = true);
    final api = ref.read(apiClientProvider);
    final result = await api.post('/rental/bookings/${widget.bookingId}/handover', {});
    if (!mounted) return;
    setState(() => _actionLoading = false);
    switch (result) {
      case Success(:final data):
        final raw = data is Map<String, dynamic> ? data : Map<String, dynamic>.from(data as Map);
        setState(() {
          _booking = raw['inquiry'] as Map<String, dynamic>? ??
              raw['booking'] as Map<String, dynamic>? ??
              raw;
          _error = null;
        });
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Location démarrée — bon voyage !')),
        );
      case Failure(:final error):
        setState(() => _error = error.message);
    }
  }

  Future<void> _cancel() async {
    setState(() => _actionLoading = true);
    final api = ref.read(apiClientProvider);
    final result = await api.post('/rental/bookings/${widget.bookingId}/cancel', {});
    if (!mounted) return;
    setState(() => _actionLoading = false);
    switch (result) {
      case Success():
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Réservation annulée')),
        );
        Navigator.pop(context, true);
      case Failure(:final error):
        setState(() => _error = error.message);
    }
  }

  Widget _timeline(List<dynamic>? timeline) {
    if (timeline == null || timeline.isEmpty) return const SizedBox.shrink();
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: timeline.map<Widget>((step) {
        final m = step as Map<String, dynamic>;
        final done = m['completed'] == true;
        final current = m['current'] == true;
        return Expanded(
          child: Column(
            children: [
              Icon(
                done ? Icons.check_circle : Icons.radio_button_unchecked,
                size: 22,
                color: current ? MovaColors.violet : (done ? MovaColors.green : MovaColors.textSecondary),
              ),
              const SizedBox(height: 4),
              Text(
                m['label']?.toString() ?? '',
                style: TextStyle(
                  fontSize: 10,
                  color: current ? MovaColors.violet : MovaColors.textSecondary,
                  fontWeight: current ? FontWeight.w600 : FontWeight.normal,
                ),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        );
      }).toList(),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final b = _booking;
    final vehicle = b?['vehicle'] as Map<String, dynamic>?;

    if (_loading && b == null) {
      return const MovaScreen(title: 'Réservation', child: Center(child: CircularProgressIndicator()));
    }

    if (b == null) {
      return MovaScreen(
        title: 'Réservation',
        child: MovaErrorBanner(message: _error ?? 'Réservation introuvable', onRetry: _loadBooking),
      );
    }

    final total = b['totalCdf'] as int? ?? b['estimatedPriceCdf'] as int? ?? b['priceCdf'] as int? ?? 0;
    final ownerPhone = b['ownerContactPhone']?.toString();
    final statusLabel = b['statusLabel']?.toString() ?? b['status']?.toString() ?? 'En attente';
    final status = b['status']?.toString().toUpperCase();
    final canConfirmHandover = b['canConfirmHandover'] == true || status == 'CONFIRMED';
    final canCancel = CancelEligibility.rental(b);
    final paymentReady = b['paymentReady'] == true ||
        status == 'IN_PROGRESS' ||
        status == 'RETURNED';
    final statusColor = switch (status) {
      'CONFIRMED' || 'IN_PROGRESS' || 'RETURNED' => MovaColors.green,
      'CONTACTED' => MovaColors.violet,
      'CLOSED' => Colors.red.shade700,
      _ => MovaColors.textSecondary,
    };

    return MovaScreen(
      title: 'Ma location',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Icon(
            status == 'CLOSED' ? Icons.cancel_outlined : Icons.directions_car,
            color: statusColor,
            size: 64,
          ),
          const SizedBox(height: 8),
          Text(
            statusLabel,
            textAlign: TextAlign.center,
            style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold, color: statusColor),
          ),
          const SizedBox(height: 4),
          Text(
            'Réservation à la journée/semaine — distincte des courses VTC instantanées.',
            textAlign: TextAlign.center,
            style: theme.textTheme.bodySmall?.copyWith(color: MovaColors.textSecondary),
          ),
          const SizedBox(height: 20),
          MovaCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  vehicle?['name']?.toString() ?? b['vehicleType']?.toString() ?? 'Véhicule',
                  style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16),
                ),
                const SizedBox(height: 8),
                Text(
                  '${_formatDate(b['startDate']?.toString())} → ${_formatDate(b['endDate']?.toString())}',
                  style: const TextStyle(color: MovaColors.textSecondary),
                ),
                if (b['remainingLabel'] != null &&
                    (status == 'CONFIRMED' || status == 'IN_PROGRESS' || status == 'RETURNED')) ...[
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      Icon(
                        b['remainingActive'] == true ? Icons.timer_outlined : Icons.event_available,
                        size: 16,
                        color: b['remainingActive'] == true ? MovaColors.violet : MovaColors.textSecondary,
                      ),
                      const SizedBox(width: 6),
                      Text(
                        b['remainingActive'] == true
                            ? 'Temps restant : ${b['remainingLabel']}'
                            : b['remainingLabel']?.toString() ?? '',
                        style: TextStyle(
                          fontWeight: FontWeight.w600,
                          color: b['remainingActive'] == true ? MovaColors.violet : MovaColors.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ],
                if (b['pickupCity'] != null)
                  Text('Prise en charge : ${b['pickupCity']}${b['returnCity'] != null && b['returnCity'] != b['pickupCity'] ? ' → ${b['returnCity']}' : ''}'),
                const SizedBox(height: 8),
                Text(
                  MarketConfig.formatCdf(total),
                  style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: MovaColors.green),
                ),
                Text(
                  'Réf. ${b['id'] ?? widget.bookingId}',
                  style: const TextStyle(fontSize: 12, color: MovaColors.textSecondary),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          Text('Suivi de la réservation', style: theme.textTheme.titleSmall),
          const SizedBox(height: 12),
          _timeline(b['timeline'] as List?),
          if (b['nextStepHint'] != null) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: MovaColors.violet.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: MovaColors.violet.withValues(alpha: 0.2)),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(Icons.info_outline, size: 18, color: MovaColors.violet),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      b['nextStepHint'].toString(),
                      style: theme.textTheme.bodySmall,
                    ),
                  ),
                ],
              ),
            ),
          ],
          if (ownerPhone != null) ...[
            const SizedBox(height: 16),
            OutlinedButton.icon(
              onPressed: () => _callOwner(ownerPhone),
              icon: const Icon(Icons.phone_outlined),
              label: Text('Propriétaire · $ownerPhone'),
            ),
          ],
          if (canConfirmHandover) ...[
            const SizedBox(height: 16),
            MovaButton(
              label: 'J\'ai reçu le véhicule',
              icon: Icons.key_outlined,
              onPressed: _actionLoading ? null : _confirmHandover,
            ),
          ],
          if (paymentReady && total > 0) ...[
            const SizedBox(height: 16),
            MovaButton(
              label: 'Payer la location',
              icon: Icons.payment_outlined,
              onPressed: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => PaymentScreen(
                      serviceType: 'RENTAL',
                      serviceId: widget.bookingId,
                      amountCdf: total,
                    ),
                  ),
                );
              },
            ),
          ],
          if (_error != null) ...[
            const SizedBox(height: 12),
            MovaErrorBanner(message: _error!),
          ],
          const SizedBox(height: 24),
          MovaButton(
            label: 'Retour aux locations',
            icon: Icons.directions_car_outlined,
            onPressed: () => Navigator.pop(context, true),
          ),
          const SizedBox(height: 8),
          if (canCancel)
            TextButton(
              onPressed: _actionLoading ? null : _cancel,
              child: const Text('Annuler la réservation'),
            ),
        ],
      ),
    );
  }
}

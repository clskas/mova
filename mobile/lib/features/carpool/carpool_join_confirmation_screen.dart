import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_client.dart';
import '../../core/billing/service_price_display.dart';
import '../../core/error/result.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import 'carpool_contact.dart';

class CarpoolJoinConfirmationScreen extends ConsumerStatefulWidget {
  const CarpoolJoinConfirmationScreen({
    super.key,
    required this.tripId,
    required this.fromAddress,
    required this.toAddress,
    required this.driverName,
    required this.pricePerSeatCdf,
    this.seats = 1,
    this.departureAt,
  });

  final String tripId;
  final String fromAddress;
  final String toAddress;
  final String driverName;
  final int pricePerSeatCdf;
  final int seats;
  final String? departureAt;

  @override
  ConsumerState<CarpoolJoinConfirmationScreen> createState() =>
      _CarpoolJoinConfirmationScreenState();
}

class _CarpoolJoinConfirmationScreenState extends ConsumerState<CarpoolJoinConfirmationScreen> {
  List<Map<String, dynamic>> _passengers = [];
  String? _contactPhone;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadTrip();
  }

  String _formatDeparture(String? raw) {
    if (raw == null || raw.isEmpty) return '';
    try {
      final dt = DateTime.parse(raw);
      final day = dt.day.toString().padLeft(2, '0');
      final month = dt.month.toString().padLeft(2, '0');
      final hour = dt.hour.toString().padLeft(2, '0');
      final minute = dt.minute.toString().padLeft(2, '0');
      return '$day/$month/${dt.year} à $hour:$minute';
    } catch (_) {
      return raw;
    }
  }

  Future<void> _loadTrip() async {
    if (widget.tripId.isEmpty) {
      setState(() => _loading = false);
      return;
    }
    final api = ref.read(apiClientProvider);
    final result = await api.get('/carpool/${widget.tripId}');
    if (!mounted) return;
    setState(() {
      _loading = false;
      switch (result) {
        case Success(:final data):
          final trip = data['trip'] as Map<String, dynamic>? ?? data;
          _passengers = (trip['passengers'] as List? ?? []).cast<Map<String, dynamic>>();
          _contactPhone = trip['contactPhone']?.toString();
          _error = null;
        case Failure(:final error):
          _error = error.message;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final departure = _formatDeparture(widget.departureAt);

    return MovaScreen(
      title: 'Réservation confirmée',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Icon(Icons.check_circle, color: MovaColors.green, size: 72),
          const SizedBox(height: 16),
          const Text(
            'Vous avez rejoint le trajet',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 24),
          MovaCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${widget.fromAddress} → ${widget.toAddress}',
                  style: const TextStyle(fontWeight: FontWeight.w600),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 8),
                Text('Conducteur : ${widget.driverName}'),
                if (departure.isNotEmpty) Text('Départ : $departure'),
                const SizedBox(height: 8),
                ServicePriceDisplay.carpoolBookingCard(
                  pricePerSeatCdf: widget.pricePerSeatCdf,
                  seats: widget.seats,
                  totalLabel: 'Total réservation',
                ),
                Text(
                  'Réf. ${widget.tripId}',
                  style: const TextStyle(color: MovaColors.textSecondary, fontSize: 12),
                ),
              ],
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 16),
            MovaErrorBanner(message: _error!, onRetry: _loadTrip),
          ],
          const SizedBox(height: 20),
          Text('Passagers', style: Theme.of(context).textTheme.titleSmall),
          const SizedBox(height: 8),
          if (_loading)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 12),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (_passengers.isEmpty)
            const Text(
              'Vous êtes le premier passager inscrit.',
              style: TextStyle(color: MovaColors.textSecondary),
            )
          else
            ..._passengers.map((p) {
              final label = p['label']?.toString() ?? 'Passager ${p['userId']?.toString().substring(0, 6) ?? ''}';
              final seats = p['seats'] as int? ?? 1;
              return Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: MovaCard(
                  child: Row(
                    children: [
                      const Icon(Icons.person_outline, color: MovaColors.violet),
                      const SizedBox(width: 12),
                      Expanded(child: Text(label)),
                      Text('$seats place${seats > 1 ? 's' : ''}'),
                    ],
                  ),
                ),
              );
            }),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: () => showCarpoolContact(context, contactPhone: _contactPhone),
              icon: const Icon(Icons.phone_outlined),
              label: Text(
                _contactPhone != null ? 'Contacter · $_contactPhone' : 'Contacter le conducteur',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ),
          const SizedBox(height: 12),
          MovaButton(
            label: 'Retour à l\'accueil',
            icon: Icons.home_outlined,
            onPressed: () => Navigator.popUntil(context, (r) => r.isFirst),
          ),
        ],
      ),
    );
  }
}

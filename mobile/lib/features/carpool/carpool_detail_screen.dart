import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:latlong2/latlong.dart';
import '../../core/api/api_client.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import '../booking/widgets/mova_ride_map.dart';

class CarpoolDetailScreen extends ConsumerStatefulWidget {
  const CarpoolDetailScreen({
    super.key,
    required this.tripId,
    this.initialTrip,
  });

  final String tripId;
  final Map<String, dynamic>? initialTrip;

  @override
  ConsumerState<CarpoolDetailScreen> createState() => _CarpoolDetailScreenState();
}

class _CarpoolDetailScreenState extends ConsumerState<CarpoolDetailScreen> {
  Map<String, dynamic>? _trip;
  bool _loading = true;
  String? _error;
  int _bookSeats = 1;

  static const _timelineSteps = ['Publié', 'Places réservées', 'En route', 'Terminé'];

  @override
  void initState() {
    super.initState();
    if (widget.initialTrip != null) {
      _trip = widget.initialTrip;
      _loading = false;
    }
    _loadTrip();
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
          _trip = data['trip'] as Map<String, dynamic>? ?? data;
          _error = null;
        case Failure(:final error):
          _error = error.message;
      }
    });
  }

  int _timelineIndex(String? step) {
    final idx = _timelineSteps.indexOf(step ?? '');
    return idx >= 0 ? idx : 0;
  }

  Future<void> _book() async {
    setState(() => _loading = true);
    final api = ref.read(apiClientProvider);
    final result = await api.post('/carpool/${widget.tripId}/book', {'seats': _bookSeats});
    if (!mounted) return;
    setState(() => _loading = false);
    switch (result) {
      case Success():
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Réservation confirmée')),
        );
        _loadTrip();
      case Failure(:final error):
        setState(() => _error = error.message);
    }
  }

  Future<void> _cancel() async {
    final api = ref.read(apiClientProvider);
    final result = await api.post('/carpool/${widget.tripId}/cancel', {});
    if (!mounted) return;
    switch (result) {
      case Success():
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Annulation effectuée')),
        );
        Navigator.pop(context);
      case Failure(:final error):
        setState(() => _error = error.message);
    }
  }

  void _contactDriver() {
    final phone = _trip?['contactPhone']?.toString() ?? '+243 *** ***';
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Contacter le conducteur'),
        content: Text(
          'Messagerie in-app bientôt disponible.\n\n'
          'Téléphone masqué : $phone\n\n'
          'Le numéro complet sera partagé après confirmation.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Fermer')),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final trip = _trip;
    final pickupLat = (trip?['pickupLat'] as num?)?.toDouble() ?? MarketConfig.defaultLat;
    final pickupLng = (trip?['pickupLng'] as num?)?.toDouble() ?? MarketConfig.defaultLng;
    final dropoffLat = (trip?['dropoffLat'] as num?)?.toDouble();
    final dropoffLng = (trip?['dropoffLng'] as num?)?.toDouble();
    final currentStep = _timelineIndex(trip?['timelineStep']?.toString());
    final seatsLeft = trip?['availableSeats'] as int? ?? 0;
    final kyc = trip?['kycVerified'] == true;

    return MovaScreen(
      title: 'Détail du trajet',
      child: _loading && trip == null
          ? const Center(child: CircularProgressIndicator())
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (trip != null)
                  MovaRideMap(
                    pickup: LatLng(pickupLat, pickupLng),
                    dropoff: dropoffLat != null && dropoffLng != null
                        ? LatLng(dropoffLat, dropoffLng)
                        : null,
                    height: 200,
                    driverIcon: Icons.directions_car,
                  ),
                const SizedBox(height: 16),
                if (trip != null) ...[
                  Text(
                    '${trip['fromAddress']} → ${trip['toAddress']}',
                    style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                  ),
                  if (trip['etaLabel'] != null)
                    Text(
                      trip['etaLabel'].toString(),
                      style: const TextStyle(color: MovaColors.textSecondary),
                    ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      const Icon(Icons.person, color: MovaColors.violet, size: 20),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          '${trip['driverName']} · ★ ${trip['driverRating'] ?? '4.5'}',
                          style: const TextStyle(fontWeight: FontWeight.w600),
                        ),
                      ),
                      if (kyc)
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(
                            color: MovaColors.green.withValues(alpha: 0.12),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: const Text(
                            'KYC vérifié',
                            style: TextStyle(color: MovaColors.green, fontSize: 11, fontWeight: FontWeight.w600),
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  _Timeline(currentStep: currentStep, steps: _timelineSteps),
                  const SizedBox(height: 16),
                  MovaCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          MarketConfig.formatCdf(trip['pricePerSeatCdf'] as int? ?? 0),
                          style: const TextStyle(
                            fontSize: 22,
                            fontWeight: FontWeight.bold,
                            color: MovaColors.green,
                          ),
                        ),
                        Text('par place · $seatsLeft place${seatsLeft > 1 ? 's' : ''} restante${seatsLeft > 1 ? 's' : ''}'),
                        if (trip['meetingPoint'] != null) ...[
                          const SizedBox(height: 8),
                          Text('Point de rendez-vous : ${trip['meetingPoint']}'),
                        ],
                        if (trip['notes'] != null) ...[
                          const SizedBox(height: 4),
                          Text('Notes : ${trip['notes']}', style: const TextStyle(color: MovaColors.textSecondary)),
                        ],
                        if (trip['vehicleInfo'] != null) ...[
                          const SizedBox(height: 4),
                          Text('Véhicule : ${trip['vehicleInfo']}'),
                        ],
                        if (trip['ladiesOnly'] == true)
                          const Padding(
                            padding: EdgeInsets.only(top: 8),
                            child: Row(
                              children: [
                                Icon(Icons.female, size: 16, color: MovaColors.violet),
                                SizedBox(width: 4),
                                Text('Femmes uniquement'),
                              ],
                            ),
                          ),
                      ],
                    ),
                  ),
                  if ((trip['passengers'] as List?)?.isNotEmpty == true) ...[
                    const SizedBox(height: 16),
                    Text('Passagers', style: Theme.of(context).textTheme.titleSmall),
                    const SizedBox(height: 8),
                    ...((trip['passengers'] as List).cast<Map<String, dynamic>>()).map(
                      (p) => ListTile(
                        dense: true,
                        leading: const Icon(Icons.person_outline),
                        title: Text(p['label']?.toString() ?? 'Passager'),
                        trailing: Text('${p['seats']} pl.'),
                      ),
                    ),
                  ],
                  const SizedBox(height: 16),
                  if (seatsLeft > 0) ...[
                    Row(
                      children: [
                        const Text('Places :'),
                        const SizedBox(width: 12),
                        DropdownButton<int>(
                          value: _bookSeats.clamp(1, seatsLeft),
                          items: List.generate(
                            seatsLeft.clamp(1, 6),
                            (i) => DropdownMenuItem(value: i + 1, child: Text('${i + 1}')),
                          ),
                          onChanged: (v) => setState(() => _bookSeats = v ?? 1),
                        ),
                      ],
                    ),
                    MovaButton(label: 'Réserver', icon: Icons.event_seat, isLoading: _loading, onPressed: _book),
                  ],
                  const SizedBox(height: 8),
                  OutlinedButton.icon(
                    onPressed: _contactDriver,
                    icon: const Icon(Icons.phone_outlined),
                    label: const Text('Contacter le conducteur'),
                  ),
                  TextButton(onPressed: _cancel, child: const Text('Annuler ma réservation')),
                ],
                if (_error != null) ...[
                  const SizedBox(height: 16),
                  MovaErrorBanner(message: _error!, onRetry: _loadTrip),
                ],
              ],
            ),
    );
  }
}

class _Timeline extends StatelessWidget {
  const _Timeline({required this.currentStep, required this.steps});

  final int currentStep;
  final List<String> steps;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: List.generate(steps.length * 2 - 1, (i) {
        if (i.isOdd) {
          final lineIdx = i ~/ 2;
          return Expanded(
            child: Container(
              height: 2,
              color: lineIdx < currentStep ? MovaColors.green : MovaColors.textSecondary.withValues(alpha: 0.3),
            ),
          );
        }
        final stepIdx = i ~/ 2;
        final done = stepIdx <= currentStep;
        return Column(
          children: [
            CircleAvatar(
              radius: 12,
              backgroundColor: done ? MovaColors.green : MovaColors.textSecondary.withValues(alpha: 0.3),
              child: done
                  ? const Icon(Icons.check, size: 14, color: Colors.white)
                  : Text('${stepIdx + 1}', style: const TextStyle(fontSize: 10)),
            ),
            const SizedBox(height: 4),
            SizedBox(
              width: 64,
              child: Text(
                steps[stepIdx],
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 9,
                  color: done ? MovaColors.green : MovaColors.textSecondary,
                  fontWeight: done ? FontWeight.w600 : FontWeight.normal,
                ),
              ),
            ),
          ],
        );
      }),
    );
  }
}

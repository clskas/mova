import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:latlong2/latlong.dart';
import '../../core/api/api_client.dart';
import '../../core/billing/service_price_display.dart';
import '../../core/billing/driver_earnings_display.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/services/cancel_eligibility.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import '../booking/payment_screen.dart';
import '../booking/widgets/mova_ride_map.dart';
import 'carpool_contact.dart';
import 'carpool_join_confirmation_screen.dart';

enum CarpoolViewerRole { guest, driver, passenger }

class CarpoolDetailScreen extends ConsumerStatefulWidget {
  const CarpoolDetailScreen({
    super.key,
    required this.tripId,
    this.initialTrip,
    this.viewerRole = CarpoolViewerRole.guest,
  });

  final String tripId;
  final Map<String, dynamic>? initialTrip;
  final CarpoolViewerRole viewerRole;

  @override
  ConsumerState<CarpoolDetailScreen> createState() => _CarpoolDetailScreenState();
}

class _CarpoolDetailScreenState extends ConsumerState<CarpoolDetailScreen> {
  Map<String, dynamic>? _trip;
  bool _loading = true;
  bool _actionLoading = false;
  String? _error;
  int _bookSeats = 1;
  int _rateScore = 5;
  final _rateCommentController = TextEditingController();
  bool _rated = false;

  static const _timelineSteps = ['Publié', 'Places réservées', 'En route', 'Terminé'];

  @override
  void initState() {
    super.initState();
    if (widget.initialTrip != null) {
      _trip = widget.initialTrip;
      _rated = widget.initialTrip?['hasRated'] == true;
      _loading = false;
    }
    _loadTrip();
  }

  @override
  void dispose() {
    _rateCommentController.dispose();
    super.dispose();
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
          _rated = _trip?['hasRated'] == true;
          _error = null;
        case Failure(:final error):
          _error = error.message;
      }
    });
  }

  bool get _isDriver => widget.viewerRole == CarpoolViewerRole.driver;

  bool get _isPassenger => widget.viewerRole == CarpoolViewerRole.passenger;

  String? get _status => _trip?['status']?.toString();

  bool get _canStart {
    final s = _status?.toUpperCase();
    return _isDriver && (s == 'OPEN' || s == 'MATCHED');
  }

  bool get _canComplete {
    final s = _status?.toUpperCase();
    return _isDriver && s == 'IN_PROGRESS';
  }

  bool get _canPay {
    if (!_isPassenger || _trip?['isPaid'] == true) return false;
    return _trip?['paymentReady'] == true || _status?.toUpperCase() == 'COMPLETED';
  }

  Future<void> _openPayment() async {
    final trip = _trip;
    if (trip == null) return;
    final seats = (trip['mySeats'] as int?) ?? 1;
    final pricePerSeat = trip['pricePerSeatCdf'] as int? ?? 0;
    final amount = trip['myTotalCdf'] as int? ?? (pricePerSeat * seats);
    if (amount <= 0) return;
    final paymentRef = trip['paymentReferenceId']?.toString() ?? widget.tripId;
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => PaymentScreen(
          serviceType: 'CARPOOL',
          serviceId: paymentRef,
          amountCdf: amount,
        ),
      ),
    );
    _loadTrip();
  }

  bool get _canRate {
    final s = _status?.toUpperCase();
    return _isPassenger && s == 'COMPLETED' && !_rated && _trip?['hasRated'] != true;
  }

  int _timelineIndex(String? step) {
    final idx = _timelineSteps.indexOf(step ?? '');
    return idx >= 0 ? idx : 0;
  }

  Future<void> _book() async {
    final trip = _trip;
    if (trip == null) return;
    setState(() => _actionLoading = true);
    final api = ref.read(apiClientProvider);
    final result = await api.post('/carpool/${widget.tripId}/book', {'seats': _bookSeats});
    if (!mounted) return;
    setState(() => _actionLoading = false);
    switch (result) {
      case Success():
        if (mounted) {
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => CarpoolJoinConfirmationScreen(
                tripId: widget.tripId,
                fromAddress: trip['fromAddress']?.toString() ?? '',
                toAddress: trip['toAddress']?.toString() ?? '',
                driverName: trip['driverName']?.toString() ?? 'Conducteur',
                pricePerSeatCdf: trip['pricePerSeatCdf'] as int? ?? 0,
                seats: _bookSeats,
                departureAt: trip['departureAt']?.toString(),
              ),
            ),
          );
        }
        _loadTrip();
      case Failure(:final error):
        setState(() => _error = error.message);
    }
  }

  Future<void> _startTrip() async {
    setState(() => _actionLoading = true);
    final api = ref.read(apiClientProvider);
    final result = await api.post('/carpool/${widget.tripId}/start', {});
    if (!mounted) return;
    setState(() => _actionLoading = false);
    switch (result) {
      case Success():
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Trajet démarré')),
        );
        _loadTrip();
      case Failure(:final error):
        setState(() => _error = error.message);
    }
  }

  Future<void> _completeTrip() async {
    setState(() => _actionLoading = true);
    final api = ref.read(apiClientProvider);
    final result = await api.post('/carpool/${widget.tripId}/complete', {});
    if (!mounted) return;
    setState(() => _actionLoading = false);
    switch (result) {
      case Success():
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Trajet terminé — paiement en cours')),
        );
        _loadTrip();
      case Failure(:final error):
        setState(() => _error = error.message);
    }
  }

  Future<void> _rateTrip() async {
    setState(() => _actionLoading = true);
    final api = ref.read(apiClientProvider);
    final result = await api.post('/carpool/${widget.tripId}/rate', {
      'score': _rateScore,
      if (_rateCommentController.text.trim().isNotEmpty)
        'comment': _rateCommentController.text.trim(),
    });
    if (!mounted) return;
    setState(() => _actionLoading = false);
    switch (result) {
      case Success():
        setState(() => _rated = true);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Merci pour votre évaluation')),
        );
      case Failure(:final error):
        setState(() => _error = error.message);
    }
  }

  Future<void> _cancel() async {
    setState(() => _actionLoading = true);
    final api = ref.read(apiClientProvider);
    final result = await api.post('/carpool/${widget.tripId}/cancel', {});
    if (!mounted) return;
    setState(() => _actionLoading = false);
    switch (result) {
      case Success():
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(_isDriver ? 'Trajet annulé' : 'Réservation annulée')),
        );
        Navigator.pop(context);
      case Failure(:final error):
        setState(() => _error = error.message);
    }
  }

  void _contactDriver() {
    showCarpoolContact(context, contactPhone: _trip?['contactPhone']?.toString());
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
    final rating = trip?['driverRating']?.toString();
    final showBook = !_isDriver && !_isPassenger && seatsLeft > 0;

    return MovaScreen(
      title: _isDriver ? 'Mon trajet' : 'Détail du trajet',
      child: _loading && trip == null
          ? const Center(child: CircularProgressIndicator())
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (_isDriver || _isPassenger)
                  Container(
                    margin: const EdgeInsets.only(bottom: 12),
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(
                      color: MovaColors.violet.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Row(
                      children: [
                        Icon(
                          _isDriver ? Icons.directions_car : Icons.event_seat,
                          size: 18,
                          color: MovaColors.violet,
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            _isDriver
                                ? 'Covoiturage planifié — pas une course VTC instantanée.'
                                : 'Vous êtes passager sur ce trajet partagé.',
                            style: const TextStyle(fontSize: 12, color: MovaColors.violet),
                          ),
                        ),
                      ],
                    ),
                  ),
                if (trip != null)
                  MovaRideMap(
                    pickup: LatLng(pickupLat, pickupLng),
                    dropoff: dropoffLat != null && dropoffLng != null
                        ? LatLng(dropoffLat, dropoffLng)
                        : null,
                    height: 200,
                    driverIcon: Icons.directions_car,
                    pickupLabel: trip['fromAddress']?.toString(),
                    dropoffLabel: trip['toAddress']?.toString(),
                  ),
                const SizedBox(height: 16),
                if (trip != null) ...[
                  Text(
                    '${trip['fromAddress']} → ${trip['toAddress']}',
                    style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
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
                          rating != null
                              ? '${trip['driverName']} · ★ $rating'
                              : trip['driverName']?.toString() ?? 'Conducteur',
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
                            'KYC',
                            style: TextStyle(color: MovaColors.green, fontSize: 11, fontWeight: FontWeight.w600),
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  if (_status?.toUpperCase() == 'CANCELLED')
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.red.withValues(alpha: 0.08),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: const Row(
                        children: [
                          Icon(Icons.cancel_outlined, color: Colors.red, size: 20),
                          SizedBox(width: 8),
                          Expanded(child: Text('Trajet annulé', style: TextStyle(color: Colors.red))),
                        ],
                      ),
                    )
                  else
                    _Timeline(currentStep: currentStep, steps: _timelineSteps),
                  const SizedBox(height: 16),
                  if (_isDriver && DriverEarningsDisplay.netFromMap(trip) != null)
                    ServicePriceDisplay.driverMissionCard({...trip, 'type': 'CARPOOL'})
                  else if (_isDriver)
                    const SizedBox.shrink()
                  else if (showBook)
                    ServicePriceDisplay.carpoolBookingCard(
                      pricePerSeatCdf: trip['pricePerSeatCdf'] as int? ?? 0,
                      seats: _bookSeats,
                      totalLabel: 'Total réservation',
                    )
                  else if (_isPassenger && (trip['mySeats'] as int? ?? 0) > 0)
                    ServicePriceDisplay.carpoolBookingCard(
                      pricePerSeatCdf: trip['pricePerSeatCdf'] as int? ?? 0,
                      seats: trip['mySeats'] as int? ?? 1,
                      totalLabel: 'Votre réservation',
                    )
                  else
                    ServicePriceDisplay.passengerCard(
                      {...trip, 'type': 'CARPOOL'},
                      totalLabel: 'Prix par place',
                      seats: 1,
                    ),
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Text(
                      '$seatsLeft place${seatsLeft > 1 ? 's' : ''} restante${seatsLeft > 1 ? 's' : ''}',
                      style: const TextStyle(color: MovaColors.textSecondary),
                    ),
                  ),
                  MovaCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (trip['meetingPoint'] != null) ...[
                          const SizedBox(height: 8),
                          Text('Point de rendez-vous : ${trip['meetingPoint']}'),
                        ],
                        if (trip['notes'] != null) ...[
                          const SizedBox(height: 4),
                          Text('Notes : ${trip['notes']}', style: const TextStyle(color: MovaColors.textSecondary)),
                        ],
                        if (trip['vehicleInfo'] != null || trip['vehicleImageUrl'] != null) ...[
                          const SizedBox(height: 8),
                          if (trip['vehicleImageUrl'] != null &&
                              trip['vehicleImageUrl'].toString().isNotEmpty)
                            ClipRRect(
                              borderRadius: BorderRadius.circular(12),
                              child: Image.network(
                                MarketConfig.resolveMediaUrl(trip['vehicleImageUrl'].toString()),
                                height: 120,
                                width: double.infinity,
                                fit: BoxFit.cover,
                                errorBuilder: (_, __, ___) => const SizedBox.shrink(),
                              ),
                            ),
                          if (trip['vehicleInfo'] != null)
                            Text('Véhicule : ${trip['vehicleInfo']}'),
                          if (trip['vehicleType'] != null)
                            Text(
                              'Type : ${trip['vehicleType']}',
                              style: const TextStyle(fontSize: 12, color: MovaColors.textSecondary),
                            ),
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
                  if (_isDriver && (_canStart || _canComplete)) ...[
                    const SizedBox(height: 16),
                    Text('Actions conducteur', style: Theme.of(context).textTheme.titleSmall),
                    const SizedBox(height: 8),
                    if (_canStart)
                      MovaButton(
                        label: 'Démarrer le trajet',
                        icon: Icons.play_arrow,
                        isLoading: _actionLoading,
                        onPressed: _startTrip,
                      ),
                    if (_canComplete) ...[
                      if (_canStart) const SizedBox(height: 8),
                      MovaButton(
                        label: 'Terminer le trajet',
                        icon: Icons.flag,
                        isLoading: _actionLoading,
                        onPressed: _completeTrip,
                      ),
                    ],
                  ],
                  if (_canPay) ...[
                    const SizedBox(height: 16),
                    MovaButton(
                      label: 'Payer ma place',
                      icon: Icons.payment_outlined,
                      isLoading: _actionLoading,
                      onPressed: _openPayment,
                    ),
                  ],
                  if (_canRate) ...[
                    const SizedBox(height: 16),
                    Text('Évaluer le conducteur', style: Theme.of(context).textTheme.titleSmall),
                    const SizedBox(height: 8),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: List.generate(5, (i) {
                        final star = i + 1;
                        return IconButton(
                          icon: Icon(
                            star <= _rateScore ? Icons.star : Icons.star_border,
                            color: Colors.amber,
                            size: 36,
                          ),
                          onPressed: () => setState(() => _rateScore = star),
                        );
                      }),
                    ),
                    TextField(
                      controller: _rateCommentController,
                      maxLines: 2,
                      decoration: const InputDecoration(
                        labelText: 'Commentaire (optionnel)',
                        hintText: 'Comment s\'est passé le trajet ?',
                      ),
                    ),
                    const SizedBox(height: 8),
                    MovaButton(
                      label: 'Envoyer l\'évaluation',
                      icon: Icons.rate_review_outlined,
                      isLoading: _actionLoading,
                      onPressed: _rateTrip,
                    ),
                  ],
                  if (_rated)
                    const Padding(
                      padding: EdgeInsets.only(top: 16),
                      child: Row(
                        children: [
                          Icon(Icons.check_circle, color: MovaColors.green, size: 20),
                          SizedBox(width: 8),
                          Text('Évaluation envoyée', style: TextStyle(color: MovaColors.green)),
                        ],
                      ),
                    ),
                  const SizedBox(height: 16),
                  if (showBook) ...[
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
                    MovaButton(
                      label: 'Réserver',
                      icon: Icons.event_seat,
                      isLoading: _actionLoading,
                      onPressed: _book,
                    ),
                  ],
                  if (!_isDriver) ...[
                    const SizedBox(height: 8),
                    SizedBox(
                      width: double.infinity,
                      child: OutlinedButton.icon(
                        onPressed: _contactDriver,
                        icon: const Icon(Icons.phone_outlined),
                        label: Text(
                          trip['contactPhone'] != null
                              ? 'Appeler · ${trip['contactPhone']}'
                              : 'Contacter le conducteur',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ),
                  ],
                  if ((_isDriver || _isPassenger) && CancelEligibility.carpool(trip))
                    TextButton(
                      onPressed: _actionLoading ? null : _cancel,
                      child: Text(_isDriver ? 'Annuler le trajet' : 'Annuler ma réservation'),
                    ),
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
      crossAxisAlignment: CrossAxisAlignment.start,
      children: List.generate(steps.length, (stepIdx) {
        final done = stepIdx <= currentStep;
        final lineColor = done ? MovaColors.green : MovaColors.textSecondary.withValues(alpha: 0.3);
        return Expanded(
          child: Column(
            children: [
              Row(
                children: [
                  if (stepIdx > 0)
                    Expanded(child: Container(height: 2, color: stepIdx <= currentStep ? MovaColors.green : lineColor)),
                  CircleAvatar(
                    radius: 12,
                    backgroundColor: done ? MovaColors.green : MovaColors.textSecondary.withValues(alpha: 0.3),
                    child: done
                        ? const Icon(Icons.check, size: 14, color: Colors.white)
                        : Text('${stepIdx + 1}', style: const TextStyle(fontSize: 10, color: Colors.white)),
                  ),
                  if (stepIdx < steps.length - 1)
                    Expanded(child: Container(height: 2, color: stepIdx < currentStep ? MovaColors.green : lineColor)),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                steps[stepIdx],
                textAlign: TextAlign.center,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 9,
                  height: 1.2,
                  color: done ? MovaColors.green : MovaColors.textSecondary,
                  fontWeight: done ? FontWeight.w600 : FontWeight.normal,
                ),
              ),
            ],
          ),
        );
      }),
    );
  }
}

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:latlong2/latlong.dart';
import '../../core/api/api_client.dart';
import '../../core/billing/service_price_display.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/services/cancel_eligibility.dart';
import '../../core/location/service_area_location.dart';
import '../../core/location/destination_field_sync.dart';
import '../../core/location/location_service.dart';
import '../../core/theme/mova_colors.dart';
import '../booking/widgets/mova_ride_map.dart';
import '../../core/location/destination_coords.dart';
import '../../core/widgets/destination_coord_panel.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import '../../widgets/promo_code_field.dart';
import '../booking/payment_screen.dart';
import '../booking/tracking_screen.dart';
import '../history/history_detail_dialog.dart';

class ScheduledRideScreen extends ConsumerStatefulWidget {
  const ScheduledRideScreen({super.key});

  @override
  ConsumerState<ScheduledRideScreen> createState() => _ScheduledRideScreenState();
}

class _ScheduledRideScreenState extends ConsumerState<ScheduledRideScreen> {
  final _destinationController = TextEditingController();
  final _promoController = TextEditingController();
  DateTime _scheduledAt = DateTime.now().add(const Duration(hours: 2));
  String _vehicleType = 'MOTO_TAXI';
  LatLng _pickup = LatLng(MarketConfig.defaultLat, MarketConfig.defaultLng);
  String _pickupLabel = 'Ma position';
  LatLng? _dropoff;
  bool _dropoffFromSuggestion = false;
  bool _dropoffFromManualCoords = false;
  List<Map<String, dynamic>> _suggestions = [];
  int? _estimatedPrice;
  Map<String, dynamic>? _estimateBreakdown;
  int? _discountCdf;
  String? _appliedPromoCode;
  bool _loading = false;
  bool _loadingGps = false;
  bool _loadingSuggestions = false;
  bool _loadingUpcoming = true;
  bool _showSuggestions = false;
  List<Map<String, dynamic>> _upcoming = [];
  String? _error;
  String? _validationError;
  Timer? _debounce;
  Timer? _pollTimer;

  String _vehicleLabel(String id) {
    for (final v in MarketConfig.vehicleTypes) {
      if (v.id == id) return v.label;
    }
    return id;
  }

  String _shortRef(String? id) {
    if (id == null || id.isEmpty) return '—';
    return id.length <= 8 ? id.toUpperCase() : id.substring(0, 8).toUpperCase();
  }

  DateTime get _maxDate => DateTime.now().add(const Duration(days: 7));

  String _formatDateTime(DateTime dt) {
    final day = dt.day.toString().padLeft(2, '0');
    final month = dt.month.toString().padLeft(2, '0');
    final hour = dt.hour.toString().padLeft(2, '0');
    final minute = dt.minute.toString().padLeft(2, '0');
    return '$day/$month/${dt.year} à $hour:$minute';
  }

  Map<String, dynamic> _ridePayload() {
    final dropoff = _dropoff ?? ServiceAreaLocation.defaultDropoffOffset(near: _pickup);
    return {
      'pickupLat': _pickup.latitude,
      'pickupLng': _pickup.longitude,
      'dropoffLat': dropoff.latitude,
      'dropoffLng': dropoff.longitude,
      'pickupAddress': _pickupLabel,
      'dropoffAddress': _destinationController.text.trim(),
      'vehicleType': MarketConfig.apiVehicleType(_vehicleType),
      'scheduledAt': _scheduledAt.toIso8601String(),
      if (_promoController.text.trim().isNotEmpty) 'promoCode': _promoController.text.trim(),
    };
  }

  Map<String, dynamic> _estimatePayload() => _ridePayload();

  @override
  void initState() {
    super.initState();
    _destinationController.addListener(_onDestinationChanged);
    _loadUpcoming();
    _pollTimer = Timer.periodic(const Duration(seconds: 12), (_) => _loadUpcoming(silent: true));
    _useMyLocation(silent: true);
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _pollTimer?.cancel();
    _destinationController.removeListener(_onDestinationChanged);
    _destinationController.dispose();
    _promoController.dispose();
    super.dispose();
  }

  void _onDestinationChanged() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), _fetchSuggestions);
    setState(() {
      _estimatedPrice = null;
      _estimateBreakdown = null;
      _dropoff = null;
      _dropoffFromSuggestion = false;
      _dropoffFromManualCoords = false;
    });
  }

  Future<void> _fetchSuggestions() async {
    final query = _destinationController.text.trim();
    if (query.length < 2) {
      setState(() {
        _suggestions = [];
        _showSuggestions = false;
      });
      return;
    }
    setState(() => _loadingSuggestions = true);
    final api = ref.read(apiClientProvider);
    final result = await api.geoAutocomplete(query);
    if (!mounted) return;
    setState(() {
      _loadingSuggestions = false;
      switch (result) {
        case Success(:final data):
          _suggestions = data;
          _showSuggestions = data.isNotEmpty;
        case Failure():
          _suggestions = [];
          _showSuggestions = false;
      }
    });
  }

  void _selectSuggestion(Map<String, dynamic> suggestion) {
    final label = suggestion['label']?.toString() ??
        suggestion['address']?.toString() ??
        '';
    DestinationFieldSync.setText(_destinationController, _onDestinationChanged, label);
    _dropoff = ServiceAreaLocation.ensureInServiceArea(
      LatLng(
        (suggestion['lat'] as num?)?.toDouble() ?? MarketConfig.defaultLat - 0.03,
        (suggestion['lng'] as num?)?.toDouble() ?? MarketConfig.defaultLng + 0.04,
      ),
      address: label,
    );
    setState(() {
      _showSuggestions = false;
      _suggestions = [];
      _estimatedPrice = null;
      _estimateBreakdown = null;
      _dropoffFromSuggestion = true;
      _dropoffFromManualCoords = false;
    });
  }

  void _setDropoffFromCoords(LatLng coords, String label) {
    _dropoff = ServiceAreaLocation.ensureInServiceArea(coords, address: label);
    DestinationFieldSync.setText(_destinationController, _onDestinationChanged, label);
    setState(() {
      _showSuggestions = false;
      _suggestions = [];
      _estimatedPrice = null;
      _estimateBreakdown = null;
      _dropoffFromSuggestion = false;
      _dropoffFromManualCoords = true;
    });
  }

  Future<void> _onMapDropoffTap(LatLng raw) async {
    if (!ServiceAreaLocation.isInBounds(raw)) {
      setState(() => _validationError = ServiceAreaLocation.outOfAreaMessage());
      return;
    }
    _setDropoffFromCoords(raw, LocationService.coordsLabel(raw));
    final label = await ServiceAreaLocation.labelForCoords(raw);
    if (!mounted || !_dropoffFromManualCoords) return;
    DestinationFieldSync.setText(_destinationController, _onDestinationChanged, label);
    setState(() {});
  }

  Future<void> _useMyLocation({bool silent = false}) async {
    if (!silent) setState(() => _loadingGps = true);
    final result = await LocationService.getCurrentLocation();
    if (!mounted) return;
    setState(() {
      _loadingGps = false;
      if (result != null) {
        _pickup = ServiceAreaLocation.ensureInServiceArea(
          result.position,
          address: result.label,
        );
        _pickupLabel = ServiceAreaLocation.isInBounds(result.position)
            ? result.label
            : 'Ma position';
        _estimatedPrice = null;
        _estimateBreakdown = null;
      } else if (!silent) {
        _validationError =
            'Impossible d\'obtenir votre position. Activez le GPS et autorisez la localisation.';
      }
    });
  }

  Future<String?> _resolveCoords() async {
    _pickup = ServiceAreaLocation.ensureInServiceArea(
      _pickup,
      address: _pickupLabel,
    );
    if (_dropoffFromManualCoords && _dropoff != null && ServiceAreaLocation.isInBounds(_dropoff!)) {
      return null;
    }
    final fromTextCoords = DestinationCoords.parseText(_destinationController.text);
    if (fromTextCoords != null && ServiceAreaLocation.isInBounds(fromTextCoords)) {
      _dropoff = fromTextCoords;
      _dropoffFromManualCoords = true;
      _dropoffFromSuggestion = false;
      return null;
    }
    if (_dropoff == null || !ServiceAreaLocation.isInBounds(_dropoff!)) {
      var resolved = ServiceAreaLocation.coordsFromAddress(_destinationController.text);
      if (!ServiceAreaLocation.destinationInServiceArea(
        _destinationController.text,
        coords: resolved,
        fromSuggestion: _dropoffFromSuggestion,
      )) {
        final api = ref.read(apiClientProvider);
        final result = await api.geoAutocomplete(_destinationController.text.trim());
        if (result case Success(:final data) when data.isNotEmpty) {
          final s = data.first;
          resolved = LatLng(
            (s['lat'] as num?)?.toDouble() ?? MarketConfig.defaultLat,
            (s['lng'] as num?)?.toDouble() ?? MarketConfig.defaultLng,
          );
          if (ServiceAreaLocation.isInBounds(resolved)) {
            _dropoff = resolved;
            _dropoffFromSuggestion = true;
            return null;
          }
        }
        return 'SENGA couvre toute la République Démocratique du Congo. Indiquez une destination valide.';
      }
      _dropoff = ServiceAreaLocation.ensureInServiceArea(
        resolved,
        address: _destinationController.text,
      );
    } else if (!ServiceAreaLocation.destinationInServiceArea(
      _destinationController.text,
      coords: _dropoff,
      fromSuggestion: _dropoffFromSuggestion,
    )) {
      return ServiceAreaLocation.outOfAreaMessage();
    }
    return null;
  }

  Future<void> _loadUpcoming({bool silent = false}) async {
    if (!silent) setState(() => _loadingUpcoming = true);
    final api = ref.read(apiClientProvider);
    await api.checkHealth();
    final result = await api.get('/rides/scheduled');
    if (result case Success(:final data)) {
      final list = data['data'] as List? ?? (data is List ? data : null);
      if (mounted) {
        setState(() {
          _upcoming = (list ?? []).cast<Map<String, dynamic>>();
          if (!silent) _loadingUpcoming = false;
        });
      }
    } else if (mounted && !silent) {
      setState(() => _loadingUpcoming = false);
    }
  }

  Future<void> _showScheduledDetail(Map<String, dynamic> ride) async {
    final id = ride['id']?.toString() ?? '';
    Map<String, dynamic> live = ride;
    if (id.isNotEmpty) {
      final api = ref.read(apiClientProvider);
      final result = await api.get('/rides/scheduled/$id');
      if (result case Success(:final data)) {
        live = data['scheduledRide'] as Map<String, dynamic>? ??
            (data is Map<String, dynamic> ? data : ride);
      }
    }
    if (!mounted) return;
    final status = live['status']?.toString() ?? 'SCHEDULED';
    final timeline = scheduledTimelineSteps(status);
    final scheduledRaw = live['scheduledAt']?.toString();
    final when = scheduledRaw != null ? _formatDateTime(DateTime.parse(scheduledRaw)) : '—';

    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Réservation planifiée'),
        content: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('Réf. ${_shortRef(id)}', style: const TextStyle(color: MovaColors.violet, fontSize: 12)),
              const SizedBox(height: 8),
              Text(live['dropoffAddress']?.toString() ?? 'Destination',
                  style: const TextStyle(fontWeight: FontWeight.w600)),
              Text('Départ : ${live['pickupAddress'] ?? 'Ma position'}',
                  style: const TextStyle(fontSize: 13, color: MovaColors.textSecondary)),
              Text('Date : $when', style: const TextStyle(fontSize: 13)),
              Text(
                historyStatusLabel(status),
                style: const TextStyle(color: MovaColors.violet, fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 8),
              ServicePriceDisplay.passengerCard(
                {...live, 'type': 'SCHEDULED'},
                totalLabel: 'Tarif réservation',
              ),
              if (live['lateCancelWarning'] != null) ...[
                const SizedBox(height: 8),
                Text(
                  live['lateCancelWarning'].toString(),
                  style: const TextStyle(fontSize: 12, color: MovaColors.orange, height: 1.3),
                ),
              ],
              if (live['status']?.toString() == 'CONFIRMED') ...[
                const SizedBox(height: 8),
                const Row(
                  children: [
                    Icon(Icons.check_circle_outline, size: 16, color: MovaColors.green),
                    SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        'Chauffeur assigné — vous serez notifié au démarrage.',
                        style: TextStyle(fontSize: 12, color: MovaColors.green),
                      ),
                    ),
                  ],
                ),
              ],
              const SizedBox(height: 12),
              const Text(
                'SENGA confirme la réservation et assigne un chauffeur avant l\'heure prévue. '
                'Les mises à jour admin apparaissent ici automatiquement.',
                style: TextStyle(fontSize: 12, color: MovaColors.textSecondary, height: 1.35),
              ),
              const SizedBox(height: 12),
              const Text('Suivi', style: TextStyle(fontWeight: FontWeight.w600)),
              ...timeline.map((step) {
                final done = step['done'] == true;
                return Padding(
                  padding: const EdgeInsets.only(top: 6),
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
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Fermer')),
          if (status == 'IN_PROGRESS' &&
              (live['linkedRideId'] ?? live['rideId'])?.toString().isNotEmpty == true)
            FilledButton.icon(
              onPressed: () {
                final trackId = (live['linkedRideId'] ?? live['rideId']).toString();
                Navigator.pop(ctx);
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => TrackingScreen(
                      rideId: trackId,
                      estimatedFareCdf: live['estimatedPriceCdf'] as int? ?? live['priceCdf'] as int? ?? 0,
                    ),
                  ),
                );
              },
              icon: const Icon(Icons.map_outlined),
              label: const Text('Suivre en direct'),
            ),
          if (status == 'COMPLETED' && id.isNotEmpty)
            FilledButton(
              onPressed: () {
                Navigator.pop(ctx);
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => PaymentScreen(
                      serviceType: 'SCHEDULED',
                      serviceId: id,
                      amountCdf: live['estimatedPriceCdf'] as int? ?? live['priceCdf'] as int? ?? 0,
                      completionPin: live['completionPin']?.toString(),
                    ),
                  ),
                );
              },
              child: const Text('Payer'),
            ),
          if (id.isNotEmpty && CancelEligibility.scheduled(live))
            TextButton(
              onPressed: () {
                Navigator.pop(ctx);
                _cancelScheduled(id, ride: live);
              },
              child: const Text('Annuler'),
            ),
        ],
      ),
    );
  }

  Future<void> _cancelScheduled(String id, {Map<String, dynamic>? ride}) async {
    Map<String, dynamic> info = ride ?? {};
    if (info.isEmpty) {
      final result = await ref.read(apiClientProvider).get('/rides/scheduled/$id');
      if (result case Success(:final data)) {
        info = data is Map<String, dynamic> ? data : info;
      }
    }
    final warning = info['lateCancelWarning']?.toString();
    final blockReason = info['cancelBlockReason']?.toString();
    if (info['canCancel'] == false && blockReason != null) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(blockReason)));
      return;
    }
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Annuler la réservation ?'),
        content: Text(
          warning ??
              'Votre réservation sera annulée. Aucun frais si plus de 24 h avant le départ.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Non')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Oui, annuler')),
        ],
      ),
    );
    if (confirm != true || !mounted) return;
    setState(() => _loading = true);
    final api = ref.read(apiClientProvider);
    await api.post('/rides/scheduled/$id/cancel', {'reason': 'Annulé par le passager'});
    if (!mounted) return;
    setState(() => _loading = false);
    await _loadUpcoming();
  }

  Future<void> _pickDateTime() async {
    final date = await showDatePicker(
      context: context,
      initialDate: _scheduledAt,
      firstDate: DateTime.now(),
      lastDate: _maxDate,
    );
    if (date == null || !mounted) return;

    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(_scheduledAt),
    );
    if (time == null || !mounted) return;

    final combined = DateTime(date.year, date.month, date.day, time.hour, time.minute);
    if (combined.isBefore(DateTime.now())) {
      setState(() => _validationError = 'La date doit être dans le futur.');
      return;
    }
    setState(() {
      _scheduledAt = combined;
      _estimatedPrice = null;
      _estimateBreakdown = null;
      _validationError = null;
    });
  }

  String? _validate() {
    if (_destinationController.text.trim().isEmpty) {
      return 'Indiquez votre destination.';
    }
    if (_scheduledAt.isBefore(DateTime.now())) {
      return 'La date de réservation doit être dans le futur.';
    }
    return null;
  }

  Future<void> _estimate() async {
    final validation = _validate();
    if (validation != null) {
      setState(() => _validationError = validation);
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
      _validationError = null;
    });
    final coordError = await _resolveCoords();
    if (!mounted) return;
    if (coordError != null) {
      setState(() {
        _loading = false;
        _validationError = coordError;
      });
      return;
    }
    final api = ref.read(apiClientProvider);
    await api.checkHealth();
    final result = await api.post('/rides/scheduled/estimate', _estimatePayload());
    setState(() {
      _loading = false;
      switch (result) {
        case Success(:final data):
          _estimatedPrice = (data['estimatedPriceCdf'] ?? data['estimatedFareCdf']) as int?;
          _estimateBreakdown = Map<String, dynamic>.from(data);
          _discountCdf = (data['discountCdf'] as num?)?.toInt();
          _appliedPromoCode = data['promoCode']?.toString();
        case Failure(:final error):
          _error = error.message;
      }
    });
  }

  Future<void> _confirm() async {
    final validation = _validate();
    if (validation != null) {
      setState(() => _validationError = validation);
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
      _validationError = null;
    });
    final coordError = await _resolveCoords();
    if (!mounted) return;
    if (coordError != null) {
      setState(() {
        _loading = false;
        _validationError = coordError;
      });
      return;
    }
    final api = ref.read(apiClientProvider);
    final result = await api.post('/rides/scheduled', _ridePayload());
    setState(() => _loading = false);
    switch (result) {
      case Success(:final data):
        if (mounted) {
          final ride = data['scheduledRide'] as Map<String, dynamic>? ??
              data['ride'] as Map<String, dynamic>?;
          final when = _formatDateTime(_scheduledAt);
          await _loadUpcoming();
          if (!mounted) return;
          showDialog<void>(
            context: context,
            builder: (ctx) => AlertDialog(
              title: const Text('Réservation confirmée'),
              content: Text(
                'Votre transport SENGA est réservé.\n\n'
                'Référence : ${_shortRef(ride?['id']?.toString())}\n'
                'Date et heure : $when\n'
                'Départ : Ma position\n'
                'Destination : ${_destinationController.text.trim()}\n'
                'Véhicule : ${_vehicleLabel(_vehicleType)}'
                '${_estimatedPrice != null ? '\nTarif estimé : ${MarketConfig.formatCdf(_estimatedPrice!)}' : ''}\n\n'
                'Vous recevrez un rappel la veille (J-1) et avant le départ. '
                'Consultez « Mes réservations » pour modifier ou annuler.',
                maxLines: 12,
                overflow: TextOverflow.ellipsis,
              ),
              actions: [
                TextButton(
                  onPressed: () {
                    Navigator.pop(ctx);
                    setState(() {
                      _estimatedPrice = null;
                    _estimateBreakdown = null;
                      _destinationController.clear();
                    });
                  },
                  child: const Text('OK'),
                ),
              ],
            ),
          );
        }
      case Failure(:final error):
        setState(() => _error = error.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final formattedDate = _formatDateTime(_scheduledAt);

    return MovaScreen(
      title: 'Réservation planifiée',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Réserver à l\'avance',
            style: theme.textTheme.titleSmall?.copyWith(
              fontWeight: FontWeight.w600,
              color: MovaColors.midnight,
            ),
          ),
          const SizedBox(height: 4),
          const Text(
            'Programmez un trajet jusqu\'à 7 jours à l\'avance. '
            'SENGA assigne un chauffeur avant l\'heure — rappels J-1 et H-1.',
            style: TextStyle(color: MovaColors.textSecondary, height: 1.3),
          ),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: MovaColors.orange.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: MovaColors.orange.withValues(alpha: 0.25)),
            ),
            child: const Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.info_outline, size: 18, color: MovaColors.orange),
                SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Annulation gratuite jusqu\'à 24 h avant le départ. '
                    'Au-delà : 50 % du tarif estimé si un chauffeur est déjà assigné.',
                    style: TextStyle(fontSize: 12, color: MovaColors.textSecondary, height: 1.35),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          if (_loadingUpcoming)
            const Padding(
              padding: EdgeInsets.only(bottom: 16),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (_upcoming.isNotEmpty) ...[
            Text('Mes réservations', style: theme.textTheme.titleSmall),
            const SizedBox(height: 8),
            ..._upcoming.map((map) {
              final id = map['id']?.toString() ?? '';
              final scheduledRaw = map['scheduledAt']?.toString();
              final scheduledLabel = scheduledRaw != null
                  ? _formatDateTime(DateTime.parse(scheduledRaw))
                  : '';
              final ref = _shortRef(id);
              return Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: MovaCard(
                  onTap: () => _showScheduledDetail(map),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Réf. $ref',
                        style: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: MovaColors.violet,
                          letterSpacing: 0.5,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        map['dropoffAddress']?.toString() ?? 'Destination',
                        style: const TextStyle(fontWeight: FontWeight.w600),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 4),
                      Text(
                        scheduledLabel,
                        style: const TextStyle(color: MovaColors.textSecondary, fontSize: 13),
                      ),
                      const SizedBox(height: 4),
                      ServicePriceDisplay.passengerCard(
                        {...map, 'type': 'SCHEDULED'},
                        totalLabel: 'Tarif réservation',
                      ),
                      Text(
                        historyStatusLabel(map['status']?.toString()),
                        style: const TextStyle(color: MovaColors.violet, fontWeight: FontWeight.w600, fontSize: 13),
                      ),
                      if (map['status']?.toString() == 'IN_PROGRESS' &&
                          (map['linkedRideId'] ?? map['rideId'])?.toString().isNotEmpty == true)
                        Align(
                          alignment: Alignment.centerRight,
                          child: TextButton.icon(
                            onPressed: () {
                              final trackId = (map['linkedRideId'] ?? map['rideId']).toString();
                              Navigator.push(
                                context,
                                MaterialPageRoute(
                                  builder: (_) => TrackingScreen(
                                    rideId: trackId,
                                    estimatedFareCdf: map['estimatedPriceCdf'] as int? ?? map['priceCdf'] as int? ?? 0,
                                  ),
                                ),
                              );
                            },
                            icon: const Icon(Icons.map_outlined, size: 18),
                            label: const Text('Suivre en direct'),
                          ),
                        ),
                      if (id.isNotEmpty && CancelEligibility.scheduled(map))
                        Align(
                          alignment: Alignment.centerRight,
                          child: TextButton.icon(
                            onPressed: _loading ? null : () => _cancelScheduled(id, ride: map),
                            icon: const Icon(Icons.cancel_outlined, size: 18),
                            label: const Text('Annuler'),
                          ),
                        ),
                    ],
                  ),
                ),
              );
            }),
            const Divider(height: 32),
            Text('Nouvelle réservation transport', style: theme.textTheme.titleSmall),
            const SizedBox(height: 12),
          ] else ...[
            const Padding(
              padding: EdgeInsets.only(bottom: 16),
              child: Text(
                'Aucune réservation transport à venir.',
                style: TextStyle(color: MovaColors.textSecondary),
              ),
            ),
          ],
          MovaCard(
            onTap: _pickDateTime,
            child: Row(
              children: [
                const Icon(Icons.calendar_today_outlined, color: MovaColors.violet),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Date et heure de réservation', style: theme.textTheme.titleSmall),
                      const SizedBox(height: 4),
                      Text(
                        formattedDate,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(color: MovaColors.textSecondary),
                      ),
                    ],
                  ),
                ),
                const Icon(Icons.chevron_right),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Text(
            'Réservation possible jusqu\'à J+7 · Rappel la veille (J-1)',
            style: theme.textTheme.bodySmall?.copyWith(color: MovaColors.textSecondary),
          ),
          const SizedBox(height: 16),
          MovaRideMap(
            pickup: _pickup,
            dropoff: _dropoff,
            onDropoffTap: _onMapDropoffTap,
            dropoffEditable: true,
            height: 180,
            pickupLabel: _pickupLabel,
            dropoffLabel: _destinationController.text,
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: Text(
                  _loadingGps
                      ? 'Localisation…'
                      : 'Départ : $_pickupLabel',
                  style: const TextStyle(color: MovaColors.textSecondary, fontSize: 13),
                ),
              ),
              IconButton(
                icon: const Icon(Icons.gps_fixed, color: MovaColors.violet),
                onPressed: _loadingGps ? null : () => _useMyLocation(),
              ),
            ],
          ),
          TextField(
            controller: _destinationController,
            decoration: InputDecoration(
              labelText: 'Destination',
              hintText: 'Ex: Aéroport, Gombe…',
              prefixIcon: const Icon(Icons.place),
              suffixIcon: _loadingSuggestions
                  ? const Padding(
                      padding: EdgeInsets.all(12),
                      child: SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      ),
                    )
                  : null,
            ),
            onTap: () => setState(() => _showSuggestions = _suggestions.isNotEmpty),
          ),
          if (_showSuggestions && _suggestions.isNotEmpty)
            MovaCard(
              margin: const EdgeInsets.only(top: 4),
              padding: EdgeInsets.zero,
              child: Column(
                children: _suggestions.map((s) {
                  final label = s['label']?.toString() ?? s['address']?.toString() ?? '';
                  return ListTile(
                    dense: true,
                    leading: const Icon(Icons.location_on_outlined, size: 20),
                    title: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis),
                    onTap: () => _selectSuggestion(s),
                  );
                }).toList(),
              ),
            ),
          DestinationCoordPanel(
            initialLat: _dropoff?.latitude,
            initialLng: _dropoff?.longitude,
            onApply: _setDropoffFromCoords,
          ),
          const SizedBox(height: 16),
          Text('Type de véhicule', style: theme.textTheme.titleSmall),
          const SizedBox(height: 8),
          ...MarketConfig.vehicleTypes.map((v) => RadioListTile<String>(
                title: Text('${v.icon} ${v.label}'),
                value: v.id,
                groupValue: _vehicleType,
                onChanged: (val) {
                  setState(() {
                    _vehicleType = val!;
                    _estimatedPrice = null;
                    _estimateBreakdown = null;
                  });
                },
              )),
          if (_estimatedPrice != null) ...[
            const SizedBox(height: 16),
            ServicePriceDisplay.passengerCard(
              {
                ...?_estimateBreakdown,
                'type': 'SCHEDULED',
                'estimatedPriceCdf': _estimatedPrice,
                if (_discountCdf != null) 'discountCdf': _discountCdf,
                if (_appliedPromoCode != null) 'promoCode': _appliedPromoCode,
              },
              totalLabel: 'Total estimé',
            ),
            if (_estimateBreakdown?['distanceKm'] != null) ...[
              const SizedBox(height: 6),
              Text(
                '${(_estimateBreakdown!['distanceKm'] as num).toStringAsFixed(1)} km'
                '${_estimateBreakdown!['durationMin'] != null ? ' · ~${_estimateBreakdown!['durationMin']} min' : ''}'
                '${_estimateBreakdown!['isInterCity'] == true ? ' · Inter-villes' : ''}',
                style: const TextStyle(fontSize: 12, color: MovaColors.textSecondary),
              ),
            ],
          ],
          if (_validationError != null) ...[
            const SizedBox(height: 16),
            MovaErrorBanner(message: _validationError!),
          ],
          PromoCodeField(
            controller: _promoController,
            onChanged: () => setState(() {
              _estimatedPrice = null;
              _estimateBreakdown = null;
            }),
          ),
          if (_error != null) ...[
            const SizedBox(height: 16),
            MovaErrorBanner(message: _error!, onRetry: _estimate),
          ],
          const SizedBox(height: 24),
          MovaButton(
            label: _estimatedPrice == null ? 'Estimer le tarif' : 'Confirmer la réservation',
            isLoading: _loading,
            icon: Icons.event_available_outlined,
            onPressed: _loading
                ? null
                : (_estimatedPrice == null ? _estimate : _confirm),
          ),
        ],
      ),
    );
  }
}

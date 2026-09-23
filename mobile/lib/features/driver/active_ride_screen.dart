import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import '../../core/api/api_client.dart';
import '../../core/api/ride_socket.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/geo/maps_launcher.dart';
import '../../core/billing/driver_earnings_display.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import '../chat/chat_alert_service.dart';
import '../chat/ride_chat_screen.dart';
import '../geo/suggest_place_screen.dart';
import '../../core/safety/sos_helper.dart';
import 'widgets/driver_cash_pin_dialog.dart';

class ActiveRideScreen extends ConsumerStatefulWidget {
  const ActiveRideScreen({super.key, required this.ride});

  final Map<String, dynamic> ride;

  @override
  ConsumerState<ActiveRideScreen> createState() => _ActiveRideScreenState();
}

class _ActiveRideScreenState extends ConsumerState<ActiveRideScreen> {
  late Map<String, dynamic> _ride;
  bool _loading = false;
  String? _error;
  Timer? _locationTimer;
  Timer? _paymentPollTimer;
  String? _userId;
  double? _currentLat;
  double? _currentLng;
  bool _cashDialogOpen = false;

  String get _rideId => _ride['id']?.toString() ?? '';
  String get _status => _ride['status']?.toString() ?? 'DRIVER_ASSIGNED';
  bool get _isPaid => _ride['isPaid'] == true;

  int? get _passengerCashTotalCdf {
    final v = _ride['finalFareCdf'] ?? _ride['estimatedFareCdf'] ?? _ride['amountCdf'];
    if (v is num) return v.round();
    return int.tryParse(v?.toString() ?? '');
  }

  int? get _driverNetCdf {
    final v = DriverEarningsDisplay.netFromMap(_ride);
    return v;
  }

  /// Le passager a initié un paiement espèces (statut backend PENDING) :
  /// le chauffeur doit confirmer le PIN.
  bool get _cashPending =>
      _status == 'COMPLETED' &&
      !_isPaid &&
      _ride['paymentStatus']?.toString().toUpperCase() == 'PENDING';

  @override
  void initState() {
    super.initState();
    _ride = Map<String, dynamic>.from(widget.ride);
    _bootstrap();
  }

  @override
  void dispose() {
    _locationTimer?.cancel();
    _paymentPollTimer?.cancel();
    ref.read(rideSocketProvider).clearHandlers();
    super.dispose();
  }

  Future<void> _bootstrap() async {
    final api = ref.read(apiClientProvider);
    final profile = await api.getDriverProfile();
    if (profile case Success(:final data)) {
      _userId = data['userId']?.toString();
    }
    await _refreshRide();
    await _connectTrackingSocket();
    _startLocationUpdates();
    _syncPaymentPolling();
  }

  Future<void> _connectTrackingSocket() async {
    final api = ref.read(apiClientProvider);
    if (api.isMockMode) return;
    final token = await api.authToken();
    if (!mounted) return;
    final socket = ref.read(rideSocketProvider);
    socket.connect(
      rideId: _rideId,
      token: token,
    );
    socket.onChat = (payload) {
      if (payload['rideId']?.toString() != _rideId) return;
      final role = payload['senderRole']?.toString() ?? '';
      if (role == 'driver') return;
      ChatAlertService.notifyIncoming(
        kind: 'ride',
        threadId: _rideId,
        senderRole: role,
        text: payload['text']?.toString() ?? '',
        peerLabel: 'Chauffeur',
        messageId: payload['id']?.toString(),
      );
    };
    // Le passager a réglé en espèces → ouvrir automatiquement la saisie du PIN.
    socket.onCashPending = (payload) {
      final rideId = payload['rideId']?.toString();
      if (rideId != null && rideId != _rideId) return;
      _autoOpenCashConfirm();
    };
  }

  void _autoOpenCashConfirm() {
    if (!mounted || _cashDialogOpen || _isPaid) return;
    _confirmCash(auto: true);
  }

  Future<void> _refreshRide() async {
    final api = ref.read(apiClientProvider);
    final result = await api.getRide(_rideId);
    if (!mounted) return;
    if (result case Success(:final data)) {
      setState(() => _ride = data);
      _syncPaymentPolling();
      // Fallback fiable si l'événement socket a été manqué : dès que le
      // paiement espèces passe en attente, ouvrir la confirmation du PIN.
      if (_cashPending) _autoOpenCashConfirm();
    }
  }

  void _syncPaymentPolling() {
    _paymentPollTimer?.cancel();
    if (_status == 'COMPLETED' && !_isPaid) {
      _paymentPollTimer = Timer.periodic(const Duration(seconds: 5), (_) => _refreshRide());
    }
  }

  void _startLocationUpdates() {
    _locationTimer?.cancel();
    _locationTimer = Timer.periodic(const Duration(seconds: 8), (_) => _pushLocation());
    _pushLocation();
  }

  Future<void> _pushLocation() async {
    if (!await Geolocator.isLocationServiceEnabled()) return;
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied || permission == LocationPermission.deniedForever) {
      return;
    }
    final pos = await Geolocator.getCurrentPosition();
    if (!mounted) return;
    _currentLat = pos.latitude;
    _currentLng = pos.longitude;
    final api = ref.read(apiClientProvider);
    final socket = ref.read(rideSocketProvider);
    await api.updateDriverLocation(pos.latitude, pos.longitude);
    if (!mounted) return;

    if (!socket.isConnected && !api.isMockMode) {
      await _connectTrackingSocket();
      if (!mounted) return;
    }
    socket.emitDriverLocation(
      userId: _userId ?? '',
      lat: pos.latitude,
      lng: pos.longitude,
      rideId: _rideId,
    );
    if (!api.isMockMode) {
      await api.recordTrackingPoint('ride', _rideId, pos.latitude, pos.longitude);
    }
  }

  Future<void> _openNavigation({required bool toPickup}) async {
    final onReturn = _ride['roundTrip'] == true &&
        (_ride['roundTripLeg']?.toString() == 'RETURN' ||
            _ride['roundTripPhase']?.toString() == 'RETURN');
    num? lat;
    num? lng;
    if (_isSharedPool) {
      final waypoints = (_ride['waypoints'] is List)
          ? (_ride['waypoints'] as List)
              .whereType<Map>()
              .map((e) => Map<String, dynamic>.from(e))
              .toList()
          : const <Map<String, dynamic>>[];
      Map<String, dynamic>? next;
      if (waypoints.isNotEmpty) {
        next = waypoints.first;
      } else {
        final waiting = _sharePassengers.where((p) => p['status']?.toString() == 'WAITING');
        final picked = _sharePassengers.where((p) => p['status']?.toString() == 'PICKED_UP');
        if (waiting.isNotEmpty) {
          final p = waiting.first;
          next = {
            'type': 'pickup',
            'lat': p['pickupLat'],
            'lng': p['pickupLng'],
          };
        } else if (picked.isNotEmpty) {
          final p = picked.first;
          next = {
            'type': 'dropoff',
            'lat': p['dropoffLat'],
            'lng': p['dropoffLng'],
          };
        }
      }
      if (next != null) {
        lat = next['lat'] as num?;
        lng = next['lng'] as num?;
      }
    } else if (toPickup) {
      lat = _ride['pickupLat'] as num?;
      lng = _ride['pickupLng'] as num?;
    } else if (onReturn) {
      lat = (_ride['activeDestinationLat'] ?? _ride['pickupLat']) as num?;
      lng = (_ride['activeDestinationLng'] ?? _ride['pickupLng']) as num?;
    } else {
      lat = _ride['dropoffLat'] as num?;
      lng = _ride['dropoffLng'] as num?;
    }
    if (lat == null || lng == null) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Coordonnées GPS indisponibles pour la navigation')),
        );
      }
      return;
    }
    final opened = await MapsLauncher.openDirections(
      destinationLat: lat.toDouble(),
      destinationLng: lng.toDouble(),
      originLat: _currentLat,
      originLng: _currentLng,
    );
    if (!opened && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Impossible d\'ouvrir Google Maps')),
      );
    }
  }

  Future<void> _openPickup() => _openNavigation(toPickup: true);

  Future<void> _openDropoff() => _openNavigation(toPickup: false);

  Future<void> _advanceStatus(String nextStatus) async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final api = ref.read(apiClientProvider);
    final result = await api.updateRideStatus(_rideId, nextStatus);
    if (!mounted) return;
    setState(() => _loading = false);
    switch (result) {
      case Success(:final data):
        setState(() => _ride = data);
        if (data['roundTripReturnStarted'] == true) {
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text('Aller terminé — démarrez le retour vers le point de départ.'),
              ),
            );
          }
          return;
        }
        if (nextStatus == 'COMPLETED' && data['status']?.toString() == 'COMPLETED') {
          _locationTimer?.cancel();
          _syncPaymentPolling();
          if (mounted) {
            final driverNet = _ride['driverNetCdf'] as int? ??
                (_ride['priceCdf'] as int? ?? _ride['estimatedFareCdf'] as int? ?? 0);
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(
                  'Course terminée — revenu estimé ${MarketConfig.formatCdf(driverNet)}. '
                  'En attente du paiement passager.',
                ),
              ),
            );
          }
        }
      case Failure(:final error):
        setState(() => _error = error.message);
    }
  }

  bool get _isRoundTripReturn =>
      _ride['roundTrip'] == true &&
      (_ride['roundTripLeg']?.toString() == 'RETURN' ||
          _ride['roundTripPhase']?.toString() == 'RETURN');

  bool get _isRoundTrip => _ride['roundTrip'] == true;

  bool get _isSharedPool =>
      _ride['isShared'] == true || _ride['shared'] == true || _ride['type'] == 'RIDE_SHARE';

  List<Map<String, dynamic>> get _sharePassengers {
    final raw = _ride['passengers'] ?? _ride['sharePassengers'];
    if (raw is! List) return const [];
    return raw
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .where((p) => (p['status']?.toString() ?? '') != 'CANCELLED')
        .toList();
  }

  String? _nextActionLabel() => _isSharedPool
      ? null
      : switch (_status) {
          'DRIVER_ASSIGNED' => 'Je suis arrivé',
          'ARRIVING' => 'Démarrer la course',
          'IN_PROGRESS' => _isRoundTripReturn
              ? 'Terminer le retour'
              : (_isRoundTrip ? 'Arrivé à destination (aller)' : 'Terminer la course'),
          _ => null,
        };

  String? _nextStatus() => _isSharedPool
      ? null
      : switch (_status) {
          'DRIVER_ASSIGNED' => 'ARRIVING',
          'ARRIVING' => 'IN_PROGRESS',
          'IN_PROGRESS' => 'COMPLETED',
          _ => null,
        };

  Future<void> _pickupShare(String bookingId) async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final api = ref.read(apiClientProvider);
    final result = await api.pickupSharePassenger(_rideId, bookingId);
    if (!mounted) return;
    setState(() => _loading = false);
    switch (result) {
      case Success(:final data):
        setState(() => _ride = Map<String, dynamic>.from(data));
      case Failure(:final error):
        setState(() => _error = error.message);
    }
  }

  Future<void> _dropoffShare(String bookingId) async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final api = ref.read(apiClientProvider);
    final result = await api.dropoffSharePassenger(_rideId, bookingId);
    if (!mounted) return;
    setState(() => _loading = false);
    switch (result) {
      case Success(:final data):
        setState(() => _ride = Map<String, dynamic>.from(data));
        _syncPaymentPolling();
      case Failure(:final error):
        setState(() => _error = error.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final driverNet = DriverEarningsDisplay.netFromMap(_ride);
    final nextLabel = _nextActionLabel();
    final nextStatus = _nextStatus();
    final headingToPickup = _status == 'DRIVER_ASSIGNED' || _status == 'ACCEPTED';

    return MovaScreen(
      title: _status == 'COMPLETED'
          ? 'Course terminée'
          : (_isSharedPool ? 'Course Pool' : 'Course en cours'),
      scrollable: false,
      actions: [
        sosAppBarButton(
          onPressed: () => triggerSosAlert(
            ref,
            context,
            description: 'SOS chauffeur — course $_rideId',
            rideId: _rideId,
            referenceType: 'RIDE',
            referenceId: _rideId,
            fallbackLat: _currentLat,
            fallbackLng: _currentLng,
          ),
        ),
        IconButton(
          icon: const Icon(Icons.chat_bubble_outline),
          tooltip: 'Chat passager',
          onPressed: () {
            Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => RideChatScreen(
                  rideId: _rideId,
                  myRole: 'driver',
                  peerLabel: 'Passager',
                ),
              ),
            );
          },
        ),
        IconButton(icon: const Icon(Icons.refresh), onPressed: _refreshRide),
      ],
      child: MovaFlexScroll(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
          if (headingToPickup)
            Container(
              decoration: BoxDecoration(
                color: MovaColors.violet.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: MovaColors.violet.withValues(alpha: 0.2)),
              ),
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.navigation, color: MovaColors.violet),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Rendez-vous passager',
                          style: const TextStyle(fontWeight: FontWeight.bold),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    _ride['pickupAddress']?.toString() ?? 'Point de prise en charge',
                    style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600),
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 12),
                  MovaButton(
                    label: 'Navigation vers le passager',
                    icon: Icons.directions,
                    onPressed: _openPickup,
                  ),
                ],
              ),
            ),
          if (headingToPickup) const SizedBox(height: 12),
          MovaCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (_isRoundTrip) ...[
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: MovaColors.violet.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      _ride['roundTripLabel']?.toString() ??
                          (_isRoundTripReturn ? 'Aller-retour · Retour' : 'Aller-retour · Aller'),
                      style: const TextStyle(
                        color: MovaColors.violet,
                        fontWeight: FontWeight.w700,
                        fontSize: 12,
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                ],
                if (!headingToPickup)
                  Text(
                    _isRoundTripReturn
                        ? (_ride['dropoffAddress']?.toString() ?? 'Destination aller')
                        : (_ride['pickupAddress']?.toString() ?? 'Départ'),
                    style: const TextStyle(fontWeight: FontWeight.bold),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                Text(
                  headingToPickup
                      ? 'Destination : ${_ride['dropoffAddress']?.toString() ?? 'Arrivée'}'
                      : _isRoundTripReturn
                          ? '→ ${_ride['activeDestinationAddress']?.toString() ?? _ride['pickupAddress']?.toString() ?? 'Retour au départ'}'
                          : '→ ${_ride['dropoffAddress']?.toString() ?? 'Arrivée'}',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 8),
                Text(
                  driverNet != null ? MarketConfig.formatCdf(driverNet) : '—',
                  style: const TextStyle(color: MovaColors.green, fontWeight: FontWeight.bold, fontSize: 20),
                ),
                const SizedBox(height: 2),
                Text(
                  DriverEarningsDisplay.serviceNetLabel(
                    data: _ride,
                    type: 'RIDE',
                  ),
                  style: const TextStyle(color: MovaColors.textSecondary, fontSize: 12),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 4),
                Text(
                  _statusLabel(_status),
                  style: const TextStyle(color: MovaColors.violet, fontWeight: FontWeight.w600),
                ),
                if (_status == 'COMPLETED') ...[
                  const SizedBox(height: 8),
                  _PaymentStatusChip(isPaid: _isPaid),
                ],
              ],
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            MovaErrorBanner(message: _error!),
          ],
          const SizedBox(height: 16),
          if (!headingToPickup)
            MovaButton(
              label: _isRoundTripReturn
                  ? 'Navigation retour (départ)'
                  : 'Navigation destination',
              isSecondary: true,
              icon: Icons.navigation_outlined,
              onPressed: _openDropoff,
            ),
          if (!headingToPickup) const SizedBox(height: 12),
          if (_isSharedPool) ...[
            Text(
              'Passagers Pool (${_sharePassengers.length})',
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 8),
            MovaButton(
              label: 'Navigation prochain arrêt',
              isSecondary: true,
              icon: Icons.navigation_outlined,
              onPressed: () => _openNavigation(toPickup: true),
            ),
            const SizedBox(height: 8),
            ..._sharePassengers.map((p) {
              final status = p['status']?.toString() ?? 'WAITING';
              final bookingId = (p['bookingId'] ?? p['id'])?.toString() ?? '';
              final fare = (p['fareCdf'] as num?)?.round();
              return Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: MovaCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '${p['pickupAddress'] ?? 'Prise'} → ${p['dropoffAddress'] ?? 'Dépose'}',
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '$status${fare != null ? ' · ${MarketConfig.formatCdf(fare)}' : ''}',
                        style: const TextStyle(fontSize: 12, color: MovaColors.textSecondary),
                      ),
                      const SizedBox(height: 8),
                      if (status == 'WAITING')
                        MovaButton(
                          label: 'Prendre ce passager',
                          icon: Icons.person_add_alt_1,
                          isLoading: _loading,
                          onPressed: _loading || bookingId.isEmpty ? null : () => _pickupShare(bookingId),
                        ),
                      if (status == 'PICKED_UP')
                        MovaButton(
                          label: 'Déposer ce passager',
                          icon: Icons.flag,
                          isLoading: _loading,
                          onPressed: _loading || bookingId.isEmpty ? null : () => _dropoffShare(bookingId),
                        ),
                    ],
                  ),
                ),
              );
            }),
            if (_status == 'DRIVER_ASSIGNED' || _status == 'ACCEPTED') ...[
              MovaButton(
                label: 'Je suis arrivé (point de rencontre)',
                icon: Icons.place,
                isLoading: _loading,
                onPressed: _loading ? null : () => _advanceStatus('ARRIVING'),
              ),
              const SizedBox(height: 8),
            ],
          ],
          if (nextLabel != null && nextStatus != null) ...[
            const SizedBox(height: 12),
            MovaButton(
              label: nextLabel,
              icon: Icons.arrow_forward,
              isLoading: _loading,
              onPressed: _loading ? null : () => _advanceStatus(nextStatus),
            ),
          ],
          if (_status == 'COMPLETED') ...[
            const SizedBox(height: 12),
            MovaButton(
              label: 'Nommer ce lieu',
              isSecondary: true,
              icon: Icons.edit_location_alt_outlined,
              onPressed: () {
                SuggestPlaceScreen.open(
                  context,
                  lat: (_ride['dropoffLat'] as num?)?.toDouble(),
                  lng: (_ride['dropoffLng'] as num?)?.toDouble(),
                  name: _ride['dropoffAddress']?.toString(),
                  address: _ride['dropoffAddress']?.toString(),
                );
              },
            ),
            const SizedBox(height: 12),
            MovaButton(
              label: 'Chat avec le passager',
              isSecondary: true,
              icon: Icons.chat_bubble_outline,
              onPressed: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => RideChatScreen(
                      rideId: _rideId,
                      myRole: 'driver',
                      peerLabel: 'Passager',
                    ),
                  ),
                );
              },
            ),
            const SizedBox(height: 12),
            if (!_isPaid) ...[
              if (_passengerCashTotalCdf != null && _passengerCashTotalCdf! > 0) ...[
                MovaCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Total à encaisser (passager)',
                        style: TextStyle(color: MovaColors.textSecondary, fontSize: 13),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        MarketConfig.formatCdf(_passengerCashTotalCdf!),
                        style: const TextStyle(
                          fontSize: 28,
                          fontWeight: FontWeight.bold,
                          color: MovaColors.orange,
                        ),
                      ),
                      if (_driverNetCdf != null &&
                          _driverNetCdf! > 0 &&
                          _driverNetCdf != _passengerCashTotalCdf) ...[
                        const SizedBox(height: 6),
                        Text(
                          'Votre part nette ~${MarketConfig.formatCdf(_driverNetCdf!)}',
                          style: const TextStyle(fontSize: 13, color: MovaColors.textSecondary),
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(height: 12),
              ],
              MovaButton(
                label: 'Confirmer paiement espèces',
                isSecondary: true,
                icon: Icons.payments_outlined,
                onPressed: _confirmCash,
              ),
            ],
            const SizedBox(height: 12),
            MovaButton(
              label: 'Retour au tableau de bord',
              isSecondary: true,
              icon: Icons.home_outlined,
              onPressed: () => Navigator.popUntil(context, (r) => r.isFirst),
            ),
          ],
        ],
        ),
      ),
    );
  }

  Future<void> _confirmCash({bool auto = false}) async {
    if (_cashDialogOpen) return;
    _cashDialogOpen = true;
    final api = ref.read(apiClientProvider);
    final pin = await DriverCashPinDialog.show(
      context,
      title: auto ? 'Le passager paie en espèces' : 'Confirmer espèces',
      passengerTotalCdf: _passengerCashTotalCdf,
      driverNetCdf: _driverNetCdf,
      validate: (enteredPin) async {
        final result = await api.confirmCashRide(_rideId, enteredPin);
        return switch (result) {
          Success() => (ok: true, message: null),
          Failure(:final error) => (ok: false, message: error.message),
        };
      },
    );
    _cashDialogOpen = false;
    if (pin == null || pin.isEmpty || !mounted) return;
    await _refreshRide();
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Paiement espèces confirmé')),
    );
  }

  String _statusLabel(String status) => switch (status) {
        'DRIVER_ASSIGNED' => 'En route vers le passager',
        'ARRIVING' => 'Arrivé — en attente du passager',
        'IN_PROGRESS' => 'Course en cours',
        'COMPLETED' => _isPaid ? 'Terminée · Payée' : 'Terminée · En attente de paiement',
        _ => status,
      };
}

class _PaymentStatusChip extends StatelessWidget {
  const _PaymentStatusChip({required this.isPaid});

  final bool isPaid;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: (isPaid ? MovaColors.green : MovaColors.orange).withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: (isPaid ? MovaColors.green : MovaColors.orange).withValues(alpha: 0.35),
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            isPaid ? Icons.check_circle_outline : Icons.schedule,
            size: 16,
            color: isPaid ? MovaColors.green : MovaColors.orange,
          ),
          const SizedBox(width: 6),
          Text(
            isPaid ? 'Payée' : 'En attente de paiement',
            style: TextStyle(
              color: isPaid ? MovaColors.green : MovaColors.orange,
              fontWeight: FontWeight.w600,
              fontSize: 13,
            ),
          ),
        ],
      ),
    );
  }
}

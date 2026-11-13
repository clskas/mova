import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import '../../core/config/client_apps_config.dart';
import '../../core/api/api_client.dart';
import '../../core/voice/voice_command_button.dart';
import '../../core/api/ride_socket.dart';
import '../../core/config/market_config.dart';
import '../../core/contact/contact_actions.dart';
import '../../core/error/result.dart';
import '../../core/geo/maps_launcher.dart';
import '../../core/billing/driver_earnings_display.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import '../chat/call_ring_service.dart';
import '../chat/chat_alert_service.dart';
import '../chat/chat_badge_icon.dart';
import '../chat/delivery_voice_call_screen.dart';
import '../chat/ride_chat_screen.dart';
import '../geo/suggest_place_screen.dart';
import '../../core/safety/sos_helper.dart';
import '../../core/services/cancel_eligibility.dart';
import 'driver_job_alert_service.dart';
import 'widgets/driver_cash_received_dialog.dart';
import 'widgets/passenger_rating_badge.dart';
import '../rating/rating_screen.dart';
import '../../core/location/location_permission.dart';
import '../../core/i18n/i18n.dart';

class ActiveRideScreen extends ConsumerStatefulWidget {
  const ActiveRideScreen({
    super.key,
    required this.ride,
    /// Après acceptation : ouvre Google Maps vers le passager sans 2ᵉ tap.
    this.autoOpenNavigation = false,
  });

  final Map<String, dynamic> ride;
  final bool autoOpenNavigation;

  @override
  ConsumerState<ActiveRideScreen> createState() => _ActiveRideScreenState();
}

class _ActiveRideScreenState extends ConsumerState<ActiveRideScreen> {
  late Map<String, dynamic> _ride;
  bool _loading = false;
  String? _error;
  Timer? _locationTimer;
  Timer? _paymentPollTimer;
  Timer? _statusPollTimer;
  StreamSubscription<DriverJobStopEvent>? _jobStopSub;
  String? _userId;
  double? _currentLat;
  double? _currentLng;
  bool _cashDialogOpen = false;
  bool _skipCashAutoOpen = false;
  bool _autoNavTriggered = false;
  bool _passengerCancelled = false;
  bool _closingCancelled = false;

  String get _rideId => _ride['id']?.toString() ?? '';
  String get _status => _ride['status']?.toString() ?? 'DRIVER_ASSIGNED';
  bool get _isPaid => _ride['isPaid'] == true;

  bool _ratedPassenger = false;

  bool get _canRatePassenger =>
      _status == 'COMPLETED' && !_isSharedPool && _ride['rated'] != true && !_ratedPassenger;

  Future<void> _ratePassenger() async {
    final passenger = _ride['passenger'];
    final done = await Navigator.push<bool>(
      context,
      MaterialPageRoute(
        builder: (_) => RatingScreen(
          rideId: _rideId,
          ratePassenger: true,
          peerLabel: passenger is Map ? passenger['name']?.toString() : null,
        ),
      ),
    );
    if (done == true && mounted) setState(() => _ratedPassenger = true);
  }
  bool get _canDriverCancel => CancelEligibility.rideDriver(_ride);
  bool get _isCancelledStatus {
    final s = _status.toUpperCase();
    return s == 'CANCELLED' || s == 'CANCELED';
  }

  int? get _passengerCashTotalCdf {
    final v = _ride['finalFareCdf'] ?? _ride['estimatedFareCdf'] ?? _ride['amountCdf'];
    if (v is num) return v.round();
    return int.tryParse(v?.toString() ?? '');
  }

  int? get _driverNetCdf {
    final v = DriverEarningsDisplay.netFromMap(_ride);
    return v;
  }

  bool get _cashDisputed => _ride['cashDisputed'] == true;

  /// Le passager a initié un paiement espèces (statut backend PENDING) :
  /// le chauffeur doit confirmer « Cash reçu » (sauf litige déjà ouvert).
  bool get _cashPending =>
      _status == 'COMPLETED' &&
      !_isPaid &&
      !_cashDisputed &&
      _ride['paymentStatus']?.toString().toUpperCase() == 'PENDING';

  /// Read in initState: `ref` can no longer be used in dispose().
  late final RideSocket _rideSocket;

  @override
  void initState() {
    super.initState();
    _ride = Map<String, dynamic>.from(widget.ride);
    _rideSocket = ref.read(rideSocketProvider);
    _jobStopSub = DriverJobAlertService.onJobStop.listen(_onJobStopEvent);
    _bootstrap();
  }

  @override
  void dispose() {
    _jobStopSub?.cancel();
    _locationTimer?.cancel();
    _paymentPollTimer?.cancel();
    _statusPollTimer?.cancel();
    _rideSocket.clearHandlers();
    super.dispose();
  }

  void _onJobStopEvent(DriverJobStopEvent ev) {
    if (!mounted || _closingCancelled) return;
    final matchesId = ev.referenceId == _rideId;
    final matchesKey = ev.offerKey == DriverJobAlertService.offerKey('ride', _rideId);
    if (!matchesId && !matchesKey) return;
    if (ev.reason == 'cancelled' || ev.reason == 'cancel') {
      _handlePassengerCancelled();
    }
  }

  void _handlePassengerCancelled() {
    if (!mounted || _closingCancelled) return;
    _closingCancelled = true;
    _locationTimer?.cancel();
    _paymentPollTimer?.cancel();
    _statusPollTimer?.cancel();
    unawaited(DriverJobAlertService.stopRinging(
      offerKey: DriverJobAlertService.offerKey('ride', _rideId),
    ));
    unawaited(CallRingService.forceStop());
    setState(() {
      _passengerCancelled = true;
      _ride = {..._ride, 'status': 'CANCELLED'};
      _loading = false;
    });
  }

  Future<void> _bootstrap() async {
    final api = ref.read(apiClientProvider);
    final profile = await api.getDriverProfile();
    if (profile case Success(:final data)) {
      _userId = data['userId']?.toString();
    }
    await _refreshRide();
    if (_passengerCancelled || _isCancelledStatus) return;
    await _connectTrackingSocket();
    _startLocationUpdates();
    _startStatusPolling();
    _syncPaymentPolling();
    if (widget.autoOpenNavigation) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        unawaited(_maybeAutoOpenNavigation());
      });
    }
  }

  void _startStatusPolling() {
    _statusPollTimer?.cancel();
    _statusPollTimer = Timer.periodic(const Duration(seconds: 4), (_) {
      if (!mounted || _passengerCancelled || _closingCancelled) return;
      unawaited(_refreshRide());
    });
  }

  Future<void> _maybeAutoOpenNavigation() async {
    if (_autoNavTriggered || !mounted || _passengerCancelled || _isCancelledStatus) return;
    final headingToPickup = _status == 'DRIVER_ASSIGNED' || _status == 'ACCEPTED';
    if (!headingToPickup) return;
    _autoNavTriggered = true;
    // Laisse peindre l’écran course avant de basculer vers Maps.
    await Future<void>.delayed(const Duration(milliseconds: 450));
    if (!mounted || _passengerCancelled || _isCancelledStatus) return;
    await _openPickup();
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
      onStatus: (payload) {
        final id = payload['rideId']?.toString();
        if (id != null && id.isNotEmpty && id != _rideId) return;
        final status = payload['status']?.toString().toUpperCase() ?? '';
        if (!mounted) return;
        if (status == 'CANCELLED' || status == 'CANCELED') {
          _handlePassengerCancelled();
          return;
        }
        setState(() {
          _ride = {..._ride, ...Map<String, dynamic>.from(payload), 'status': status.isNotEmpty ? status : _status};
        });
        if (status == 'COMPLETED') _syncPaymentPolling();
      },
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
        peerLabel: tr('Passager'),
        messageId: payload['id']?.toString(),
      );
    };
    socket.onDeliveryCall = (payload) {
      final id = payload['rideId']?.toString() ?? payload['deliveryId']?.toString();
      if (id != null && id != _rideId) return;
      final action = payload['action']?.toString() ?? 'start';
      if (action != 'start') {
        CallRingService.notifyPeerEnded(_rideId);
        unawaited(CallRingService.forceStop());
        return;
      }
      CallRingService.allowNewIncoming(_rideId);
      unawaited(CallRingService.startIncoming(
        deliveryId: _rideId,
        starterId: payload['starterId']?.toString() ?? '',
        myUserId: _userId,
        peerLabel: tr('Passager'),
        kind: 'ride',
        fromRealtime: true,
      ));
    };
    // Le passager a réglé en espèces → ouvrir automatiquement la confirmation.
    socket.onCashPending = (payload) async {
      final rideId = payload['rideId']?.toString();
      if (rideId != null && rideId != _rideId) return;
      await _refreshRide();
      if (!mounted || !_cashPending) return;
      _autoOpenCashConfirm();
    };
  }

  Future<void> _openVoiceCall() {
    unawaited(CallRingService.stop(deliveryId: _rideId));
    return Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => DeliveryVoiceCallScreen(
          threadId: _rideId,
          kind: VoiceCallKind.ride,
          peerLabel: tr('Passager'),
          announce: true,
        ),
      ),
    );
  }

  void _autoOpenCashConfirm() {
    if (!mounted || _cashDialogOpen || _isPaid || _skipCashAutoOpen || !_cashPending) return;
    _confirmCash(auto: true);
  }

  Future<void> _refreshRide() async {
    if (_rideId.isEmpty) return;
    final api = ref.read(apiClientProvider);
    final result = await api.getRide(_rideId);
    if (!mounted) return;
    if (result case Success(:final data)) {
      final status = data['status']?.toString().toUpperCase() ?? '';
      if (status == 'CANCELLED' || status == 'CANCELED') {
        setState(() => _ride = data);
        _handlePassengerCancelled();
        return;
      }
      setState(() => _ride = data);
      _syncPaymentPolling();
      // Fallback fiable si l'événement socket a été manqué : dès que le
      // paiement espèces passe en attente, ouvrir la confirmation — jamais
      // sur une course CANCELLED.
      if (_cashPending && !_skipCashAutoOpen) _autoOpenCashConfirm();
    }
  }

  void _syncPaymentPolling() {
    _paymentPollTimer?.cancel();
    if (_status == 'COMPLETED' && !_isPaid && !_cashDisputed) {
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
      permission = await LocationPermissionGate.request();
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
          SnackBar(content: Text(tr('Coordonnées GPS indisponibles pour la navigation'))),
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
        SnackBar(content: Text(tr('Impossible d\'ouvrir Google Maps'))),
      );
    }
  }

  Future<void> _openPickup() => _openNavigation(toPickup: true);

  Future<void> _openDropoff() => _openNavigation(toPickup: false);

  Future<void> _cancelByDriver() async {
    if (_loading || !_canDriverCancel) return;
    final arrived = _status == 'ARRIVING' || _status == 'DRIVER_ARRIVED';
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(arrived ? tr('Passager absent ?') : tr('Annuler la course ?')),
        content: Text(
          arrived
              ? tr('Confirmez uniquement si le passager ne se présente pas après l\'attente. Des frais no-show peuvent s\'appliquer.')
              : tr('Le passager sera notifié. Annulez seulement en cas de problème (sécurité, véhicule, etc.).'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(tr('Non'))),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(arrived ? tr('Confirmer no-show') : tr('Oui, annuler')),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    final api = ref.read(apiClientProvider);
    final result = await api.cancelRide(
      _rideId,
      reason: arrived ? 'No-show passager (chauffeur)' : 'Annulé par le chauffeur',
    );
    if (!mounted) return;
    setState(() => _loading = false);
    switch (result) {
      case Success(:final data):
        final msg = data['message']?.toString() ?? tr('Course annulée');
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
        Navigator.popUntil(context, (r) => r.isFirst);
      case Failure(:final error):
        setState(() => _error = error.message);
    }
  }

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
              SnackBar(
                content: Text(tr('Aller terminé — démarrez le retour vers le point de départ.')),
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
                  trf('Course terminée — revenu estimé {v1}. En attente du paiement passager.', {'v1': MarketConfig.formatCdf(driverNet)}),
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
          'DRIVER_ASSIGNED' => tr('Je suis arrivé'),
          'ARRIVING' => tr('Démarrer la course'),
          'IN_PROGRESS' => _isRoundTripReturn
              ? tr('Terminer le retour')
              : (_isRoundTrip ? tr('Arrivé à destination (aller)') : tr('Terminer la course')),
          _ => null,
        };

  /// Driver voice: arrived / start / finish / navigation / call. Finishing asks a confirmation.
  Future<void> _onDriverVoice(String text) async {
    final intent = parseDriverVoiceIntent(text);
    final next = _nextStatus();
    switch (intent) {
      case DriverVoiceIntent.arrived when next == 'ARRIVING':
      case DriverVoiceIntent.start || DriverVoiceIntent.passengerPicked when next == 'IN_PROGRESS':
        await _advanceStatus(next!);
      case DriverVoiceIntent.finish || DriverVoiceIntent.passengerDropped when next == 'COMPLETED':
        if (await confirmVoiceAction(context, tr('Terminer la course ?'), tr('Oui, terminer'))) {
          await _advanceStatus('COMPLETED');
        }
      case DriverVoiceIntent.cancel when _canDriverCancel:
        // The usual dialog asks first (fees, no-show).
        await _cancelByDriver();
      case DriverVoiceIntent.cashReceived || DriverVoiceIntent.cashNotReceived when _status == 'COMPLETED' && !_isPaid:
        // Opens « Cash reçu ? »: the driver confirms or disputes there.
        await _confirmCash();
      case DriverVoiceIntent.passengerPicked || DriverVoiceIntent.start when _isSharedPool:
        await _poolVoice(pickup: true);
      case DriverVoiceIntent.passengerDropped || DriverVoiceIntent.finish when _isSharedPool:
        await _poolVoice(pickup: false);
      case DriverVoiceIntent.navigate:
        await _openNavigation(toPickup: _status == 'DRIVER_ASSIGNED' || _status == 'ARRIVING');
      case DriverVoiceIntent.callPassenger:
        final passenger = _ride['passenger'];
        final phone = passenger is Map ? passenger['phone']?.toString() : _ride['passengerPhone']?.toString();
        showCallWhatsAppSheet(context, phone: phone, peerLabel: tr('le passager'));
      default:
        voiceNotUnderstood(
          context,
          text,
          _isSharedPool
              ? tr('passager pris, passager déposé, itinéraire, appeler, annuler')
              : tr('arrivé, démarrer, terminer, itinéraire, appeler, annuler, cash reçu'),
        );
    }
  }

  /// Pool by voice: next passenger to pick up (or to drop), in route order, after a confirmation.
  Future<void> _poolVoice({required bool pickup}) async {
    final wanted = pickup ? 'WAITING' : 'PICKED_UP';
    final p = _sharePassengers.where((p) => p['status']?.toString() == wanted).firstOrNull;
    final bookingId = (p?['bookingId'] ?? p?['id'])?.toString() ?? '';
    if (p == null || bookingId.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(pickup ? tr('Aucun passager à prendre.') : tr('Aucun passager à déposer.'))),
      );
      return;
    }
    final where = pickup ? p['pickupAddress'] : p['dropoffAddress'];
    final title = pickup
        ? trf('Prendre le passager ({where}) ?', {'where': where ?? tr('Prise')})
        : trf('Déposer le passager ({where}) ?', {'where': where ?? tr('Dépose')});
    if (!await confirmVoiceAction(context, title, pickup ? tr('Oui, pris') : tr('Oui, déposé'))) return;
    await (pickup ? _pickupShare(bookingId) : _dropoffShare(bookingId));
  }

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

    if (_passengerCancelled || _isCancelledStatus) {
      return MovaScreen(
        title: tr('Course annulée'),
        scrollable: false,
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Spacer(),
              Icon(Icons.cancel_outlined, size: 72, color: MovaColors.red.withValues(alpha: 0.9)),
              const SizedBox(height: 20),
              Text(
                tr('Le passager a annulé la course'),
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 12),
              Text(
                tr('Cette course n’est plus active. Vous pouvez reprendre les nouvelles demandes.'),
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 15, color: MovaColors.textSecondary, height: 1.35),
              ),
              const Spacer(),
              MovaButton(
                label: tr('Retour à l’accueil'),
                icon: Icons.home_outlined,
                onPressed: () => Navigator.of(context).popUntil((r) => r.isFirst),
              ),
              const SizedBox(height: 12),
            ],
          ),
        ),
      );
    }

    return MovaScreen(
      title: _status == 'COMPLETED'
          ? tr('Course terminée')
          : (_isSharedPool ? tr('Course Pool') : tr('Course en cours')),
      scrollable: false,
      actions: [
        if (_status != 'COMPLETED')
          VoiceCommandButton(
            onText: _onDriverVoice,
            color: Colors.white,
            hint: _isSharedPool
                ? tr('Dites : passager pris, passager déposé, itinéraire, appeler')
                : tr('Dites : arrivé, démarrer, terminer, itinéraire, appeler, annuler'),
          ),
        sosAppBarButton(
          onPressed: ([bool skip = false]) => triggerSosAlert(
            skipConfirm: skip,
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
          icon: ChatBadgeIcon(kind: 'ride', threadId: _rideId),
          tooltip: tr('Chat passager'),
          onPressed: () {
            Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => RideChatScreen(
                  rideId: _rideId,
                  myRole: 'driver',
                  peerLabel: tr('Passager'),
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
                          tr('Rendez-vous passager'),
                          style: const TextStyle(fontWeight: FontWeight.bold),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    _ride['pickupAddress']?.toString() ?? tr('Point de prise en charge'),
                    style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600),
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 12),
                  MovaButton(
                    label: tr('Navigation vers le passager'),
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
                if (passengerCountLabel(_ride['passengerCount']) != null) ...[
                  Row(
                    children: [
                      const Icon(Icons.people_alt, color: MovaColors.green, size: 18),
                      const SizedBox(width: 6),
                      Text(
                        passengerCountLabel(_ride['passengerCount'])!,
                        style: const TextStyle(fontWeight: FontWeight.w700, color: MovaColors.green),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                ],
                if (!_isSharedPool) ...[
                  PassengerRatingBadge(
                    name: _ride['passenger'] is Map ? (_ride['passenger'] as Map)['name']?.toString() : null,
                    rating: PassengerRatingBadge.ratingFrom(_ride),
                    count: PassengerRatingBadge.countFrom(_ride),
                  ),
                  const SizedBox(height: 8),
                ],
                if (_isRoundTrip) ...[
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: MovaColors.violet.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      _ride['roundTripLabel']?.toString() ??
                          (_isRoundTripReturn ? tr('Aller-retour · Retour') : tr('Aller-retour · Aller')),
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
                        ? (_ride['dropoffAddress']?.toString() ?? tr('Destination aller'))
                        : (_ride['pickupAddress']?.toString() ?? tr('Départ')),
                    style: const TextStyle(fontWeight: FontWeight.bold),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                Text(
                  headingToPickup
                      ? 'Destination : ${_ride['dropoffAddress']?.toString() ?? tr('Arrivée')}'
                      : _isRoundTripReturn
                          ? '→ ${_ride['activeDestinationAddress']?.toString() ?? _ride['pickupAddress']?.toString() ?? tr('Retour au départ')}'
                          : '→ ${_ride['dropoffAddress']?.toString() ?? tr('Arrivée')}',
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
          Row(
            children: [
              Expanded(
                child: MovaButton(
                  label: tr('Appeler'),
                  isSecondary: true,
                  icon: Icons.phone,
                  onPressed: () {
                    final passenger = _ride['passenger'];
                    final phone = passenger is Map
                        ? passenger['phone']?.toString()
                        : _ride['passengerPhone']?.toString();
                    showCallWhatsAppSheet(
                      context,
                      phone: phone,
                      peerLabel: tr('le passager'),
                    );
                  },
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: MovaButton(
                  label: tr('WhatsApp'),
                  isSecondary: true,
                  icon: Icons.chat,
                  onPressed: () {
                    final passenger = _ride['passenger'];
                    final phone = passenger is Map
                        ? passenger['phone']?.toString()
                        : _ride['passengerPhone']?.toString();
                    launchWhatsApp(phone);
                  },
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          MovaButton(
            label: tr('Appel SENGA'),
            isSecondary: true,
            icon: Icons.call_outlined,
            onPressed: _rideId.isEmpty ? null : _openVoiceCall,
          ),
          const SizedBox(height: 12),
          if (!headingToPickup)
            MovaButton(
              label: _isRoundTripReturn
                  ? tr('Navigation retour (départ)')
                  : tr('Navigation destination'),
              isSecondary: true,
              icon: Icons.navigation_outlined,
              onPressed: _openDropoff,
            ),
          if (!headingToPickup) const SizedBox(height: 12),
          if (_isSharedPool) ...[
            Text(
              trf('Passagers Pool ({length})', {'length': _sharePassengers.length}),
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 8),
            MovaButton(
              label: tr('Navigation prochain arrêt'),
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
                        '${p['pickupAddress'] ?? tr('Prise')} → ${p['dropoffAddress'] ?? tr('Dépose')}',
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
                          label: tr('Prendre ce passager'),
                          icon: Icons.person_add_alt_1,
                          isLoading: _loading,
                          onPressed: _loading || bookingId.isEmpty ? null : () => _pickupShare(bookingId),
                        ),
                      if (status == 'PICKED_UP')
                        MovaButton(
                          label: tr('Déposer ce passager'),
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
                label: tr('Je suis arrivé (point de rencontre)'),
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
          if (_canDriverCancel) ...[
            const SizedBox(height: 12),
            MovaButton(
              label: (_status == 'ARRIVING' || _status == 'DRIVER_ARRIVED')
                  ? tr('Annuler — passager absent')
                  : tr('Annuler la course'),
              isSecondary: true,
              icon: Icons.cancel_outlined,
              isLoading: _loading,
              onPressed: _loading ? null : _cancelByDriver,
            ),
          ],
          if (_canRatePassenger) ...[
            const SizedBox(height: 12),
            MovaButton(
              key: const Key('ratePassengerButton'),
              label: tr('Noter le passager'),
              icon: Icons.star_outline,
              onPressed: _ratePassenger,
            ),
          ],
          if (_status == 'COMPLETED') ...[
            const SizedBox(height: 12),
            MovaButton(
              label: tr('Nommer ce lieu'),
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
              label: tr('Chat avec le passager'),
              isSecondary: true,
              icon: Icons.chat_bubble_outline,
              onPressed: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => RideChatScreen(
                      rideId: _rideId,
                      myRole: 'driver',
                      peerLabel: tr('Passager'),
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
                      Text(
                        tr('Total à encaisser (passager)'),
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
                          trf('Votre part nette ~{v1}', {'v1': MarketConfig.formatCdf(_driverNetCdf!)}),
                          style: const TextStyle(fontSize: 13, color: MovaColors.textSecondary),
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(height: 12),
              ],
              if (_cashDisputed) ...[
                MovaCard(
                  child: Text(
                    tr('Litige : espèces non reçues. Le passager a été notifié et ne peut plus commander tant que ce n’est pas réglé. '
                    'Ce n’est pas une alerte SOS. Si vous avez finalement reçu l’argent, confirmez ci-dessous pour clôturer ce litige.'),
                    style: TextStyle(fontSize: 13),
                  ),
                ),
                const SizedBox(height: 12),
              ],
              MovaButton(
                label: _cashDisputed ? tr('J’ai reçu les espèces') : tr('Cash reçu'),
                isSecondary: true,
                icon: Icons.payments_outlined,
                onPressed: _confirmCash,
              ),
            ],
            const SizedBox(height: 12),
            MovaButton(
              label: tr('Retour au tableau de bord'),
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
    if (_status != 'COMPLETED' || _isPaid) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              tr('Cette course n’attend plus d’encaissement espèces (annulée ou déjà réglée).'),
            ),
          ),
        );
      }
      return;
    }
    _cashDialogOpen = true;
    final api = ref.read(apiClientProvider);
    final closingDispute = _cashDisputed;
    final result = await DriverCashReceivedDialog.show(
      context,
      title: closingDispute
          ? tr('Clôturer le litige espèces ?')
          : (auto ? tr('Le passager paie en espèces') : tr('Cash reçu ?')),
      passengerTotalCdf: _passengerCashTotalCdf,
      driverNetCdf: _driverNetCdf,
      confirm: () async {
        if (_isSharedPool) {
          // Pool : un ServicePayment par booking — pas confirmCashRide(rideId).
          final pending = _sharePassengers.where((p) {
            final paid = p['isPaid'] == true;
            final status = p['paymentStatus']?.toString().toUpperCase();
            final method = p['paymentMethod']?.toString().toUpperCase();
            if (paid) return false;
            return status == 'PENDING' || method == 'CASH';
          }).toList();
          if (pending.isEmpty) {
            return (ok: false, message: tr('Aucun paiement espèces Pool en attente.'));
          }
          for (final p in pending) {
            final bookingId = (p['bookingId'] ?? p['id'])?.toString() ?? '';
            if (bookingId.isEmpty) continue;
            final r = await api.confirmCashService('RIDE_SHARE', bookingId);
            if (r case Failure(:final error)) {
              return (ok: false, message: error.message);
            }
          }
          return (ok: true, message: null);
        }
        final r = await api.confirmCashRide(_rideId);
        return switch (r) {
          Success() => (ok: true, message: null),
          Failure(:final error) => (ok: false, message: error.message),
        };
      },
      dispute: () async {
        final r = await api.disputeCashRide(_rideId, reason: 'CASH_NOT_RECEIVED');
        return switch (r) {
          Success(:final data) => (
              ok: true,
              message: data['message']?.toString() ?? tr('Litige enregistré'),
            ),
          Failure(:final error) => (ok: false, message: error.message),
        };
      },
    );
    _cashDialogOpen = false;
    if (!mounted) return;
    if (result == CashDialogResult.disputed) {
      _skipCashAutoOpen = true;
      setState(() => _ride = {..._ride, 'cashDisputed': true});
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(tr('Litige espèces non reçues enregistré — le passager a été notifié')),
        ),
      );
      await _refreshRide();
      return;
    }
    if (result != CashDialogResult.confirmed) return;
    setState(() => _ride = {..._ride, 'cashDisputed': false, 'isPaid': true});
    await _refreshRide();
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          closingDispute
              ? tr('Litige espèces non reçues clôturé — paiement confirmé.')
              : tr('Paiement espèces confirmé'),
        ),
      ),
    );
  }

  String _statusLabel(String status) => switch (status) {
        'DRIVER_ASSIGNED' => tr('En route vers le passager'),
        'ARRIVING' => tr('Arrivé — en attente du passager'),
        'IN_PROGRESS' => tr('Course en cours'),
        'COMPLETED' => _isPaid ? tr('Terminée · Payée') : tr('Terminée · En attente de paiement'),
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
            isPaid ? tr('Payée') : tr('En attente de paiement'),
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

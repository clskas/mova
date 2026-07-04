import 'dart:async';

import 'package:geolocator/geolocator.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:latlong2/latlong.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/api/api_client.dart';
import '../../core/api/ride_socket.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/services/cancel_eligibility.dart';
import '../../core/geo/geo_utils.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import '../chat/ride_chat_screen.dart';
import 'payment_screen.dart';
import 'widgets/mova_ride_map.dart';

List<Map<String, dynamic>> computeRideTimeline(String mobileStatus) {
  const steps = [
    'Recherche',
    'Chauffeur assigné',
    'En route',
    'Arrivé',
    'En course',
    'Terminé',
  ];
  if (mobileStatus == 'CANCELLED') {
    return [{'label': 'Course annulée', 'done': true}];
  }
  final normalized = switch (mobileStatus) {
    'ACCEPTED' => 'DRIVER_ASSIGNED',
    'SEARCHING' => 'MATCHING',
    'DRIVER_ARRIVED' => 'ARRIVING',
    _ => mobileStatus,
  };
  const order = ['REQUESTED', 'MATCHING', 'DRIVER_ASSIGNED', 'ARRIVING', 'IN_PROGRESS', 'COMPLETED'];
  var currentIdx = order.indexOf(normalized);
  if (currentIdx < 0) currentIdx = normalized == 'MATCHING' ? 1 : 0;
  const enRouteIdx = 2;
  return List.generate(steps.length, (idx) {
    final done = switch (idx) {
      0 => currentIdx >= 1,
      1 => currentIdx >= enRouteIdx,
      2 => currentIdx > enRouteIdx || (currentIdx == enRouteIdx && normalized == 'DRIVER_ASSIGNED'),
      3 => currentIdx >= 3,
      4 => currentIdx >= 4,
      _ => currentIdx >= 5,
    };
    return {'label': steps[idx], 'done': done};
  });
}

class TrackingScreen extends ConsumerStatefulWidget {
  const TrackingScreen({
    super.key,
    required this.rideId,
    this.estimatedFareCdf = 0,
  });

  final String rideId;
  final int estimatedFareCdf;

  @override
  ConsumerState<TrackingScreen> createState() => _TrackingScreenState();
}

class _TrackingScreenState extends ConsumerState<TrackingScreen> {
  Map<String, dynamic>? _ride;
  Map<String, dynamic>? _driver;
  String _status = 'ACCEPTED';
  LatLng _pickup = MovaRideMap.mapDefaultCenter();
  LatLng? _dropoff;
  LatLng? _driverPos;
  List<LatLng> _routeTrace = [];
  int _etaMinutes = 5;
  double? _driverDistanceKm;
  bool _loading = true;
  bool _waitingDriver = false;
  bool _cancelling = false;
  bool _mock = false;
  String? _error;
  Timer? _pollTimer;
  Timer? _mockTimer;
  Timer? _trackingPollTimer;
  RideSocket? _socket;
  int _mockStep = 0;
  bool _autoPaymentLaunched = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadRide());
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _mockTimer?.cancel();
    _trackingPollTimer?.cancel();
    _socket?.clearHandlers();
    super.dispose();
  }

  bool get _isTerminalStatus {
    final s = _status.toUpperCase();
    return s == 'COMPLETED' || s == 'CANCELLED';
  }

  LatLng? get _approachTarget {
    if (_driverPos == null) return null;
    if (_status.toUpperCase() == 'IN_PROGRESS') return _dropoff ?? _pickup;
    return _pickup;
  }

  String _normalizeWsStatus(String status) {
    return switch (status.toUpperCase()) {
      'ACCEPTED' => 'DRIVER_ASSIGNED',
      'SEARCHING' => 'MATCHING',
      'DRIVER_ARRIVED' => 'ARRIVING',
      _ => status,
    };
  }

  List<Map<String, dynamic>> get _timelineSteps => computeRideTimeline(_status);

  /// Libellé d'attente passager : distance + ETA du chauffeur, contextualisé par statut.
  String _etaLabel() {
    final km = _driverDistanceKm;
    final dist = (km != null && km > 0) ? ' · ${km.toStringAsFixed(1)} km' : '';
    return switch (_status.toUpperCase()) {
      'IN_PROGRESS' => 'Arrivée à destination : ~$_etaMinutes min$dist',
      'DRIVER_ARRIVED' => 'Votre chauffeur est arrivé',
      _ => 'Chauffeur à ~$_etaMinutes min$dist',
    };
  }

  bool get _canCancel => CancelEligibility.ride(_ride ?? {'status': _status});

  bool get _needsPayment {
    final s = _status.toUpperCase();
    if (s != 'COMPLETED') return _mock;
    return _ride?['isPaid'] != true;
  }

  void _updateEtaFromRide(Map<String, dynamic> data) {
    final backendKm = (data['driverDistanceKm'] as num?)?.toDouble();
    if (backendKm != null && backendKm > 0) _driverDistanceKm = backendKm;
    final apiEta = (data['etaMinutes'] as num?)?.toInt();
    if (apiEta != null && apiEta > 0) {
      _etaMinutes = apiEta;
      if (_driverDistanceKm != null) return;
    }
    final driverLat = (data['driver']?['lat'] as num?)?.toDouble();
    final driverLng = (data['driver']?['lng'] as num?)?.toDouble();
    if (driverLat != null && driverLng != null) {
      final status = data['status']?.toString() ?? '';
      final inProgress = status == 'IN_PROGRESS';
      final targetLat = (inProgress ? data['dropoffLat'] : data['pickupLat']) as num?;
      final targetLng = (inProgress ? data['dropoffLng'] : data['pickupLng']) as num?;
      if (targetLat != null && targetLng != null) {
        _driverDistanceKm = GeoUtils.haversineKm(
          driverLat,
          driverLng,
          targetLat.toDouble(),
          targetLng.toDouble(),
        );
        if (apiEta == null || apiEta <= 0) {
          _etaMinutes = GeoUtils.etaMinutesFromDistanceKm(_driverDistanceKm!);
        }
      }
    }
  }

  void _updateEtaFromDriverPosition(LatLng driverPos) {
    if (_ride == null) return;
    final status = _status;
    final inProgress = status == 'IN_PROGRESS';
    final targetLat = (inProgress ? _ride!['dropoffLat'] : _ride!['pickupLat']) as num?;
    final targetLng = (inProgress ? _ride!['dropoffLng'] : _ride!['pickupLng']) as num?;
    if (targetLat == null || targetLng == null) return;
    _driverDistanceKm = GeoUtils.haversineKm(
      driverPos.latitude,
      driverPos.longitude,
      targetLat.toDouble(),
      targetLng.toDouble(),
    );
    _etaMinutes = GeoUtils.etaMinutesFromDistanceKm(_driverDistanceKm!);
  }

  Map<String, dynamic>? _normalizeDriver(Map<String, dynamic>? raw) {
    if (raw == null) return null;
    final vehicle = raw['vehicle'] as Map<String, dynamic>?;
    return {
      'userId': raw['userId']?.toString(),
      'name': raw['name']?.toString() ??
          'Chauffeur ${raw['userId']?.toString().substring(0, 6) ?? ''}',
      'rating': (raw['rating'] as num?)?.toDouble(),
      'phone': raw['phone']?.toString() ?? '',
      'vehicleType': raw['vehicleType']?.toString() ?? vehicle?['type']?.toString() ?? 'Moto-taxi',
      'plateNumber': raw['plateNumber']?.toString() ?? vehicle?['plate']?.toString() ?? '—',
      'vehicleModel': raw['vehicleModel']?.toString() ??
          '${vehicle?['make'] ?? ''} ${vehicle?['model'] ?? ''}'.trim(),
    };
  }

  Future<void> _loadRide() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final api = ref.read(apiClientProvider);
    await api.checkHealth();
    final result = await api.getRide(widget.rideId);
    if (!mounted) return;
    setState(() {
      _loading = false;
      switch (result) {
        case Success(:final data):
          _applyRideData(data, api);
          if (_needsPayment && !_autoPaymentLaunched) {
            WidgetsBinding.instance.addPostFrameCallback((_) => _triggerAutoPayment());
          }
        case Failure(:final error):
          _error = error.message;
          if (api.isMockMode) _applyMockDriver();
      }
    });
  }

  void _applyRideData(Map<String, dynamic> data, ApiClient api) {
    _ride = data;
    _status = data['status']?.toString() ?? 'ACCEPTED';
    _driver = _normalizeDriver(data['driver'] as Map<String, dynamic>?);
    _pickup = LatLng(
      (data['pickupLat'] as num?)?.toDouble() ?? MarketConfig.defaultLat,
      (data['pickupLng'] as num?)?.toDouble() ?? MarketConfig.defaultLng,
    );
    final dLat = data['dropoffLat'] as num?;
    final dLng = data['dropoffLng'] as num?;
    if (dLat != null && dLng != null) {
      _dropoff = LatLng(dLat.toDouble(), dLng.toDouble());
    }
    final driverLat = (data['driver']?['lat'] as num?)?.toDouble();
    final driverLng = (data['driver']?['lng'] as num?)?.toDouble();
    if (driverLat != null && driverLng != null) {
      _driverPos = LatLng(driverLat, driverLng);
    }
    _routeTrace = MovaRideMap.parseGpsTrace(data['gpsTrace']);
    _updateEtaFromRide(data);

    final terminal = ['COMPLETED', 'CANCELLED'].contains(_status.toUpperCase());
    if (!api.isMockMode && !terminal) {
      _connectSocket();
    }

    if (api.rideHasDriver(data)) {
      _waitingDriver = false;
      _pollTimer?.cancel();
      _startTrackingPoll();
      if (api.isMockMode && _driver == null) _applyMockDriver();
    } else if (!api.isMockMode) {
      _waitingDriver = true;
      _pollTimer ??= Timer.periodic(const Duration(seconds: 3), (_) => _loadRide());
    } else {
      _applyMockDriver();
      _connectSocket();
    }
  }

  void _applyMockDriver() {
    if (!ref.read(apiClientProvider).isMockMode) return;
    _mock = true;
    _driver ??= {
      'name': 'Jean Kabila',
      'rating': null,
      'phone': '+243812345678',
      'vehicleType': 'Moto-taxi',
      'plateNumber': 'KIN-4521',
      'vehicleModel': 'Honda Ace',
    };
    _driverPos ??= LatLng(_pickup.latitude + 0.008, _pickup.longitude + 0.005);
    _routeTrace = [_driverPos!];
    _dropoff ??= LatLng(MarketConfig.defaultLat - 0.03, MarketConfig.defaultLng + 0.04);
    _startMockSimulation();
  }

  void _startTrackingPoll() {
    if (_trackingPollTimer?.isActive == true) return;
    _trackingPollTimer = Timer.periodic(const Duration(seconds: 5), (_) async {
      if (!mounted || _mock || _isTerminalStatus) return;
      final api = ref.read(apiClientProvider);
      if (api.isMockMode) return;
      final result = await api.getRide(widget.rideId);
      if (!mounted) return;
      if (result case Success(:final data)) {
        setState(() {
          _ride = data;
          _status = data['status']?.toString() ?? _status;
          _driver ??= _normalizeDriver(data['driver'] as Map<String, dynamic>?);
          final driverLat = (data['driver']?['lat'] as num?)?.toDouble();
          final driverLng = (data['driver']?['lng'] as num?)?.toDouble();
          if (driverLat != null && driverLng != null) {
            _driverPos = LatLng(driverLat, driverLng);
            _updateEtaFromDriverPosition(_driverPos!);
          }
          _routeTrace = MovaRideMap.parseGpsTrace(data['gpsTrace']);
          _updateEtaFromRide(data);
        });
      }
    });
  }

  Future<void> _connectSocket() async {
    final api = ref.read(apiClientProvider);
    if (api.isMockMode) {
      setState(() => _mock = true);
      _startMockSimulation();
      return;
    }
    final token = await api.authToken();
    if (!mounted) return;
    final socket = ref.read(rideSocketProvider);
    _socket = socket;
    socket.connect(
      rideId: widget.rideId,
      token: token,
      onConnected: () {
        if (!mounted) return;
        _mockTimer?.cancel();
        setState(() => _mock = false);
      },
      onDisconnected: () {
        if (!mounted) return;
        if (api.isMockMode) {
          setState(() {
            _mock = true;
            _startMockSimulation();
          });
          return;
        }
        _startTrackingPoll();
      },
      onLocation: (payload) {
        final lat = payload['lat'] as num?;
        final lng = payload['lng'] as num?;
        if (lat != null && lng != null && mounted) {
          final pos = LatLng(lat.toDouble(), lng.toDouble());
          setState(() {
            _driverPos = pos;
            _appendTracePoint(pos);
            _updateEtaFromDriverPosition(pos);
          });
        }
      },
      onStatus: (payload) {
        final raw = payload['status']?.toString();
        if (raw == null || !mounted) return;
        final status = _normalizeWsStatus(raw);
        setState(() {
          _status = status;
          if (_ride != null) {
            _ride = {..._ride!, 'status': status};
          }
        });
        if (status == 'COMPLETED') _triggerAutoPayment();
        if (status == 'CANCELLED') Navigator.pop(context);
      },
    );
  }

  void _appendTracePoint(LatLng pos) {
    if (_routeTrace.isNotEmpty) {
      final last = _routeTrace.last;
      final moved = (last.latitude - pos.latitude).abs() > 0.00001 ||
          (last.longitude - pos.longitude).abs() > 0.00001;
      if (!moved) return;
    }
    _routeTrace = [..._routeTrace, pos];
  }

  void _startMockSimulation() {
    if (!ref.read(apiClientProvider).isMockMode) return;
    if (_mockTimer?.isActive == true) return;
    const mockStatuses = ['ACCEPTED', 'ACCEPTED', 'DRIVER_ARRIVED', 'IN_PROGRESS'];
    _mockTimer = Timer.periodic(const Duration(seconds: 4), (_) {
      if (!mounted) return;
      setState(() {
        _mockStep = (_mockStep + 1).clamp(0, mockStatuses.length);
        if (_mockStep < mockStatuses.length) {
          _status = mockStatuses[_mockStep];
        }
        if (_driverPos != null) {
          _driverPos = LatLng(
            _driverPos!.latitude - 0.002,
            _driverPos!.longitude - 0.001,
          );
          _appendTracePoint(_driverPos!);
        }
        if (_mockStep >= mockStatuses.length - 1) {
          _mockTimer?.cancel();
          _triggerAutoPayment();
        }
      });
    });
  }

  void _triggerAutoPayment() {
    if (_autoPaymentLaunched || !_needsPayment) return;
    _autoPaymentLaunched = true;
    _goToPayment();
  }

  Future<void> _goToPayment() async {
    final api = ref.read(apiClientProvider);
    var pin = _ride?['completionPin']?.toString();
    var price = (_ride?['finalFareCdf'] ??
            _ride?['estimatedFareCdf'] ??
            widget.estimatedFareCdf) as int;
    if (!api.isMockMode) {
      final result = await api.getRide(widget.rideId);
      if (result case Success(:final data)) {
        if (mounted) setState(() => _ride = data);
        pin = data['completionPin']?.toString() ?? pin;
        price = (data['finalFareCdf'] ?? data['estimatedFareCdf'] ?? price) as int;
      }
    }
    if (!mounted) return;
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => PaymentScreen(
          rideId: widget.rideId,
          amountCdf: price,
          completionPin: pin,
        ),
      ),
    );
    if (mounted) await _loadRide();
  }

  Future<void> _callDriver() async {
    final phone = _driver?['phone']?.toString() ?? '+243812345678';
    if (phone.isEmpty) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Numéro chauffeur indisponible')),
        );
      }
      return;
    }
    final uri = Uri.parse('tel:$phone');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    } else if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Appel : $phone')),
      );
    }
  }

  Future<void> _shareTrip() async {
    final api = ref.read(apiClientProvider);
    final result = await api.createRideShareLink(widget.rideId);
    if (!mounted) return;
    switch (result) {
      case Success(:final data):
        final url = data['shareUrl']?.toString() ?? 'https://mova.cd/suivi/${widget.rideId}';
        final pickup = _ride?['pickupAddress']?.toString() ?? 'Départ';
        final dropoff = _ride?['dropoffAddress']?.toString() ?? 'Arrivée';
        final text = 'Je suis en course MOVA ($pickup → $dropoff). Suivi : $url';
        await Clipboard.setData(ClipboardData(text: text));
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Lien de suivi copié dans le presse-papiers')),
        );
      case Failure():
        final pickup = _ride?['pickupAddress']?.toString() ?? 'Départ';
        final dropoff = _ride?['dropoffAddress']?.toString() ?? 'Arrivée';
        final text = 'Je suis en course MOVA ($pickup → $dropoff). https://mova.cd/suivi/${widget.rideId}';
        await Clipboard.setData(ClipboardData(text: text));
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Lien copié (mode secours)')),
        );
    }
  }

  Future<({double lat, double lng})> _resolveSosPosition() async {
    try {
      if (await Geolocator.isLocationServiceEnabled()) {
        var permission = await Geolocator.checkPermission();
        if (permission == LocationPermission.denied) {
          permission = await Geolocator.requestPermission();
        }
        if (permission == LocationPermission.whileInUse ||
            permission == LocationPermission.always) {
          final pos = await Geolocator.getCurrentPosition(
            locationSettings: const LocationSettings(
              accuracy: LocationAccuracy.high,
              timeLimit: Duration(seconds: 12),
            ),
          );
          return (lat: pos.latitude, lng: pos.longitude);
        }
      }
    } catch (_) {
      /* fallback ci-dessous */
    }
    if (_driverPos != null) {
      return (lat: _driverPos!.latitude, lng: _driverPos!.longitude);
    }
    return (lat: _pickup.latitude, lng: _pickup.longitude);
  }

  Future<void> _triggerSos() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Alerte SOS'),
        content: const Text(
          'MOVA transmettra votre position à l\'équipe support. En cas de danger immédiat, appelez aussi les secours locaux.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Annuler')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Envoyer SOS', style: TextStyle(color: MovaColors.red)),
          ),
        ],
      ),
    );
    if (confirm != true || !mounted) return;
    final api = ref.read(apiClientProvider);
    final sosPos = await _resolveSosPosition();
    if (!mounted) return;
    final result = await api.reportSos(
      description: 'SOS course ${widget.rideId}',
      rideId: widget.rideId,
      lat: sosPos.lat,
      lng: sosPos.lng,
    );
    if (!mounted) return;
    switch (result) {
      case Success():
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Alerte SOS envoyée — l\'équipe MOVA a été notifiée')),
        );
      case Failure(:final error):
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.message)));
    }
  }

  Future<void> _cancelRide() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Annuler la course ?'),
        content: const Text(
          'Annulation gratuite avant l\'arrivée du chauffeur. '
          'Des frais peuvent s\'appliquer après acceptation.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Non')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Oui, annuler'),
          ),
        ],
      ),
    );
    if (confirm != true || !mounted) return;

    setState(() => _cancelling = true);
    _pollTimer?.cancel();
    _trackingPollTimer?.cancel();
    _socket?.dispose();
    final api = ref.read(apiClientProvider);
    final result = await api.cancelRide(widget.rideId, reason: 'Annulé par le passager');
    if (!mounted) return;
    setState(() => _cancelling = false);
    switch (result) {
      case Success(:final data):
        final fee = data['cancellationFeeFormatted']?.toString();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(data['message']?.toString() ?? 'Course annulée${fee != null ? ' — $fee' : ''}')),
        );
        Navigator.pop(context);
      case Failure(:final error):
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_waitingDriver && !_loading) {
      return MovaScreen(
        title: 'Suivi de course',
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const CircularProgressIndicator(color: MovaColors.violet),
            const SizedBox(height: 16),
            const Text(
              'En attente d\'assignation du chauffeur…',
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            MovaButton(
              label: 'Actualiser',
              isSecondary: true,
              icon: Icons.refresh,
              onPressed: _loadRide,
            ),
            if (_canCancel) ...[
              const SizedBox(height: 12),
              MovaButton(
                label: 'Annuler la course',
                isSecondary: true,
                icon: Icons.cancel_outlined,
                isLoading: _cancelling,
                onPressed: _cancelling ? null : _cancelRide,
              ),
            ],
          ],
        ),
      );
    }

    final driverName = _driver?['name']?.toString() ?? 'Chauffeur';
    final rating = (_driver?['rating'] as num?)?.toDouble();
    final plate = _driver?['plateNumber']?.toString() ?? '—';
    final vehicle = _driver?['vehicleType']?.toString() ??
        _driver?['vehicleModel']?.toString() ??
        'Moto-taxi';

    return MovaScreen(
      title: 'Suivi de course',
      scrollable: false,
      padding: EdgeInsets.zero,
      actions: [
        IconButton(
          icon: const Icon(Icons.emergency_share, color: MovaColors.red),
          tooltip: 'SOS',
          onPressed: _triggerSos,
        ),
        IconButton(
          icon: const Icon(Icons.share_outlined),
          tooltip: 'Partager',
          onPressed: _shareTrip,
        ),
      ],
      child: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null && _driver == null
              ? Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    children: [
                      MovaErrorBanner(message: _error!, onRetry: _loadRide),
                    ],
                  ),
                )
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    MovaRideMap(
                      pickup: _pickup,
                      dropoff: _dropoff,
                      driver: _driverPos,
                      routeTrace: _routeTrace,
                      approachTarget: _approachTarget,
                      followDriver: !_isTerminalStatus && _driverPos != null,
                      height: 240,
                      pickupLabel: _ride?['pickupAddress']?.toString(),
                      dropoffLabel: _ride?['dropoffAddress']?.toString(),
                    ),
                    Expanded(
                      child: SingleChildScrollView(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            MovaCard(
                              child: Row(
                                children: [
                                  CircleAvatar(
                                    radius: 28,
                                    backgroundColor: MovaColors.violet.withValues(alpha: 0.15),
                                    child: Text(
                                      driverName.isNotEmpty ? driverName[0].toUpperCase() : '?',
                                      style: const TextStyle(
                                        fontWeight: FontWeight.bold,
                                        color: MovaColors.violet,
                                        fontSize: 22,
                                      ),
                                    ),
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          driverName,
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                          style: const TextStyle(
                                            fontWeight: FontWeight.bold,
                                            fontSize: 16,
                                          ),
                                        ),
                                        if (rating != null)
                                          Row(
                                            children: [
                                              const Icon(Icons.star, color: Colors.amber, size: 16),
                                              const SizedBox(width: 4),
                                              Text(rating.toStringAsFixed(1)),
                                              const SizedBox(width: 8),
                                              Flexible(
                                                child: Text(
                                                  '$vehicle · $plate',
                                                  maxLines: 1,
                                                  overflow: TextOverflow.ellipsis,
                                                  style: const TextStyle(
                                                    color: MovaColors.textSecondary,
                                                    fontSize: 13,
                                                  ),
                                                ),
                                              ),
                                            ],
                                          )
                                        else
                                          Text(
                                            '$vehicle · $plate',
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                            style: const TextStyle(
                                              color: MovaColors.textSecondary,
                                              fontSize: 13,
                                            ),
                                          ),
                                      ],
                                    ),
                                  ),
                                  IconButton(
                                    icon: const Icon(Icons.chat_bubble_outline, color: MovaColors.violet),
                                    tooltip: 'Chat',
                                    onPressed: () {
                                      Navigator.push(
                                        context,
                                        MaterialPageRoute(
                                          builder: (_) => RideChatScreen(
                                            rideId: widget.rideId,
                                            myRole: 'passenger',
                                            peerLabel: driverName,
                                          ),
                                        ),
                                      );
                                    },
                                  ),
                                  IconButton(
                                    icon: const Icon(Icons.phone, color: MovaColors.green),
                                    onPressed: _callDriver,
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(height: 12),
                            MovaCard(
                              child: Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Icon(
                                    _status.toUpperCase() == 'IN_PROGRESS'
                                        ? Icons.flag_outlined
                                        : Icons.directions_car,
                                    color: MovaColors.violet,
                                  ),
                                  const SizedBox(width: 8),
                                  Flexible(
                                    child: Text(
                                      _etaLabel(),
                                      textAlign: TextAlign.center,
                                      style: const TextStyle(
                                        fontWeight: FontWeight.w600,
                                        fontSize: 16,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(height: 16),
                            Text('Statut', style: Theme.of(context).textTheme.titleSmall),
                            const SizedBox(height: 8),
                            ..._timelineSteps.map((step) {
                              final label = step['label']?.toString() ?? '';
                              final done = step['done'] == true;
                              final active = !done &&
                                  _timelineSteps.indexOf(step) ==
                                      _timelineSteps.indexWhere((s) => s['done'] != true);
                              return Padding(
                                padding: const EdgeInsets.only(bottom: 8),
                                child: Row(
                                  children: [
                                    Icon(
                                      done ? Icons.check_circle : Icons.radio_button_unchecked,
                                      color: active
                                          ? MovaColors.violet
                                          : done
                                              ? MovaColors.green
                                              : MovaColors.textSecondary,
                                      size: 20,
                                    ),
                                    const SizedBox(width: 10),
                                    Expanded(
                                      child: Text(
                                        label,
                                        style: TextStyle(
                                          fontWeight: active ? FontWeight.w600 : FontWeight.normal,
                                          color: done
                                              ? MovaColors.midnight
                                              : MovaColors.textSecondary,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              );
                            }),
                            const SizedBox(height: 16),
                            if (_canCancel)
                              MovaButton(
                                label: 'Annuler la course',
                                isSecondary: true,
                                icon: Icons.cancel_outlined,
                                isLoading: _cancelling,
                                onPressed: _cancelling ? null : _cancelRide,
                              ),
                            if (_needsPayment) ...[
                              const SizedBox(height: 8),
                              MovaButton(
                                label: 'Payer la course',
                                icon: Icons.payment_outlined,
                                onPressed: _goToPayment,
                              ),
                            ],
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
    );
  }
}

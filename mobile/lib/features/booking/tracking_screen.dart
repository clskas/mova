import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:latlong2/latlong.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/api/api_client.dart';
import '../../core/api/ride_socket.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import 'payment_screen.dart';
import 'widgets/mova_ride_map.dart';

const _statusSteps = [
  ('ACCEPTED', 'Assigné'),
  ('ACCEPTED', 'En route'),
  ('DRIVER_ARRIVED', 'Arrivé'),
  ('IN_PROGRESS', 'En course'),
];

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
  int _etaMinutes = 8;
  bool _loading = true;
  bool _waitingDriver = false;
  bool _mock = false;
  String? _error;
  Timer? _etaTimer;
  Timer? _pollTimer;
  Timer? _mockTimer;
  RideSocket? _socket;
  int _mockStep = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _loadRide();
      _startEtaCountdown();
    });
  }

  @override
  void dispose() {
    _etaTimer?.cancel();
    _pollTimer?.cancel();
    _mockTimer?.cancel();
    _socket?.dispose();
    super.dispose();
  }

  void _startEtaCountdown() {
    _etaTimer = Timer.periodic(const Duration(seconds: 30), (_) {
      if (mounted && _etaMinutes > 1) {
        setState(() => _etaMinutes -= 1);
      }
    });
  }

  Map<String, dynamic>? _normalizeDriver(Map<String, dynamic>? raw) {
    if (raw == null) return null;
    final vehicle = raw['vehicle'] as Map<String, dynamic>?;
    return {
      'name': raw['name']?.toString() ??
          'Chauffeur ${raw['userId']?.toString().substring(0, 6) ?? ''}',
      'rating': (raw['rating'] as num?)?.toDouble() ?? 4.5,
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
    } else if (_driver != null) {
      _driverPos = LatLng(_pickup.latitude + 0.008, _pickup.longitude + 0.005);
    }

    if (api.rideHasDriver(data)) {
      _waitingDriver = false;
      _pollTimer?.cancel();
      _connectSocket();
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
    _mock = true;
    _driver ??= {
      'name': 'Jean Kabila',
      'rating': 4.8,
      'phone': '+243812345678',
      'vehicleType': 'Moto-taxi',
      'plateNumber': 'KIN-4521',
      'vehicleModel': 'Honda Ace',
    };
    _driverPos ??= LatLng(_pickup.latitude + 0.008, _pickup.longitude + 0.005);
    _dropoff ??= LatLng(MarketConfig.defaultLat - 0.03, MarketConfig.defaultLng + 0.04);
    _startMockSimulation();
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
        if (mounted) setState(() => _mock = false);
      },
      onDisconnected: () {
        if (!mounted) return;
        if (socket.mockMode && ref.read(apiClientProvider).isMockMode) {
          setState(() {
            _mock = true;
            _startMockSimulation();
          });
        }
      },
      onLocation: (payload) {
        final lat = payload['lat'] as num?;
        final lng = payload['lng'] as num?;
        if (lat != null && lng != null && mounted) {
          setState(() => _driverPos = LatLng(lat.toDouble(), lng.toDouble()));
        }
      },
      onStatus: (payload) {
        final status = payload['status']?.toString();
        if (status != null && mounted) {
          setState(() => _status = status);
          if (status == 'COMPLETED') _goToPayment();
        }
      },
    );
  }

  void _startMockSimulation() {
    if (_mockTimer?.isActive == true) return;
    _mockTimer = Timer.periodic(const Duration(seconds: 4), (_) {
      if (!mounted) return;
      setState(() {
        _mockStep = (_mockStep + 1) % 4;
        _status = _statusSteps[_mockStep].$1;
        if (_driverPos != null) {
          _driverPos = LatLng(
            _driverPos!.latitude - 0.002,
            _driverPos!.longitude - 0.001,
          );
        }
        if (_mockStep == 3) {
          _mockTimer?.cancel();
          _goToPayment();
        }
      });
    });
  }

  void _goToPayment() {
    final price = (_ride?['finalFareCdf'] ??
            _ride?['estimatedFareCdf'] ??
            widget.estimatedFareCdf) as int;
    Navigator.pushReplacement(
      context,
      MaterialPageRoute(
        builder: (_) => PaymentScreen(rideId: widget.rideId, amountCdf: price),
      ),
    );
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

  void _shareTrip() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Lien de partage de trajet (bientôt disponible)')),
    );
  }

  int _stepIndex(String status) {
    final idx = _statusSteps.indexWhere((s) => s.$1 == status);
    return idx >= 0 ? idx : 0;
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
          ],
        ),
      );
    }

    final currentStep = _stepIndex(_status);
    final driverName = _driver?['name']?.toString() ?? 'Chauffeur';
    final rating = (_driver?['rating'] as num?)?.toDouble() ?? 4.8;
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
                      height: 200,
                    ),
                    if (_mock)
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 6),
                        child: Text(
                          'Mode démo — suivi GPS simulé',
                          textAlign: TextAlign.center,
                          style: TextStyle(color: MovaColors.orange, fontSize: 12),
                        ),
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
                                        ),
                                      ],
                                    ),
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
                                  const Icon(Icons.schedule, color: MovaColors.violet),
                                  const SizedBox(width: 8),
                                  Text(
                                    'Arrivée estimée : $_etaMinutes min',
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w600,
                                      fontSize: 16,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(height: 16),
                            Text('Statut', style: Theme.of(context).textTheme.titleSmall),
                            const SizedBox(height: 8),
                            ...List.generate(_statusSteps.length, (i) {
                              final (code, label) = _statusSteps[i];
                              final done = i <= currentStep;
                              final active = i == currentStep;
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
                            if (_mock || _status == 'COMPLETED' || currentStep >= 3)
                              MovaButton(
                                label: 'Terminer et payer',
                                onPressed: _goToPayment,
                              ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
    );
  }
}

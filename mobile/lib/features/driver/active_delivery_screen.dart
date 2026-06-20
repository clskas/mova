import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import '../../core/api/api_client.dart';
import '../../core/api/ride_socket.dart';
import '../../core/geo/maps_launcher.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';

class ActiveDeliveryScreen extends ConsumerStatefulWidget {
  const ActiveDeliveryScreen({super.key, required this.delivery});

  final Map<String, dynamic> delivery;

  @override
  ConsumerState<ActiveDeliveryScreen> createState() => _ActiveDeliveryScreenState();
}

class _ActiveDeliveryScreenState extends ConsumerState<ActiveDeliveryScreen> {
  late Map<String, dynamic> _delivery;
  bool _loading = false;
  String? _error;
  Timer? _locationTimer;
  String? _userId;

  String get _deliveryId => _delivery['id']?.toString() ?? '';
  String get _status => _delivery['status']?.toString() ?? 'PENDING';

  String get _typeLabel {
    return switch (_delivery['type']?.toString()) {
      'FOOD' => 'Livraison repas',
      'EXPRESS' => 'Express',
      'PARCEL' => 'Colis',
      'ERRAND' => 'Courses & commissions',
      _ => 'Livraison',
    };
  }

  bool get _isErrand => _delivery['type']?.toString() == 'ERRAND';

  @override
  void initState() {
    super.initState();
    _delivery = Map<String, dynamic>.from(widget.delivery);
    _bootstrapTracking();
  }

  @override
  void dispose() {
    _locationTimer?.cancel();
    ref.read(rideSocketProvider).dispose();
    super.dispose();
  }

  Future<void> _bootstrapTracking() async {
    final api = ref.read(apiClientProvider);
    final profile = await api.getDriverProfile();
    if (profile case Success(:final data)) {
      _userId = data['userId']?.toString();
    }
    await _connectTrackingSocket();
    _startLocationUpdates();
  }

  Future<void> _connectTrackingSocket() async {
    final api = ref.read(apiClientProvider);
    if (api.isMockMode) return;
    final token = await api.authToken();
    if (!mounted) return;
    ref.read(rideSocketProvider).connectDelivery(
      deliveryId: _deliveryId,
      token: token,
      referenceType: _isErrand ? 'ERRAND' : 'DELIVERY',
    );
  }

  void _startLocationUpdates() {
    _locationTimer?.cancel();
    _locationTimer = Timer.periodic(const Duration(seconds: 12), (_) => _pushLocation());
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
    final api = ref.read(apiClientProvider);
    await api.updateDriverLocation(pos.latitude, pos.longitude);

    final socket = ref.read(rideSocketProvider);
    if (!socket.isConnected && !api.isMockMode) {
      await _connectTrackingSocket();
    }
    socket.emitCourierLocation(
      userId: _userId ?? '',
      lat: pos.latitude,
      lng: pos.longitude,
      deliveryId: _deliveryId,
      referenceType: _isErrand ? 'ERRAND' : 'DELIVERY',
    );
    if (!api.isMockMode) {
      await api.recordTrackingPoint(
        _isErrand ? 'errand' : 'delivery',
        _deliveryId,
        pos.latitude,
        pos.longitude,
      );
    }
  }

  Future<void> _refresh() async {
    final api = ref.read(apiClientProvider);
    final path = _isErrand ? '/errands/$_deliveryId' : '/deliveries/$_deliveryId';
    final result = await api.get(path);
    if (!mounted) return;
    if (result case Success(:final data)) {
      setState(() {
        _delivery = data['errand'] as Map<String, dynamic>? ??
            data['delivery'] as Map<String, dynamic>? ??
            data;
      });
    }
  }

  Future<void> _advanceStatus(String nextStatus, String successMessage) async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final api = ref.read(apiClientProvider);
    final Result<Map<String, dynamic>> result;
    if (_isErrand) {
      result = await api.patch('/errands/$_deliveryId/driver-status', {'status': nextStatus});
    } else {
      result = await api.updateDeliveryStatus(_deliveryId, nextStatus);
    }
    if (!mounted) return;
    setState(() => _loading = false);
    switch (result) {
      case Success(:final data):
        setState(() {
          _delivery = data['errand'] as Map<String, dynamic>? ??
              data['delivery'] as Map<String, dynamic>? ??
              data;
        });
        if (nextStatus == 'DELIVERED' || nextStatus == 'COMPLETED') {
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(successMessage)));
          Navigator.pop(context, true);
        } else {
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(successMessage)));
        }
      case Failure(:final error):
        setState(() => _error = error.message);
    }
  }

  Future<void> _openMaps() async {
    final toPickup = _status == 'PICKED_UP';
    final lat = (toPickup
            ? _delivery['pickupLat']
            : (_delivery['dropoffLat'] ?? _delivery['deliveryLat']))
        as num?;
    final lng = (toPickup
            ? _delivery['pickupLng']
            : (_delivery['dropoffLng'] ?? _delivery['deliveryLng']))
        as num?;
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
    );
    if (!opened && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Impossible d\'ouvrir Google Maps')),
      );
    }
  }

  String? get _nextAction {
    if (_isErrand) {
      return switch (_status) {
        'ASSIGNED' => 'IN_PROGRESS',
        'IN_PROGRESS' => 'COMPLETED',
        _ => null,
      };
    }
    return switch (_status) {
      'PICKED_UP' => 'IN_TRANSIT',
      'IN_TRANSIT' => 'DELIVERED',
      _ => null,
    };
  }

  String get _actionLabel {
    if (_isErrand) {
      return switch (_status) {
        'ASSIGNED' => 'Démarrer les courses',
        'IN_PROGRESS' => 'Marquer comme terminé',
        _ => 'Actualiser',
      };
    }
    return switch (_status) {
      'PICKED_UP' => 'En route vers le client',
      'IN_TRANSIT' => 'Marquer comme livré',
      _ => 'Actualiser',
    };
  }

  @override
  Widget build(BuildContext context) {
    final price = _delivery['estimatedPriceCdf'] as int? ?? _delivery['priceCdf'] as int? ?? 0;

    return MovaScreen(
      title: 'Livraison active',
      scrollable: false,
      child: MovaFlexScroll(
        child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          MovaCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _typeLabel,
                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 8),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(Icons.trip_origin, color: MovaColors.green, size: 18),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        _delivery['pickupAddress']?.toString() ?? '—',
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(Icons.location_on, color: MovaColors.violet, size: 18),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        _delivery['dropoffAddress']?.toString() ??
                            _delivery['deliveryAddress']?.toString() ??
                            '—',
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  MarketConfig.formatCdf(price),
                  style: const TextStyle(color: MovaColors.green, fontWeight: FontWeight.bold),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 4),
                Text('Statut : $_status', style: const TextStyle(color: MovaColors.textSecondary, fontSize: 13)),
              ],
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            MovaErrorBanner(message: _error!),
          ],
          const SizedBox(height: 16),
          if (_nextAction != null)
            MovaButton(
              label: _actionLabel,
              icon: Icons.delivery_dining,
              onPressed: _loading
                  ? null
                  : () => _advanceStatus(
                        _nextAction!,
                        _nextAction == 'DELIVERED' ? 'Livraison terminée' : 'Statut mis à jour',
                      ),
            ),
          const SizedBox(height: 8),
          MovaButton(
            label: _status == 'PICKED_UP' ? 'Navigation — restaurant' : 'Ouvrir la navigation',
            isSecondary: true,
            icon: Icons.map_outlined,
            onPressed: _loading ? null : _openMaps,
          ),
          const SizedBox(height: 8),
          MovaButton(
            label: 'Actualiser',
            isSecondary: true,
            icon: Icons.refresh,
            onPressed: _loading ? null : _refresh,
          ),
        ],
        ),
      ),
    );
  }
}

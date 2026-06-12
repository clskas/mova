import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/api/api_client.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import '../../core/theme/mova_colors.dart';
import 'tracking_screen.dart';

class BookingScreen extends ConsumerStatefulWidget {
  const BookingScreen({super.key});

  @override
  ConsumerState<BookingScreen> createState() => _BookingScreenState();
}

class _BookingScreenState extends ConsumerState<BookingScreen> {
  String _vehicleType = 'MOTO_TAXI';
  String _destination = '';
  int? _estimatedFare;
  bool _loading = false;
  String? _error;

  Future<void> _estimate() async {
    if (_destination.isEmpty) return;
    setState(() { _loading = true; _error = null; });
    final api = ref.read(apiClientProvider);
    final result = await api.get(
      '/rides/estimate?pickupLat=${MarketConfig.defaultLat}'
      '&pickupLng=${MarketConfig.defaultLng}'
      '&dropoffLat=${MarketConfig.defaultLat - 0.03}'
      '&dropoffLng=${MarketConfig.defaultLng + 0.04}'
      '&vehicleType=$_vehicleType',
    );
    setState(() {
      _loading = false;
      switch (result) {
        case Success(:final data):
          _estimatedFare = (data['estimatedFareCdf'] ?? data['priceCdf']) as int?;
        case Failure(:final error):
          _error = error.message;
      }
    });
  }

  Future<void> _confirmRide() async {
    setState(() { _loading = true; _error = null; });
    final api = ref.read(apiClientProvider);
    final result = await api.post('/rides', {
      'pickupLat': MarketConfig.defaultLat,
      'pickupLng': MarketConfig.defaultLng,
      'dropoffLat': MarketConfig.defaultLat - 0.03,
      'dropoffLng': MarketConfig.defaultLng + 0.04,
      'vehicleType': _vehicleType,
      'pickupAddress': 'Ma position, Kinshasa',
      'dropoffAddress': _destination,
    });
    setState(() => _loading = false);
    switch (result) {
      case Success(:final data):
        final ride = data['ride'] as Map<String, dynamic>?;
        if (ride != null && mounted) {
          Navigator.pushReplacement(
            context,
            MaterialPageRoute(
              builder: (_) => TrackingScreen(rideId: ride['id'] as String),
            ),
          );
        }
      case Failure(:final error):
        setState(() => _error = error.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    return MovaScreen(
      title: 'Commander',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
            decoration: const InputDecoration(
              labelText: 'Destination',
              hintText: 'Ex: Gombe, Limete, Masina…',
              prefixIcon: Icon(Icons.place),
            ),
            onChanged: (v) => _destination = v,
          ),
          const SizedBox(height: 16),
          Text('Type de véhicule', style: Theme.of(context).textTheme.titleSmall),
          const SizedBox(height: 8),
          ...MarketConfig.vehicleTypes.map((v) => RadioListTile<String>(
                title: Text('${v.icon} ${v.label}'),
                value: v.id,
                groupValue: _vehicleType,
                onChanged: (val) {
                  setState(() => _vehicleType = val!);
                  _estimate();
                },
              )),
          if (_estimatedFare != null) ...[
            const SizedBox(height: 16),
            MovaCard(
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('Estimation', style: TextStyle(fontSize: 16)),
                  Text(
                    MarketConfig.formatCdf(_estimatedFare!),
                    style: const TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                      color: MovaColors.green,
                    ),
                  ),
                ],
              ),
            ),
          ],
          if (_error != null) ...[
            const SizedBox(height: 16),
            MovaErrorBanner(message: _error!, onRetry: _estimate),
          ],
          const SizedBox(height: 24),
          MovaButton(
            label: _estimatedFare == null ? 'Estimer le prix' : 'Confirmer la course',
            isLoading: _loading,
            onPressed: _estimatedFare == null ? _estimate : _confirmRide,
          ),
        ],
      ),
    );
  }
}

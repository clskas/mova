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
  final _destinationController = TextEditingController();
  int? _estimatedFare;
  bool _loading = false;
  String? _error;
  String? _validationError;

  static const _pickupLat = MarketConfig.defaultLat;
  static const _pickupLng = MarketConfig.defaultLng;
  static const _dropoffLat = MarketConfig.defaultLat - 0.03;
  static const _dropoffLng = MarketConfig.defaultLng + 0.04;

  @override
  void dispose() {
    _destinationController.dispose();
    super.dispose();
  }

  Map<String, dynamic> _estimatePayload() => {
        'pickupLat': _pickupLat,
        'pickupLng': _pickupLng,
        'dropoffLat': _dropoffLat,
        'dropoffLng': _dropoffLng,
        'vehicleType': _vehicleType,
      };

  String? _validateDestination() {
    if (_destinationController.text.trim().isEmpty) {
      return 'Indiquez votre destination.';
    }
    return null;
  }

  Future<void> _estimate() async {
    final validation = _validateDestination();
    if (validation != null) {
      setState(() => _validationError = validation);
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
      _validationError = null;
    });
    final api = ref.read(apiClientProvider);
    await api.checkHealth();
    final result = await api.post('/rides/estimate', _estimatePayload());
    setState(() {
      _loading = false;
      switch (result) {
        case Success(:final data):
          _estimatedFare = (data['estimatedFareCdf'] ?? data['estimatedPriceCdf']) as int?;
        case Failure(:final error):
          _error = error.message;
      }
    });
  }

  Future<void> _confirmRide() async {
    final validation = _validateDestination();
    if (validation != null) {
      setState(() => _validationError = validation);
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
      _validationError = null;
    });
    final api = ref.read(apiClientProvider);
    final result = await api.post('/rides', {
      ..._estimatePayload(),
      'pickupAddress': 'Ma position, Kinshasa',
      'dropoffAddress': _destinationController.text.trim(),
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
            controller: _destinationController,
            decoration: const InputDecoration(
              labelText: 'Destination',
              hintText: 'Ex: Gombe, Limete, Masina…',
              prefixIcon: Icon(Icons.place),
            ),
            onChanged: (_) => setState(() {
              _estimatedFare = null;
              _validationError = null;
            }),
          ),
          const SizedBox(height: 16),
          Text('Type de véhicule', style: Theme.of(context).textTheme.titleSmall),
          const SizedBox(height: 8),
          ...MarketConfig.vehicleTypes.map((v) => RadioListTile<String>(
                title: Text('${v.icon} ${v.label}'),
                value: v.id,
                groupValue: _vehicleType,
                onChanged: (val) {
                  setState(() {
                    _vehicleType = val!;
                    _estimatedFare = null;
                  });
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
          if (_validationError != null) ...[
            const SizedBox(height: 16),
            MovaErrorBanner(message: _validationError!),
          ],
          if (_error != null) ...[
            const SizedBox(height: 16),
            MovaErrorBanner(message: _error!, onRetry: _estimate),
          ],
          const SizedBox(height: 24),
          MovaButton(
            label: _estimatedFare == null ? 'Estimer le prix' : 'Confirmer la course',
            isLoading: _loading,
            onPressed: _loading
                ? null
                : (_estimatedFare == null ? _estimate : _confirmRide),
          ),
        ],
      ),
    );
  }
}

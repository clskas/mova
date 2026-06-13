import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_client.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';

class ScheduledRideScreen extends ConsumerStatefulWidget {
  const ScheduledRideScreen({super.key});

  @override
  ConsumerState<ScheduledRideScreen> createState() => _ScheduledRideScreenState();
}

class _ScheduledRideScreenState extends ConsumerState<ScheduledRideScreen> {
  final _destinationController = TextEditingController();
  DateTime _scheduledAt = DateTime.now().add(const Duration(hours: 2));
  String _vehicleType = 'STANDARD';
  int? _estimatedPrice;
  bool _loading = false;
  bool _loadingUpcoming = true;
  List<Map<String, dynamic>> _upcoming = [];
  String? _error;
  String? _validationError;

  static const _pickupLat = MarketConfig.defaultLat;
  static const _pickupLng = MarketConfig.defaultLng;
  static const _dropoffLat = MarketConfig.defaultLat - 0.03;
  static const _dropoffLng = MarketConfig.defaultLng + 0.04;

  DateTime get _maxDate => DateTime.now().add(const Duration(days: 7));

  String _formatDateTime(DateTime dt) {
    final day = dt.day.toString().padLeft(2, '0');
    final month = dt.month.toString().padLeft(2, '0');
    final hour = dt.hour.toString().padLeft(2, '0');
    final minute = dt.minute.toString().padLeft(2, '0');
    return '$day/$month/${dt.year} à $hour:$minute';
  }

  Map<String, dynamic> _ridePayload() => {
        'pickupLat': _pickupLat,
        'pickupLng': _pickupLng,
        'dropoffLat': _dropoffLat,
        'dropoffLng': _dropoffLng,
        'pickupAddress': 'Ma position, Kinshasa',
        'dropoffAddress': _destinationController.text.trim(),
        'vehicleType': _vehicleType,
        'scheduledAt': _scheduledAt.toIso8601String(),
      };

  @override
  void initState() {
    super.initState();
    _loadUpcoming();
  }

  Future<void> _loadUpcoming() async {
    setState(() => _loadingUpcoming = true);
    final api = ref.read(apiClientProvider);
    await api.checkHealth();
    final result = await api.get('/rides/scheduled');
    if (result case Success(:final data)) {
      final list = data['data'] as List? ?? (data is List ? data : null);
      setState(() {
        _upcoming = (list ?? []).cast<Map<String, dynamic>>();
        _loadingUpcoming = false;
      });
    } else {
      setState(() => _loadingUpcoming = false);
    }
  }

  @override
  void dispose() {
    _destinationController.dispose();
    super.dispose();
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
    final api = ref.read(apiClientProvider);
    final result = await api.post('/rides/estimate', {
      'pickupLat': _pickupLat,
      'pickupLng': _pickupLng,
      'dropoffLat': _dropoffLat,
      'dropoffLng': _dropoffLng,
      'vehicleType': _vehicleType,
    });
    setState(() {
      _loading = false;
      switch (result) {
        case Success(:final data):
          _estimatedPrice = (data['estimatedFareCdf'] ?? data['estimatedPriceCdf']) as int?;
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
                'Votre trajet vers ${_destinationController.text.trim()} '
                'est programmé pour le $when.\n'
                'Réf. : ${ride?['id'] ?? ''}',
                maxLines: 5,
                overflow: TextOverflow.ellipsis,
              ),
              actions: [
                TextButton(
                  onPressed: () {
                    Navigator.pop(ctx);
                    setState(() {
                      _estimatedPrice = null;
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
          if (_loadingUpcoming)
            const Padding(
              padding: EdgeInsets.only(bottom: 16),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (_upcoming.isNotEmpty) ...[
            Text('Réservations à venir', style: theme.textTheme.titleSmall),
            const SizedBox(height: 8),
            ..._upcoming.map((map) {
              final scheduledRaw = map['scheduledAt']?.toString();
              final scheduledLabel = scheduledRaw != null
                  ? _formatDateTime(DateTime.parse(scheduledRaw))
                  : '';
              return Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: MovaCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
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
                      Text(
                        MarketConfig.formatCdf(
                          map['estimatedPriceCdf'] as int? ?? map['priceCdf'] as int? ?? 0,
                        ),
                        style: const TextStyle(color: MovaColors.violet),
                      ),
                    ],
                  ),
                ),
              );
            }),
            const Divider(height: 32),
            Text('Nouvelle réservation', style: theme.textTheme.titleSmall),
            const SizedBox(height: 12),
          ] else ...[
            const Padding(
              padding: EdgeInsets.only(bottom: 16),
              child: Text(
                'Aucune réservation à venir.',
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
                      Text('Date et heure', style: theme.textTheme.titleSmall),
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
            'Maximum J+7',
            style: theme.textTheme.bodySmall?.copyWith(color: MovaColors.textSecondary),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _destinationController,
            decoration: const InputDecoration(
              labelText: 'Destination',
              hintText: 'Ex: Aéroport, Gombe…',
              prefixIcon: Icon(Icons.place),
            ),
            onChanged: (_) => setState(() => _estimatedPrice = null),
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
                  });
                },
              )),
          if (_estimatedPrice != null) ...[
            const SizedBox(height: 16),
            MovaCard(
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('Estimation', style: TextStyle(fontSize: 16)),
                  Text(
                    MarketConfig.formatCdf(_estimatedPrice!),
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
            label: _estimatedPrice == null ? 'Estimer le prix' : 'Confirmer la réservation',
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

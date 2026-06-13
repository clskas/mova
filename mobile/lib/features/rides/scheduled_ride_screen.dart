import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:latlong2/latlong.dart';
import '../../core/api/api_client.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/location/location_service.dart';
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
  LatLng _pickup = LatLng(MarketConfig.defaultLat, MarketConfig.defaultLng);
  LatLng? _dropoff;
  List<Map<String, dynamic>> _suggestions = [];
  int? _estimatedPrice;
  bool _loading = false;
  bool _loadingGps = false;
  bool _loadingSuggestions = false;
  bool _loadingUpcoming = true;
  bool _showSuggestions = false;
  List<Map<String, dynamic>> _upcoming = [];
  String? _error;
  String? _validationError;
  Timer? _debounce;

  DateTime get _maxDate => DateTime.now().add(const Duration(days: 7));

  String _formatDateTime(DateTime dt) {
    final day = dt.day.toString().padLeft(2, '0');
    final month = dt.month.toString().padLeft(2, '0');
    final hour = dt.hour.toString().padLeft(2, '0');
    final minute = dt.minute.toString().padLeft(2, '0');
    return '$day/$month/${dt.year} à $hour:$minute';
  }

  Map<String, dynamic> _ridePayload() => {
        'pickupLat': _pickup.latitude,
        'pickupLng': _pickup.longitude,
        'dropoffLat': _dropoff?.latitude ?? MarketConfig.defaultLat - 0.03,
        'dropoffLng': _dropoff?.longitude ?? MarketConfig.defaultLng + 0.04,
        'pickupAddress': 'Ma position, Kinshasa',
        'dropoffAddress': _destinationController.text.trim(),
        'vehicleType': MarketConfig.apiVehicleType(_vehicleType),
        'scheduledAt': _scheduledAt.toIso8601String(),
      };

  @override
  void initState() {
    super.initState();
    _destinationController.addListener(_onDestinationChanged);
    _loadUpcoming();
    _useMyLocation(silent: true);
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _destinationController.removeListener(_onDestinationChanged);
    _destinationController.dispose();
    super.dispose();
  }

  void _onDestinationChanged() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), _fetchSuggestions);
    setState(() {
      _estimatedPrice = null;
      _dropoff = null;
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
    _destinationController.text = label;
    _dropoff = LatLng(
      (suggestion['lat'] as num?)?.toDouble() ?? MarketConfig.defaultLat - 0.03,
      (suggestion['lng'] as num?)?.toDouble() ?? MarketConfig.defaultLng + 0.04,
    );
    setState(() {
      _showSuggestions = false;
      _suggestions = [];
      _estimatedPrice = null;
    });
  }

  Future<void> _useMyLocation({bool silent = false}) async {
    if (!silent) setState(() => _loadingGps = true);
    final result = await LocationService.getCurrentLocation();
    if (!mounted) return;
    setState(() {
      _loadingGps = false;
      if (result != null) {
        _pickup = result.position;
        _estimatedPrice = null;
      }
    });
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

  Future<void> _cancelScheduled(String id) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Annuler la réservation ?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Non')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Oui')),
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
    final result = await api.post('/rides/scheduled/estimate', {
      'dropoffAddress': _destinationController.text.trim(),
      'vehicleType': MarketConfig.apiVehicleType(_vehicleType),
      'scheduledAt': _scheduledAt.toIso8601String(),
    });
    setState(() {
      _loading = false;
      switch (result) {
        case Success(:final data):
          _estimatedPrice = (data['estimatedPriceCdf'] ?? data['estimatedFareCdf']) as int?;
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
              final id = map['id']?.toString() ?? '';
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
                      if (id.isNotEmpty && map['status']?.toString() != 'CANCELLED')
                        Align(
                          alignment: Alignment.centerRight,
                          child: TextButton.icon(
                            onPressed: _loading ? null : () => _cancelScheduled(id),
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
          Row(
            children: [
              Expanded(
                child: Text(
                  _loadingGps
                      ? 'Localisation…'
                      : 'Départ : ${_pickup.latitude.toStringAsFixed(4)}, ${_pickup.longitude.toStringAsFixed(4)}',
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

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_client.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import 'carpool_detail_screen.dart';
import 'carpool_join_confirmation_screen.dart';

class CarpoolScreen extends ConsumerStatefulWidget {
  const CarpoolScreen({super.key, this.forDriver = false, this.initialTabIndex});

  /// Mode chauffeur : onglets Publier + Mes trajets conducteur uniquement.
  final bool forDriver;
  final int? initialTabIndex;

  @override
  ConsumerState<CarpoolScreen> createState() => _CarpoolScreenState();
}

class _CarpoolScreenState extends ConsumerState<CarpoolScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  List<Map<String, dynamic>> _rides = [];
  List<Map<String, dynamic>> _myDriverTrips = [];
  List<Map<String, dynamic>> _myPassengerTrips = [];
  final _fromController = TextEditingController(text: 'Gombe, Kinshasa');
  final _toController = TextEditingController(text: 'Limete, Kinshasa');
  final _seatsController = TextEditingController(text: '3');
  final _priceController = TextEditingController();
  final _meetingPointController = TextEditingController();
  final _notesController = TextEditingController();
  DateTime _departureAt = DateTime.now().add(const Duration(hours: 3));
  DateTime _searchDate = DateTime.now();
  String _sortBy = 'departure';
  int? _pricePerSeat;
  int? _totalPrice;
  double? _distanceKm;
  bool _ladiesOnly = false;
  bool _instantBooking = true;
  bool _loading = false;
  bool _loadingList = true;
  bool _loadingMine = false;
  String? _error;
  String? _validationError;
  double? _fromLat;
  double? _fromLng;
  double? _toLat;
  double? _toLng;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(
      length: 2,
      vsync: this,
      initialIndex: widget.initialTabIndex?.clamp(0, 1) ?? 0,
    );
    if (!widget.forDriver) {
      _search();
    }
    _loadMyTrips();
  }

  @override
  void dispose() {
    _tabController.dispose();
    _fromController.dispose();
    _toController.dispose();
    _seatsController.dispose();
    _priceController.dispose();
    _meetingPointController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  String _formatDateTime(DateTime dt) {
    final day = dt.day.toString().padLeft(2, '0');
    final month = dt.month.toString().padLeft(2, '0');
    final hour = dt.hour.toString().padLeft(2, '0');
    final minute = dt.minute.toString().padLeft(2, '0');
    return '$day/$month/${dt.year} à $hour:$minute';
  }

  String _formatDate(DateTime dt) {
    final day = dt.day.toString().padLeft(2, '0');
    final month = dt.month.toString().padLeft(2, '0');
    return '$day/$month/${dt.year}';
  }

  Map<String, dynamic> _normalizeTrip(Map<String, dynamic> ride) {
    final seats = ride['seatsAvailable'] as int? ??
        ride['availableSeats'] as int? ??
        ride['seatsTotal'] as int? ??
        1;
    final perSeat = ride['pricePerSeatCdf'] as int? ??
        (ride['totalPriceCdf'] != null ? _splitPrice(ride['totalPriceCdf'] as int, seats) : null);
    final passengers = (ride['passengers'] as List? ?? []).cast<Map<String, dynamic>>();
    return {
      ...ride,
      'fromAddress': ride['pickupAddress'] ?? ride['fromAddress'] ?? '',
      'toAddress': ride['dropoffAddress'] ?? ride['toAddress'] ?? '',
      'availableSeats': seats,
      'pricePerSeatCdf': perSeat ?? 0,
      'driverName': ride['driverName']?.toString() ?? 'Conducteur',
      'passengerCount': ride['passengerCount'] as int? ?? passengers.length,
      'passengers': passengers,
    };
  }

  int _splitPrice(int total, int seats) {
    if (seats <= 0) return total;
    return (total / seats).ceil();
  }

  Future<void> _resolveRouteCoords() async {
    final api = ref.read(apiClientProvider);
    Future<void> resolve(String address, void Function(double lat, double lng) apply) async {
      final result = await api.geoAutocomplete(address.trim());
      if (result case Success(:final data)) {
        final raw = data['suggestions'] as List? ?? data['data'] as List? ?? [];
        if (raw.isNotEmpty) {
          final first = raw.first as Map<String, dynamic>;
          final lat = (first['lat'] as num?)?.toDouble();
          final lng = (first['lng'] as num?)?.toDouble();
          if (lat != null && lng != null) apply(lat, lng);
        }
      }
    }
    await resolve(_fromController.text, (lat, lng) {
      _fromLat = lat;
      _fromLng = lng;
    });
    await resolve(_toController.text, (lat, lng) {
      _toLat = lat;
      _toLng = lng;
    });
  }

  Map<String, dynamic> _routeCoordPayload() => {
        if (_fromLat != null && _fromLng != null) 'fromLat': _fromLat,
        if (_fromLat != null && _fromLng != null) 'fromLng': _fromLng,
        if (_toLat != null && _toLng != null) 'toLat': _toLat,
        if (_toLat != null && _toLng != null) 'toLng': _toLng,
      };

  Future<void> _search() async {
    if (_toController.text.trim().isEmpty) {
      setState(() => _validationError = 'Indiquez la destination.');
      return;
    }
    setState(() {
      _loading = true;
      _loadingList = true;
      _error = null;
      _validationError = null;
    });
    final api = ref.read(apiClientProvider);
    await _resolveRouteCoords();
    final dateStr = DateTime(_searchDate.year, _searchDate.month, _searchDate.day).toIso8601String();
    final result = await api.post('/carpool/search', {
      'fromAddress': _fromController.text.trim(),
      'toAddress': _toController.text.trim(),
      'date': dateStr,
      'sort': _sortBy,
      ..._routeCoordPayload(),
    });
    setState(() {
      _loading = false;
      _loadingList = false;
      switch (result) {
        case Success(:final data):
          final raw = data['data'] as List? ?? data['matches'] as List? ?? data['trips'] as List? ?? [];
          _rides = raw.cast<Map<String, dynamic>>().map(_normalizeTrip).toList();
        case Failure(:final error):
          _error = error.message;
      }
    });
  }

  Future<void> _loadMyTrips() async {
    setState(() => _loadingMine = true);
    final api = ref.read(apiClientProvider);
    final result = await api.get('/carpool/mine');
    setState(() {
      _loadingMine = false;
      if (result case Success(:final data)) {
        _myDriverTrips = (data['asDriver'] as List? ?? []).cast<Map<String, dynamic>>();
        _myPassengerTrips = (data['asPassenger'] as List? ?? [])
            .cast<Map<String, dynamic>>()
            .map((b) => _normalizeTrip(b['trip'] as Map<String, dynamic>? ?? b))
            .toList();
      }
    });
  }

  Future<void> _pickDeparture() async {
    final date = await showDatePicker(
      context: context,
      initialDate: _departureAt,
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 30)),
    );
    if (date == null || !mounted) return;
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(_departureAt),
    );
    if (time == null || !mounted) return;
    final combined = DateTime(date.year, date.month, date.day, time.hour, time.minute);
    if (combined.isBefore(DateTime.now())) return;
    setState(() {
      _departureAt = combined;
      _pricePerSeat = null;
      _totalPrice = null;
    });
  }

  Future<void> _pickSearchDate() async {
    final date = await showDatePicker(
      context: context,
      initialDate: _searchDate,
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 30)),
    );
    if (date != null && mounted) {
      setState(() => _searchDate = date);
      _search();
    }
  }

  Future<void> _estimateCreate() async {
    if (_toController.text.trim().isEmpty) {
      setState(() => _validationError = 'Indiquez la destination.');
      return;
    }
    final seats = int.tryParse(_seatsController.text.trim()) ?? 0;
    if (seats < 1 || seats > 6) {
      setState(() => _validationError = 'Nombre de places : entre 1 et 6.');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
      _validationError = null;
    });
    final api = ref.read(apiClientProvider);
    await _resolveRouteCoords();
    final result = await api.post('/carpool/estimate', {
      'fromAddress': _fromController.text.trim(),
      'toAddress': _toController.text.trim(),
      'seats': seats,
      ..._routeCoordPayload(),
    });
    setState(() {
      _loading = false;
      switch (result) {
        case Success(:final data):
          final fare = data['totalPriceCdf'] as int? ?? 15000;
          _totalPrice = fare;
          _distanceKm = (data['distanceKm'] as num?)?.toDouble();
          _pricePerSeat = data['pricePerSeatCdf'] as int? ?? _splitPrice(fare, seats);
          _priceController.text = _pricePerSeat.toString();
        case Failure(:final error):
          _error = error.message;
      }
    });
  }

  Future<void> _createRide() async {
    if (_toController.text.trim().isEmpty) {
      setState(() => _validationError = 'Indiquez la destination.');
      return;
    }
    final seats = int.tryParse(_seatsController.text.trim()) ?? 0;
    if (seats < 1 || seats > 6) {
      setState(() => _validationError = 'Nombre de places : entre 1 et 6.');
      return;
    }
    final customPrice = int.tryParse(_priceController.text.trim());
    final price = customPrice ?? _pricePerSeat;
    if (price == null || price < 500) {
      setState(() => _validationError = 'Indiquez un prix par place (min. 500 CDF).');
      return;
    }
    if (_departureAt.isBefore(DateTime.now())) {
      setState(() => _validationError = 'La date de départ doit être dans le futur.');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
      _validationError = null;
    });
    final api = ref.read(apiClientProvider);
    await _resolveRouteCoords();
    final result = await api.post('/carpool/rides', {
      'fromAddress': _fromController.text.trim(),
      'toAddress': _toController.text.trim(),
      'seats': seats,
      'departureAt': _departureAt.toIso8601String(),
      'pricePerSeatCdf': price,
      if (_meetingPointController.text.trim().isNotEmpty) 'meetingPoint': _meetingPointController.text.trim(),
      if (_notesController.text.trim().isNotEmpty) 'notes': _notesController.text.trim(),
      'ladiesOnly': _ladiesOnly,
      'instantBooking': _instantBooking,
      ..._routeCoordPayload(),
    });
    setState(() => _loading = false);
    switch (result) {
      case Success():
        if (mounted) {
          showDialog<void>(
            context: context,
            builder: (ctx) => AlertDialog(
              title: const Text('Trajet publié'),
              content: Text(
                'Votre covoiturage est en ligne.\n'
                'Départ : ${_formatDateTime(_departureAt)}\n'
                'Prix par place : ${MarketConfig.formatCdf(price)}',
              ),
              actions: [
                TextButton(
                  onPressed: () {
                    Navigator.pop(ctx);
                    _loadMyTrips();
                    _tabController.index = 1;
                  },
                  child: const Text('Voir mes trajets'),
                ),
              ],
            ),
          );
        }
      case Failure(:final error):
        setState(() => _error = error.message);
    }
  }

  Future<void> _bookRide(Map<String, dynamic> ride, {int seats = 1}) async {
    final id = ride['id']?.toString() ?? '';
    final driver = ride['driverName']?.toString() ?? 'Conducteur';
    final perSeat = ride['pricePerSeatCdf'] as int? ?? 0;
    setState(() {
      _loading = true;
      _error = null;
    });
    final api = ref.read(apiClientProvider);
    final result = await api.post('/carpool/$id/book', {'seats': seats});
    setState(() => _loading = false);
    switch (result) {
      case Success():
        if (mounted) {
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => CarpoolJoinConfirmationScreen(
                tripId: id,
                fromAddress: ride['fromAddress']?.toString() ?? '',
                toAddress: ride['toAddress']?.toString() ?? '',
                driverName: driver,
                pricePerSeatCdf: perSeat,
                departureAt: ride['departureAt']?.toString(),
              ),
            ),
          );
          _search();
          _loadMyTrips();
        }
      case Failure(:final error):
        setState(() => _error = error.message);
    }
  }

  void _openDetail(
    Map<String, dynamic> ride, {
    CarpoolViewerRole role = CarpoolViewerRole.guest,
  }) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => CarpoolDetailScreen(
          tripId: ride['id']?.toString() ?? '',
          initialTrip: ride,
          viewerRole: role,
        ),
      ),
    ).then((_) => _loadMyTrips());
  }

  Widget _rideCard(Map<String, dynamic> ride) {
    final perSeat = ride['pricePerSeatCdf'] as int? ?? 0;
    final seats = ride['availableSeats'] as int? ?? 1;
    final driver = ride['driverName']?.toString() ?? 'Conducteur';
    final rating = ride['driverRating']?.toString();
    final kyc = ride['kycVerified'] == true;
    final eta = ride['etaLabel']?.toString() ?? '';

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: MovaCard(
        onTap: () => _openDetail(ride),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Text(
                    '${ride['fromCity'] ?? ride['fromAddress']} → ${ride['toCity'] ?? ride['toAddress']}',
                    style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                const SizedBox(width: 8),
                Flexible(
                  child: Text(
                    MarketConfig.formatCdf(perSeat),
                    textAlign: TextAlign.end,
                    style: const TextStyle(fontWeight: FontWeight.bold, color: MovaColors.green, fontSize: 16),
                  ),
                ),
              ],
            ),
            if (eta.isNotEmpty)
              Text(eta, style: const TextStyle(color: MovaColors.textSecondary, fontSize: 12)),
            const SizedBox(height: 6),
            Row(
              children: [
                Expanded(
                  child: Text(
                    rating != null
                        ? '$driver · ★ $rating · $seats pl.'
                        : '$driver · $seats pl.',
                    style: const TextStyle(color: MovaColors.textSecondary, fontSize: 13),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                if (kyc)
                  const Icon(Icons.verified_user, size: 16, color: MovaColors.green),
              ],
            ),
            if (ride['departureAt'] != null)
              Text(
                'Départ : ${_formatDeparture(ride['departureAt']?.toString())}',
                style: const TextStyle(fontSize: 12, color: MovaColors.textSecondary),
              ),
            if (ride['ladiesOnly'] == true)
              const Padding(
                padding: EdgeInsets.only(top: 4),
                child: Text('Femmes uniquement', style: TextStyle(fontSize: 11, color: MovaColors.violet)),
              ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => _openDetail(ride),
                    child: const Text('Détails', overflow: TextOverflow.ellipsis),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: ElevatedButton(
                    onPressed: () => _bookRide(ride),
                    child: const Text('Réserver', overflow: TextOverflow.ellipsis),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  String _formatDeparture(String? raw) {
    if (raw == null || raw.isEmpty) return '';
    try {
      return _formatDateTime(DateTime.parse(raw));
    } catch (_) {
      return raw;
    }
  }

  Widget _searchTab() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            color: MovaColors.violet.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(8),
          ),
          child: const Row(
            children: [
              Icon(Icons.people_outline, size: 18, color: MovaColors.violet),
              SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Trajets planifiés partagés — pas une course VTC immédiate.',
                  style: TextStyle(fontSize: 12, color: MovaColors.violet),
                ),
              ),
            ],
          ),
        ),
        TextField(
          controller: _fromController,
          decoration: const InputDecoration(
            labelText: 'Ville de départ',
            prefixIcon: Icon(Icons.trip_origin),
            hintText: 'Ex: Kinshasa, Gombe',
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _toController,
          decoration: const InputDecoration(
            labelText: 'Ville de destination',
            hintText: 'Ex: Limete, Masina…',
            prefixIcon: Icon(Icons.place_outlined),
          ),
        ),
        const SizedBox(height: 12),
        MovaCard(
          onTap: _pickSearchDate,
          child: Row(
            children: [
              const Icon(Icons.calendar_today, color: MovaColors.violet, size: 20),
              const SizedBox(width: 12),
              Expanded(child: Text('Date : ${_formatDate(_searchDate)}')),
              const Icon(Icons.chevron_right),
            ],
          ),
        ),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
          value: _sortBy,
          isExpanded: true,
          decoration: const InputDecoration(labelText: 'Trier par'),
          items: const [
            DropdownMenuItem(value: 'departure', child: Text('Départ')),
            DropdownMenuItem(value: 'price', child: Text('Prix')),
            DropdownMenuItem(value: 'rating', child: Text('Note')),
          ],
          onChanged: (v) {
            if (v != null) {
              setState(() => _sortBy = v);
              _search();
            }
          },
        ),
        const SizedBox(height: 16),
        MovaButton(label: 'Rechercher', isLoading: _loading, icon: Icons.search, onPressed: _search),
        const SizedBox(height: 20),
        Text('${ _rides.length } trajet${_rides.length > 1 ? 's' : ''} trouvé${_rides.length > 1 ? 's' : ''}',
            style: Theme.of(context).textTheme.titleSmall),
        const SizedBox(height: 8),
        if (_loadingList)
          const Center(child: CircularProgressIndicator())
        else if (_rides.isEmpty)
          const Text(
            'Aucun trajet pour cette date. Essayez une autre destination ou publiez le vôtre.',
            style: TextStyle(color: MovaColors.textSecondary),
          )
        else
          ..._rides.map(_rideCard),
      ],
    );
  }

  Widget _createTab() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        MovaCard(
          onTap: _pickDeparture,
          child: Row(
            children: [
              const Icon(Icons.schedule, color: MovaColors.violet),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Date et heure', style: Theme.of(context).textTheme.titleSmall),
                    Text(_formatDateTime(_departureAt), style: const TextStyle(color: MovaColors.textSecondary)),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right),
            ],
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _fromController,
          decoration: const InputDecoration(labelText: 'Ville de départ', prefixIcon: Icon(Icons.trip_origin)),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _toController,
          decoration: const InputDecoration(labelText: 'Destination', prefixIcon: Icon(Icons.place_outlined)),
          onChanged: (_) => setState(() {
            _pricePerSeat = null;
            _totalPrice = null;
          }),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _meetingPointController,
          decoration: const InputDecoration(
            labelText: 'Point de rendez-vous (optionnel)',
            prefixIcon: Icon(Icons.location_on_outlined),
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _seatsController,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(labelText: 'Places disponibles (1-6)', prefixIcon: Icon(Icons.event_seat_outlined)),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _priceController,
          keyboardType: TextInputType.number,
          decoration: InputDecoration(
            labelText: 'Prix par place (CDF)',
            prefixIcon: const Icon(Icons.payments_outlined),
            helperText: _totalPrice != null ? 'Estimation totale : ${MarketConfig.formatCdf(_totalPrice!)}' : null,
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _notesController,
          decoration: const InputDecoration(
            labelText: 'Notes (ex: 2 bagages max)',
            prefixIcon: Icon(Icons.notes_outlined),
          ),
        ),
        const SizedBox(height: 8),
        SwitchListTile(
          title: const Text('Femmes uniquement'),
          value: _ladiesOnly,
          onChanged: (v) => setState(() => _ladiesOnly = v),
        ),
        SwitchListTile(
          title: const Text('Réservation instantanée'),
          subtitle: const Text('Les passagers peuvent réserver sans validation'),
          value: _instantBooking,
          onChanged: (v) => setState(() => _instantBooking = v),
        ),
        if (_distanceKm != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text('Distance estimée : ${_distanceKm!.toStringAsFixed(1)} km',
                style: const TextStyle(color: MovaColors.textSecondary, fontSize: 12)),
          ),
        if (_validationError != null) ...[
          const SizedBox(height: 8),
          MovaErrorBanner(message: _validationError!),
        ],
        if (_error != null) ...[
          const SizedBox(height: 8),
          MovaErrorBanner(message: _error!, onRetry: _estimateCreate),
        ],
        const SizedBox(height: 16),
        MovaButton(
          label: _priceController.text.isEmpty ? 'Estimer le prix' : 'Publier le trajet',
          isLoading: _loading,
          icon: _priceController.text.isEmpty ? Icons.calculate_outlined : Icons.publish_outlined,
          onPressed: _loading
              ? null
              : (_priceController.text.isEmpty ? _estimateCreate : _createRide),
        ),
      ],
    );
  }

  Widget _myTripsTab() {
    if (_loadingMine) return const Center(child: CircularProgressIndicator());
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (widget.forDriver) ...[
          Text('En tant que conducteur', style: Theme.of(context).textTheme.titleSmall),
          const SizedBox(height: 8),
          if (_myDriverTrips.isEmpty)
            const Text('Aucun trajet publié.', style: TextStyle(color: MovaColors.textSecondary))
          else
            ..._myDriverTrips.map((t) {
              final trip = _normalizeTrip(t);
              final step = trip['timelineStep']?.toString() ?? trip['status']?.toString() ?? '';
              return ListTile(
                title: Text(
                  '${trip['fromAddress']} → ${trip['toAddress']}',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                subtitle: Text(
                  '$step · ${trip['passengerCount']} passager(s)',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => _openDetail(trip, role: CarpoolViewerRole.driver),
              );
            }),
          const SizedBox(height: 20),
        ],
        Text(
          widget.forDriver ? 'Mes réservations passager' : 'Mes réservations',
          style: Theme.of(context).textTheme.titleSmall,
        ),
        const SizedBox(height: 8),
        if (_myPassengerTrips.isEmpty)
          const Text('Aucune réservation.', style: TextStyle(color: MovaColors.textSecondary))
        else
          ..._myPassengerTrips.map((t) {
            final trip = _normalizeTrip(t);
            final step = trip['timelineStep']?.toString() ?? trip['status']?.toString() ?? '';
            return ListTile(
              title: Text(
                '${trip['fromAddress']} → ${trip['toAddress']}',
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
              subtitle: Text(
                '${trip['driverName']} · ${MarketConfig.formatCdf(trip['pricePerSeatCdf'] as int? ?? 0)} · $step',
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => _openDetail(trip, role: CarpoolViewerRole.passenger),
            );
          }),
      ],
    );
  }

  Widget _scrollableTab(Widget child) {
    return MovaFlexScroll(child: child);
  }

  @override
  Widget build(BuildContext context) {
    final tabViews = widget.forDriver
        ? [
            _scrollableTab(_createTab()),
            _scrollableTab(_myTripsTab()),
          ]
        : [
            _scrollableTab(_searchTab()),
            _scrollableTab(_myTripsTab()),
          ];

    return MovaScreen(
      title: widget.forDriver ? 'Publier covoiturage' : 'Covoiturage',
      scrollable: false,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TabBar(
            controller: _tabController,
            isScrollable: true,
            tabAlignment: TabAlignment.start,
            labelColor: MovaColors.violet,
            unselectedLabelColor: MovaColors.textSecondary,
            tabs: widget.forDriver
                ? const [
                    Tab(text: 'Publier'),
                    Tab(text: 'Mes trajets'),
                  ]
                : const [
                    Tab(text: 'Rechercher'),
                    Tab(text: 'Mes réservations'),
                  ],
          ),
          const SizedBox(height: 8),
          Expanded(
            child: TabBarView(
              controller: _tabController,
              children: tabViews,
            ),
          ),
        ],
      ),
    );
  }
}

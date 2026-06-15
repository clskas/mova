import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_client.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import 'carpool_join_confirmation_screen.dart';

class CarpoolScreen extends ConsumerStatefulWidget {
  const CarpoolScreen({super.key});

  @override
  ConsumerState<CarpoolScreen> createState() => _CarpoolScreenState();
}

class _CarpoolScreenState extends ConsumerState<CarpoolScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  List<Map<String, dynamic>> _rides = [];
  final _fromController = TextEditingController(text: 'Ma position');
  final _toController = TextEditingController();
  final _seatsController = TextEditingController(text: '3');
  DateTime _departureAt = DateTime.now().add(const Duration(hours: 3));
  int? _pricePerSeat;
  int? _totalPrice;
  bool _loading = false;
  bool _loadingList = true;
  String? _error;
  String? _validationError;

  static const _pickupLat = MarketConfig.defaultLat;
  static const _pickupLng = MarketConfig.defaultLng;
  static const _dropoffLat = MarketConfig.defaultLat - 0.05;
  static const _dropoffLng = MarketConfig.defaultLng + 0.06;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _loadRides();
  }

  @override
  void dispose() {
    _tabController.dispose();
    _fromController.dispose();
    _toController.dispose();
    _seatsController.dispose();
    super.dispose();
  }

  String _formatDateTime(DateTime dt) {
    final day = dt.day.toString().padLeft(2, '0');
    final month = dt.month.toString().padLeft(2, '0');
    final hour = dt.hour.toString().padLeft(2, '0');
    final minute = dt.minute.toString().padLeft(2, '0');
    return '$day/$month/${dt.year} à $hour:$minute';
  }

  List<Map<String, dynamic>> _parseTrips(Map<String, dynamic> data) {
    final raw = data['matches'] as List? ??
        data['trips'] as List? ??
        data['data'] as List? ??
        [];
    return raw.cast<Map<String, dynamic>>();
  }

  Map<String, dynamic> _normalizeTrip(Map<String, dynamic> ride) {
    final seats = ride['seatsAvailable'] as int? ??
        ride['availableSeats'] as int? ??
        ride['seatsTotal'] as int? ??
        ride['seats'] as int? ??
        1;
    final perSeat = ride['pricePerSeatCdf'] as int? ??
        (ride['totalPriceCdf'] != null
            ? _splitPrice(ride['totalPriceCdf'] as int, seats)
            : null);
    final total = ride['totalPriceCdf'] as int? ??
        (perSeat != null ? perSeat * seats : 0);
    final passengers = (ride['passengers'] as List? ?? []).cast<Map<String, dynamic>>();
    return {
      ...ride,
      'fromAddress': ride['pickupAddress'] ?? ride['fromAddress'] ?? '',
      'toAddress': ride['dropoffAddress'] ?? ride['toAddress'] ?? '',
      'availableSeats': seats,
      'totalPriceCdf': total,
      'pricePerSeatCdf': perSeat ?? _splitPrice(total, seats),
      'driverName': ride['driverName']?.toString() ?? 'Conducteur',
      'passengerCount': ride['passengerCount'] as int? ?? passengers.length,
      'passengers': passengers,
      'departureAt': ride['departureAt']?.toString(),
    };
  }

  String _formatDeparture(String? raw) {
    if (raw == null || raw.isEmpty) return '';
    try {
      return _formatDateTime(DateTime.parse(raw));
    } catch (_) {
      return raw;
    }
  }

  Future<void> _loadRides() async {
    setState(() => _loadingList = true);
    final api = ref.read(apiClientProvider);
    await api.checkHealth();
    final result = await api.get(
      '/carpool?pickupLat=$_pickupLat&pickupLng=$_pickupLng'
      '&dropoffLat=$_dropoffLat&dropoffLng=$_dropoffLng',
    );
    setState(() {
      _loadingList = false;
      if (result case Success(:final data)) {
        _rides = _parseTrips(data).map(_normalizeTrip).toList();
      }
    });
  }

  int _splitPrice(int total, int seats) {
    if (seats <= 0) return total;
    return (total / seats).ceil();
  }

  Future<void> _search() async {
    if (_toController.text.trim().isEmpty) {
      setState(() => _validationError = 'Indiquez la destination.');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
      _validationError = null;
    });
    final api = ref.read(apiClientProvider);
    final result = await api.get(
      '/carpool?pickupLat=$_pickupLat&pickupLng=$_pickupLng'
      '&dropoffLat=$_dropoffLat&dropoffLng=$_dropoffLng',
    );
    setState(() {
      _loading = false;
      switch (result) {
        case Success(:final data):
          _rides = _parseTrips(data).map(_normalizeTrip).toList();
          _tabController.index = 0;
        case Failure(:final error):
          _error = error.message;
      }
    });
  }

  Future<void> _pickDeparture() async {
    final date = await showDatePicker(
      context: context,
      initialDate: _departureAt,
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 7)),
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
    final result = await api.post('/carpool/estimate', {
      'fromAddress': _fromController.text.trim(),
      'toAddress': _toController.text.trim(),
      'seats': seats,
    });
    setState(() {
      _loading = false;
      switch (result) {
        case Success(:final data):
          final fare = data['totalPriceCdf'] as int? ??
              (data['estimatedFareCdf'] ?? data['estimatedPriceCdf']) as int? ??
              15000;
          _totalPrice = fare;
          _pricePerSeat = data['pricePerSeatCdf'] as int? ?? _splitPrice(fare, seats);
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
    if (_pricePerSeat == null || _pricePerSeat! < 500) {
      setState(() => _validationError = 'Estimez le prix avant de publier.');
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
    final result = await api.post('/carpool', {
      'departureAt': _departureAt.toIso8601String(),
      'pickupLat': _pickupLat,
      'pickupLng': _pickupLng,
      'pickupAddress': _fromController.text.trim(),
      'dropoffLat': _dropoffLat,
      'dropoffLng': _dropoffLng,
      'dropoffAddress': _toController.text.trim(),
      'seatsTotal': seats,
      'pricePerSeatCdf': _pricePerSeat,
    });
    setState(() => _loading = false);
    switch (result) {
      case Success(:final data):
        if (mounted) {
          final trip = data['trip'] as Map<String, dynamic>? ??
              data['ride'] as Map<String, dynamic>?;
          showDialog<void>(
            context: context,
            builder: (ctx) => AlertDialog(
              title: const Text('Trajet publié'),
              content: Text(
                'Votre covoiturage est en ligne.\n'
                'Départ : ${_formatDateTime(_departureAt)}\n'
                'Prix par passager : ${MarketConfig.formatCdf(_pricePerSeat ?? 0)}\n'
                'Réf. : ${trip?['id'] ?? ''}',
                maxLines: 6,
                overflow: TextOverflow.ellipsis,
              ),
              actions: [
                TextButton(
                  onPressed: () {
                    Navigator.pop(ctx);
                    _loadRides();
                    _tabController.index = 0;
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

  Future<void> _joinRide(Map<String, dynamic> ride) async {
    final id = ride['id']?.toString() ?? '';
    final driver = ride['driverName']?.toString() ?? 'Conducteur';
    final perSeat = ride['pricePerSeatCdf'] as int? ?? 0;
    setState(() {
      _loading = true;
      _error = null;
    });
    final api = ref.read(apiClientProvider);
    final result = await api.post('/carpool/$id/join', {'seats': 1});
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
          _loadRides();
        }
      case Failure(:final error):
        setState(() => _error = error.message);
    }
  }

  Widget _rideCard(Map<String, dynamic> ride) {
    final total = ride['totalPriceCdf'] as int? ?? 0;
    final seats = ride['availableSeats'] as int? ?? 1;
    final perSeat = ride['pricePerSeatCdf'] as int? ?? _splitPrice(total, seats);
    final driver = ride['driverName']?.toString() ?? 'Conducteur';
    final id = ride['id']?.toString() ?? '';
    final passengerCount = ride['passengerCount'] as int? ?? 0;

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: MovaCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '${ride['fromAddress']} → ${ride['toAddress']}',
              style: const TextStyle(fontWeight: FontWeight.w600),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 4),
            Text(
              '$driver · $seats place${seats > 1 ? 's' : ''}'
              '${passengerCount > 0 ? ' · $passengerCount passager${passengerCount > 1 ? 's' : ''}' : ''}',
              style: const TextStyle(color: MovaColors.textSecondary, fontSize: 13),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            if (ride['departureAt'] != null)
              Text(
                'Départ : ${_formatDeparture(ride['departureAt']?.toString())}',
                style: const TextStyle(color: MovaColors.textSecondary, fontSize: 12),
              ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '${MarketConfig.formatCdf(perSeat)} / pers.',
                        style: const TextStyle(
                          fontWeight: FontWeight.bold,
                          color: MovaColors.green,
                        ),
                      ),
                    ],
                  ),
                ),
                ElevatedButton(
                  onPressed: id.isEmpty ? null : () => _joinRide(ride),
                  child: const Text('Rejoindre'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _searchTab() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: _fromController,
          decoration: const InputDecoration(
            labelText: 'Départ',
            prefixIcon: Icon(Icons.trip_origin),
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _toController,
          decoration: const InputDecoration(
            labelText: 'Destination',
            hintText: 'Ex: Limete, Masina…',
            prefixIcon: Icon(Icons.place_outlined),
          ),
        ),
        const SizedBox(height: 16),
        MovaButton(
          label: 'Rechercher',
          isLoading: _loading,
          icon: Icons.search,
          onPressed: _search,
        ),
        const SizedBox(height: 20),
        Text('Trajets disponibles', style: Theme.of(context).textTheme.titleSmall),
        const SizedBox(height: 8),
        if (_loadingList)
          const Center(child: CircularProgressIndicator())
        else if (_rides.isEmpty)
          const Text(
            'Aucun trajet trouvé. Essayez une autre destination.',
            style: TextStyle(color: MovaColors.textSecondary),
          )
        else
          ..._rides.map(_rideCard),
      ],
    );
  }

  Widget _createTab() {
    final seats = int.tryParse(_seatsController.text.trim()) ?? 3;

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
                    Text('Date et heure de départ', style: Theme.of(context).textTheme.titleSmall),
                    Text(
                      _formatDateTime(_departureAt),
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
        TextField(
          controller: _fromController,
          decoration: const InputDecoration(
            labelText: 'Départ',
            prefixIcon: Icon(Icons.trip_origin),
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _toController,
          decoration: const InputDecoration(
            labelText: 'Destination',
            prefixIcon: Icon(Icons.place_outlined),
          ),
          onChanged: (_) => setState(() {
            _pricePerSeat = null;
            _totalPrice = null;
          }),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _seatsController,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(
            labelText: 'Places disponibles',
            prefixIcon: Icon(Icons.event_seat_outlined),
          ),
          onChanged: (_) => setState(() {
            if (_totalPrice != null) {
              _pricePerSeat = _splitPrice(_totalPrice!, int.tryParse(_seatsController.text.trim()) ?? 3);
            }
          }),
        ),
        if (_pricePerSeat != null) ...[
          const SizedBox(height: 16),
          MovaCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (_totalPrice != null)
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('Prix total estimé'),
                      Text(
                        MarketConfig.formatCdf(_totalPrice!),
                        style: const TextStyle(fontWeight: FontWeight.bold),
                      ),
                    ],
                  ),
                const Divider(height: 16),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('Part par passager ($seats)'),
                    Text(
                      MarketConfig.formatCdf(_pricePerSeat!),
                      style: const TextStyle(
                        fontWeight: FontWeight.bold,
                        color: MovaColors.green,
                        fontSize: 18,
                      ),
                    ),
                  ],
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
          MovaErrorBanner(message: _error!, onRetry: _estimateCreate),
        ],
        const SizedBox(height: 24),
        MovaButton(
          label: _pricePerSeat == null ? 'Estimer le prix' : 'Publier le trajet',
          isLoading: _loading,
          icon: _pricePerSeat == null ? Icons.calculate_outlined : Icons.publish_outlined,
          onPressed: _loading
              ? null
              : (_pricePerSeat == null ? _estimateCreate : _createRide),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return MovaScreen(
      title: 'Covoiturage',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TabBar(
            controller: _tabController,
            onTap: (_) => setState(() {}),
            labelColor: MovaColors.violet,
            unselectedLabelColor: MovaColors.textSecondary,
            tabs: const [
              Tab(text: 'Rechercher'),
              Tab(text: 'Proposer'),
            ],
          ),
          const SizedBox(height: 16),
          AnimatedBuilder(
            animation: _tabController,
            builder: (context, _) =>
                _tabController.index == 0 ? _searchTab() : _createTab(),
          ),
        ],
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_client.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';

class CarpoolScreen extends ConsumerStatefulWidget {
  const CarpoolScreen({super.key});

  @override
  ConsumerState<CarpoolScreen> createState() => _CarpoolScreenState();
}

class _CarpoolScreenState extends ConsumerState<CarpoolScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  List<Map<String, dynamic>> _rides = [];
  final _fromController = TextEditingController(text: 'Gombe, Kinshasa');
  final _toController = TextEditingController();
  final _seatsController = TextEditingController(text: '3');
  int? _totalPrice;
  bool _loading = false;
  bool _loadingList = true;
  String? _error;

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

  Future<void> _loadRides() async {
    final api = ref.read(apiClientProvider);
    await api.loadToken();
    await api.checkHealth();
    final result = await api.get('/carpool/rides');
    setState(() {
      _loadingList = false;
      if (result case Success(:final data)) {
        _rides = (data['data'] as List? ?? []).cast<Map<String, dynamic>>();
      }
    });
  }

  int _splitPrice(int total, int seats) {
    if (seats <= 0) return total;
    return (total / seats).ceil();
  }

  Future<void> _search() async {
    if (_toController.text.trim().isEmpty) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    final api = ref.read(apiClientProvider);
    final result = await api.post('/carpool/search', {
      'fromAddress': _fromController.text.trim(),
      'toAddress': _toController.text.trim(),
    });
    setState(() {
      _loading = false;
      switch (result) {
        case Success(:final data):
          _rides = (data['data'] as List? ?? []).cast<Map<String, dynamic>>();
          _tabController.index = 0;
        case Failure(:final error):
          _error = error.message;
      }
    });
  }

  Future<void> _estimateCreate() async {
    if (_toController.text.trim().isEmpty) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    final seats = int.tryParse(_seatsController.text.trim()) ?? 3;
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
          _totalPrice = data['totalPriceCdf'] as int?;
        case Failure(:final error):
          _error = error.message;
      }
    });
  }

  Future<void> _createRide() async {
    final seats = int.tryParse(_seatsController.text.trim()) ?? 3;
    setState(() {
      _loading = true;
      _error = null;
    });
    final api = ref.read(apiClientProvider);
    final result = await api.post('/carpool/rides', {
      'fromAddress': _fromController.text.trim(),
      'toAddress': _toController.text.trim(),
      'seats': seats,
      'totalPriceCdf': _totalPrice,
    });
    setState(() => _loading = false);
    switch (result) {
      case Success(:final data):
        if (mounted) {
          final ride = data['ride'] as Map<String, dynamic>?;
          final perSeat = _splitPrice(_totalPrice ?? 0, seats);
          showDialog<void>(
            context: context,
            builder: (ctx) => AlertDialog(
              title: const Text('Trajet publié'),
              content: Text(
                'Votre covoiturage est en ligne.\n'
                'Prix total : ${MarketConfig.formatCdf(_totalPrice ?? 0)}\n'
                'Par passager ($seats places) : ${MarketConfig.formatCdf(perSeat)}\n'
                'Réf. : ${ride?['id'] ?? ''}',
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

  Widget _rideCard(Map<String, dynamic> ride) {
    final total = ride['totalPriceCdf'] as int? ?? 0;
    final seats = ride['availableSeats'] as int? ?? ride['seats'] as int? ?? 1;
    final perSeat = _splitPrice(total, seats);
    final driver = ride['driverName']?.toString() ?? 'Conducteur';

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
              '$driver · $seats place${seats > 1 ? 's' : ''}',
              style: const TextStyle(color: MovaColors.textSecondary, fontSize: 13),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Total ${MarketConfig.formatCdf(total)}',
                        style: const TextStyle(fontSize: 12, color: MovaColors.textSecondary),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      Text(
                        '${MarketConfig.formatCdf(perSeat)} / pers.',
                        style: const TextStyle(
                          fontWeight: FontWeight.bold,
                          color: MovaColors.green,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                ElevatedButton(
                  onPressed: () {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text('Demande envoyée à $driver')),
                    );
                  },
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
          const Text('Aucun trajet trouvé', style: TextStyle(color: MovaColors.textSecondary))
        else
          ..._rides.map(_rideCard),
      ],
    );
  }

  Widget _createTab() {
    final seats = int.tryParse(_seatsController.text.trim()) ?? 3;
    final perSeat = _totalPrice != null ? _splitPrice(_totalPrice!, seats) : null;

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
            prefixIcon: Icon(Icons.place_outlined),
          ),
          onChanged: (_) => setState(() => _totalPrice = null),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _seatsController,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(
            labelText: 'Places disponibles',
            prefixIcon: Icon(Icons.event_seat_outlined),
          ),
          onChanged: (_) => setState(() {}),
        ),
        if (_totalPrice != null) ...[
          const SizedBox(height: 16),
          MovaCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
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
                      MarketConfig.formatCdf(perSeat!),
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
        if (_error != null) ...[
          const SizedBox(height: 16),
          MovaErrorBanner(message: _error!, onRetry: _estimateCreate),
        ],
        const SizedBox(height: 24),
        MovaButton(
          label: _totalPrice == null ? 'Estimer le prix' : 'Publier le trajet',
          isLoading: _loading,
          icon: _totalPrice == null ? Icons.calculate_outlined : Icons.publish_outlined,
          onPressed: _totalPrice == null ? _estimateCreate : _createRide,
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

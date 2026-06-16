import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/api/api_client.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import 'rental_booking_detail_screen.dart';
import 'rental_detail_screen.dart';

enum _RentalStep { search, compare }

class RentalScreen extends ConsumerStatefulWidget {
  const RentalScreen({super.key});

  @override
  ConsumerState<RentalScreen> createState() => _RentalScreenState();
}

class _RentalScreenState extends ConsumerState<RentalScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  _RentalStep _step = _RentalStep.search;
  List<Map<String, dynamic>> _vehicles = [];
  List<Map<String, dynamic>> _myRentals = [];
  final Set<String> _compareIds = {};
  String _category = '';
  String _transmission = '';
  String _sortBy = 'price_asc';
  String _city = 'Kinshasa';
  int? _minPrice;
  int? _maxPrice;
  DateTime _startDate = DateTime.now().add(const Duration(days: 1));
  DateTime _endDate = DateTime.now().add(const Duration(days: 3));
  bool _loading = false;
  bool _loadingList = true;
  String? _error;

  static const _categories = [
    ('', 'Toutes'),
    ('ECONOMY', 'Économique'),
    ('SUV', 'SUV'),
    ('PREMIUM', 'Premium'),
  ];

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _search();
    _loadMyRentals();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  String _formatDate(DateTime dt) =>
      '${dt.day.toString().padLeft(2, '0')}/${dt.month.toString().padLeft(2, '0')}/${dt.year}';

  List<Map<String, dynamic>> _parseVehicles(Map<String, dynamic> data) {
    final raw = data['data'] ?? data['vehicles'];
    if (raw is List) {
      return raw.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
    }
    return [];
  }

  Future<void> _search() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final params = <String, String>{
      if (_city.isNotEmpty) 'city': _city,
      if (_category.isNotEmpty) 'category': _category,
      if (_transmission.isNotEmpty) 'transmission': _transmission,
      if (_sortBy.isNotEmpty) 'sort': _sortBy,
      if (_minPrice != null) 'minPrice': '$_minPrice',
      if (_maxPrice != null) 'maxPrice': '$_maxPrice',
    };
    final query = params.entries.map((e) => '${e.key}=${Uri.encodeComponent(e.value)}').join('&');
    final api = ref.read(apiClientProvider);
    await api.checkHealth();
    final result = await api.get('/rental/vehicles${query.isNotEmpty ? '?$query' : ''}');
    if (!mounted) return;
    setState(() {
      _loading = false;
      switch (result) {
        case Success(:final data):
          _vehicles = _parseVehicles(data);
        case Failure(:final error):
          _error = error.message;
      }
    });
  }

  Future<void> _loadMyRentals() async {
    setState(() => _loadingList = true);
    final api = ref.read(apiClientProvider);
    final result = await api.get('/rental/bookings');
    if (!mounted) return;
    setState(() {
      _loadingList = false;
      if (result case Success(:final data)) {
        _myRentals = (data['data'] as List? ?? data['bookings'] as List? ?? []).cast<Map<String, dynamic>>();
      }
    });
  }

  Future<void> _openBooking(Map<String, dynamic> booking) async {
    final id = booking['id']?.toString() ?? '';
    final refreshed = await Navigator.push<bool>(
      context,
      MaterialPageRoute(
        builder: (_) => RentalBookingDetailScreen(
          bookingId: id,
          initialBooking: booking,
        ),
      ),
    );
    if (refreshed == true) _loadMyRentals();
  }

  Future<void> _callOwner(String? phone) async {
    if (phone == null || phone.isEmpty) return;
    final uri = Uri.parse('tel:$phone');
    if (await canLaunchUrl(uri)) await launchUrl(uri);
  }

  Future<void> _pickDate({required bool isStart}) async {
    final date = await showDatePicker(
      context: context,
      initialDate: isStart ? _startDate : _endDate,
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 90)),
    );
    if (date == null || !mounted) return;
    setState(() {
      if (isStart) {
        _startDate = date;
        if (!_endDate.isAfter(_startDate)) _endDate = _startDate.add(const Duration(days: 1));
      } else {
        _endDate = date;
      }
    });
  }

  void _toggleCompare(String id) {
    setState(() {
      if (_compareIds.contains(id)) {
        _compareIds.remove(id);
      } else if (_compareIds.length < 3) {
        _compareIds.add(id);
      }
    });
  }

  Future<void> _openDetail(Map<String, dynamic> vehicle) async {
    final refreshed = await Navigator.push<bool>(
      context,
      MaterialPageRoute(
        builder: (_) => RentalDetailScreen(
          vehicleId: vehicle['id']?.toString() ?? '',
          initialVehicle: vehicle,
          startDate: _startDate,
          endDate: _endDate,
          pickupCity: _city,
          returnCity: _city,
        ),
      ),
    );
    if (refreshed == true) _loadMyRentals();
  }

  Widget _vehicleCard(Map<String, dynamic> v) {
    final id = v['id']?.toString() ?? '';
    final selected = _compareIds.contains(id);
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: MovaCard(
        onTap: () => _openDetail(v),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: Image.network(
                v['imageUrl']?.toString() ?? '',
                width: 88,
                height: 66,
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => Container(
                  width: 88,
                  height: 66,
                  color: MovaColors.violet.withValues(alpha: 0.12),
                  child: const Icon(Icons.directions_car, color: MovaColors.violet),
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(v['name']?.toString() ?? 'Véhicule', style: const TextStyle(fontWeight: FontWeight.w600)),
                  Text(
                    '${v['categoryLabel'] ?? v['category']} · ${v['make'] ?? ''} ${v['model'] ?? ''}',
                    style: const TextStyle(fontSize: 12, color: MovaColors.textSecondary),
                  ),
                  Row(
                    children: [
                      if (v['rating'] != null) ...[
                        const Icon(Icons.star, size: 14, color: Colors.amber),
                        Text(' ${v['rating']}  ', style: const TextStyle(fontSize: 12)),
                      ],
                      Text(
                        MarketConfig.formatCdf(v['dailyRateCdf'] as int? ?? 0),
                        style: const TextStyle(color: MovaColors.green, fontWeight: FontWeight.w600, fontSize: 13),
                      ),
                      const Text('/j', style: TextStyle(fontSize: 12)),
                    ],
                  ),
                  if (v['ownerBadge'] != null)
                    Text(v['ownerBadge'].toString(), style: const TextStyle(fontSize: 11, color: MovaColors.violet)),
                ],
              ),
            ),
            IconButton(
              icon: Icon(selected ? Icons.check_box : Icons.check_box_outline_blank, color: MovaColors.violet),
              onPressed: () => _toggleCompare(id),
              tooltip: 'Comparer',
            ),
          ],
        ),
      ),
    );
  }

  Widget _compareTable() {
    final compared = _vehicles.where((v) => _compareIds.contains(v['id']?.toString())).toList();
    if (compared.isEmpty) {
      return const Padding(
        padding: EdgeInsets.all(24),
        child: Text('Sélectionnez jusqu\'à 3 véhicules pour comparer.', textAlign: TextAlign.center),
      );
    }
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: DataTable(
        columns: [
          const DataColumn(label: Text('Critère')),
          ...compared.map((v) => DataColumn(label: Text(v['name']?.toString() ?? '', overflow: TextOverflow.ellipsis))),
        ],
        rows: [
          _compareRow('Prix/jour', compared.map((v) => MarketConfig.formatCdf(v['dailyRateCdf'] as int? ?? 0)).toList()),
          _compareRow('Catégorie', compared.map((v) => v['categoryLabel']?.toString() ?? v['category']?.toString() ?? '').toList()),
          _compareRow('Transmission', compared.map((v) => v['transmissionLabel']?.toString() ?? v['transmission']?.toString() ?? '').toList()),
          _compareRow('Note', compared.map((v) => v['rating']?.toString() ?? '—').toList()),
          _compareRow('Places', compared.map((v) => v['seats']?.toString() ?? '').toList()),
        ],
      ),
    );
  }

  DataRow _compareRow(String label, List<String> values) {
    return DataRow(cells: [DataCell(Text(label)), ...values.map((v) => DataCell(Text(v)))]);
  }

  Widget _timeline(List<dynamic>? timeline) {
    if (timeline == null || timeline.isEmpty) return const SizedBox.shrink();
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: timeline.map<Widget>((step) {
        final m = step as Map<String, dynamic>;
        final done = m['completed'] == true;
        final current = m['current'] == true;
        return Expanded(
          child: Column(
            children: [
              Icon(
                done ? Icons.check_circle : Icons.radio_button_unchecked,
                size: 18,
                color: current ? MovaColors.violet : (done ? MovaColors.green : MovaColors.textSecondary),
              ),
              Text(
                m['label']?.toString() ?? '',
                style: TextStyle(fontSize: 10, color: current ? MovaColors.violet : MovaColors.textSecondary),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        );
      }).toList(),
    );
  }

  Widget _searchTab(ThemeData theme) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (_step == _RentalStep.search) ...[
          Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: MovaColors.violet.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Row(
              children: [
                Icon(Icons.info_outline, size: 18, color: MovaColors.violet),
                SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Louez un véhicule pour plusieurs jours. Pour un trajet immédiat, utilisez « Commander une course ».',
                    style: TextStyle(fontSize: 12, color: MovaColors.violet),
                  ),
                ),
              ],
            ),
          ),
          Text(
            'Louez un véhicule à la journée ou à la semaine.',
            style: theme.textTheme.bodyMedium?.copyWith(color: MovaColors.textSecondary),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: MovaCard(
                  onTap: () => _pickDate(isStart: true),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Prise en charge', style: theme.textTheme.labelMedium),
                      Text(_formatDate(_startDate)),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: MovaCard(
                  onTap: () => _pickDate(isStart: false),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Retour', style: theme.textTheme.labelMedium),
                      Text(_formatDate(_endDate)),
                    ],
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            value: _city,
            decoration: const InputDecoration(labelText: 'Ville', isDense: true),
            items: ['Kinshasa', 'Lubumbashi', 'Goma', 'Matadi']
                .map((c) => DropdownMenuItem(value: c, child: Text(c)))
                .toList(),
            onChanged: (v) => setState(() => _city = v ?? _city),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            children: _categories.map((c) {
              final selected = _category == c.$1;
              return FilterChip(
                label: Text(c.$2),
                selected: selected,
                onSelected: (_) => setState(() => _category = c.$1),
              );
            }).toList(),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: DropdownButtonFormField<String>(
                  value: _transmission.isEmpty ? null : _transmission,
                  decoration: const InputDecoration(labelText: 'Transmission', isDense: true),
                  items: const [
                    DropdownMenuItem(value: '', child: Text('Toutes')),
                    DropdownMenuItem(value: 'AUTO', child: Text('Automatique')),
                    DropdownMenuItem(value: 'MANUAL', child: Text('Manuelle')),
                  ],
                  onChanged: (v) => setState(() => _transmission = v ?? ''),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: DropdownButtonFormField<String>(
                  value: _sortBy,
                  decoration: const InputDecoration(labelText: 'Tri', isDense: true),
                  items: const [
                    DropdownMenuItem(value: 'price_asc', child: Text('Prix ↑')),
                    DropdownMenuItem(value: 'price_desc', child: Text('Prix ↓')),
                    DropdownMenuItem(value: 'rating', child: Text('Note')),
                    DropdownMenuItem(value: 'category', child: Text('Catégorie')),
                  ],
                  onChanged: (v) => setState(() => _sortBy = v ?? 'price_asc'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: MovaButton(
                  label: 'Rechercher',
                  icon: Icons.search,
                  isLoading: _loading,
                  onPressed: _loading ? null : _search,
                ),
              ),
              if (_compareIds.isNotEmpty) ...[
                const SizedBox(width: 8),
                MovaButton(
                  label: 'Comparer (${_compareIds.length})',
                  isSecondary: true,
                  onPressed: () => setState(() => _step = _RentalStep.compare),
                ),
              ],
            ],
          ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            MovaErrorBanner(message: _error!, onRetry: _search),
          ],
          const SizedBox(height: 16),
          if (_loading)
            const Center(child: CircularProgressIndicator())
          else if (_vehicles.isEmpty)
            const Text('Aucun véhicule disponible.', style: TextStyle(color: MovaColors.textSecondary))
          else
            ..._vehicles.map(_vehicleCard),
        ] else ...[
          Row(
            children: [
              IconButton(
                icon: const Icon(Icons.arrow_back),
                onPressed: () => setState(() => _step = _RentalStep.search),
              ),
              Text('Comparaison', style: theme.textTheme.titleMedium),
            ],
          ),
          _compareTable(),
          const SizedBox(height: 16),
          ..._vehicles
              .where((v) => _compareIds.contains(v['id']?.toString()))
              .map((v) => MovaButton(
                    label: 'Réserver ${v['name']}',
                    isSecondary: true,
                    onPressed: () => _openDetail(v),
                  )),
        ],
      ],
    );
  }

  Widget _myRentalsTab(ThemeData theme) {
    if (_loadingList) return const Center(child: CircularProgressIndicator());
    if (_myRentals.isEmpty) {
      return const Center(child: Text('Aucune location en cours.', style: TextStyle(color: MovaColors.textSecondary)));
    }
    return ListView.builder(
      itemCount: _myRentals.length,
      itemBuilder: (_, i) {
        final inq = _myRentals[i];
        final vehicle = inq['vehicle'] as Map<String, dynamic>?;
        return Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: MovaCard(
            onTap: () => _openBooking(inq),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  vehicle?['name']?.toString() ?? inq['vehicleType']?.toString() ?? 'Location',
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
                Text(
                  '${_formatDate(DateTime.parse(inq['startDate']?.toString() ?? DateTime.now().toIso8601String()))} → '
                  '${_formatDate(DateTime.parse(inq['endDate']?.toString() ?? DateTime.now().toIso8601String()))}',
                  style: const TextStyle(color: MovaColors.textSecondary, fontSize: 13),
                ),
                if (inq['totalCdf'] != null || inq['estimatedPriceCdf'] != null)
                  Text(
                    MarketConfig.formatCdf(inq['totalCdf'] as int? ?? inq['estimatedPriceCdf'] as int? ?? 0),
                    style: const TextStyle(color: MovaColors.green, fontWeight: FontWeight.w600),
                  ),
                const SizedBox(height: 8),
                _timeline(inq['timeline'] as List?),
                if (inq['ownerContactPhone'] != null) ...[
                  const SizedBox(height: 8),
                  InkWell(
                    onTap: () => _callOwner(inq['ownerContactPhone']?.toString()),
                    child: Row(
                      children: [
                        const Icon(Icons.phone_outlined, size: 16, color: MovaColors.violet),
                        const SizedBox(width: 4),
                        Text('Propriétaire : ${inq['ownerContactPhone']}'),
                      ],
                    ),
                  ),
                ],
              ],
            ),
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return MovaScreen(
      title: 'Location véhicule',
      child: Column(
        children: [
          TabBar(
            controller: _tabController,
            labelColor: MovaColors.violet,
            tabs: const [
              Tab(text: 'Rechercher'),
              Tab(text: 'Mes locations'),
            ],
          ),
          Expanded(
            child: TabBarView(
              controller: _tabController,
              children: [
                SingleChildScrollView(child: _searchTab(theme)),
                _myRentalsTab(theme),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

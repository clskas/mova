import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/api/api_client.dart';
import '../../core/config/market_config.dart';
import '../../core/location/service_area_prefs.dart';
import '../../core/location/service_areas.dart';
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
  String _fuel = '';
  String _sortBy = 'price_asc';
  String _city = 'Kinshasa';
  final _minPriceController = TextEditingController();
  final _maxPriceController = TextEditingController();
  DateTime _startDate = DateTime.now().add(const Duration(days: 1));
  DateTime _endDate = DateTime.now().add(const Duration(days: 3));
  bool _loading = false;
  bool _loadingList = true;
  String? _error;
  Timer? _rentalsPollTimer;

  static const _categories = [
    ('', 'Toutes'),
    ('ECONOMY', 'Citadine'),
    ('SUV', 'SUV'),
    ('VAN', 'Utilitaire'),
    ('PREMIUM', 'Premium'),
  ];

  static const _fuelOptions = [
    ('', 'Tous carburants'),
    ('ESSENCE', 'Essence'),
    ('DIESEL', 'Diesel'),
    ('ELECTRIC', 'Électrique'),
  ];

  @override
  void initState() {
    super.initState();
    _city = ref.read(selectedServiceAreaProvider).name;
    _tabController = TabController(length: 2, vsync: this);
    _tabController.addListener(_onTabChanged);
    _search();
    _loadMyRentals();
  }

  void _onTabChanged() {
    if (_tabController.index == 1) {
      _loadMyRentals(silent: true);
      _startRentalsPolling();
    } else {
      _stopRentalsPolling();
    }
  }

  void _startRentalsPolling() {
    _rentalsPollTimer?.cancel();
    _rentalsPollTimer = Timer.periodic(const Duration(seconds: 10), (_) {
      if (_tabController.index == 1) _loadMyRentals(silent: true);
    });
  }

  void _stopRentalsPolling() {
    _rentalsPollTimer?.cancel();
  }

  @override
  void dispose() {
    _stopRentalsPolling();
    _tabController.removeListener(_onTabChanged);
    _tabController.dispose();
    _minPriceController.dispose();
    _maxPriceController.dispose();
    super.dispose();
  }

  bool _matchesFuel(Map<String, dynamic> v) {
    if (_fuel.isEmpty) return true;
    final features = (v['features'] as List?)?.map((e) => e.toString().toLowerCase()).join(' ') ?? '';
    return switch (_fuel) {
      'ESSENCE' => features.contains('essence'),
      'DIESEL' => features.contains('diesel'),
      'ELECTRIC' => features.contains('électr') || features.contains('electr'),
      _ => true,
    };
  }

  int? _parsePrice(String raw) {
    final n = int.tryParse(raw.replaceAll(RegExp(r'[^0-9]'), ''));
    return n != null && n > 0 ? n : null;
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
    final minPrice = _parsePrice(_minPriceController.text);
    final maxPrice = _parsePrice(_maxPriceController.text);
    final params = <String, String>{
      if (_city.isNotEmpty) 'city': _city,
      if (_category.isNotEmpty) 'category': _category,
      if (_transmission.isNotEmpty) 'transmission': _transmission,
      if (_sortBy.isNotEmpty) 'sort': _sortBy,
      if (minPrice != null) 'minPrice': '$minPrice',
      if (maxPrice != null) 'maxPrice': '$maxPrice',
    };
    final query = params.entries.map((e) => '${e.key}=${Uri.encodeComponent(e.value)}').join('&');
    final api = ref.read(apiClientProvider);
    await api.loadToken();
    await api.checkHealth();
    final result = await api.get(
      '/rental/vehicles${query.isNotEmpty ? '?$query' : ''}',
      skipCache: true,
    );
    if (!mounted) return;
    setState(() {
      _loading = false;
      switch (result) {
        case Success(:final data):
          _vehicles = _parseVehicles(data).where(_matchesFuel).toList();
          _error = null;
        case Failure(:final error):
          _error = error.message;
          _vehicles = [];
      }
    });
  }

  Future<void> _loadMyRentals({bool silent = false}) async {
    if (!silent) setState(() => _loadingList = true);
    final api = ref.read(apiClientProvider);
    final result = await api.get('/rental/bookings', skipCache: true);
    if (!mounted) return;
    setState(() {
      if (!silent) _loadingList = false;
      if (result case Success(:final data)) {
        _myRentals = (data['data'] as List? ?? data['bookings'] as List? ?? []).cast<Map<String, dynamic>>();
      }
    });
  }

  Widget _statusChip(String? label, String? status) {
    final text = label ?? status ?? '—';
    final color = switch (status?.toUpperCase()) {
      'CONFIRMED' || 'IN_PROGRESS' => MovaColors.green,
      'CONTACTED' => MovaColors.violet,
      'CLOSED' || 'CANCELLED' => Colors.red.shade700,
      _ => MovaColors.textSecondary,
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(text, style: TextStyle(fontSize: 11, color: color, fontWeight: FontWeight.w600)),
    );
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
    final imageUrl = MarketConfig.resolveMediaUrl(v['imageUrl']?.toString() ?? '');
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: MovaCard(
        onTap: () => _openDetail(v),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: Image.network(
                    imageUrl,
                    width: 72,
                    height: 54,
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => Container(
                      width: 72,
                      height: 54,
                      color: MovaColors.violet.withValues(alpha: 0.12),
                      child: const Icon(Icons.directions_car, color: MovaColors.violet, size: 28),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        v['name']?.toString() ?? 'Véhicule',
                        style: const TextStyle(fontWeight: FontWeight.w600),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      Container(
                        margin: const EdgeInsets.only(top: 4),
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: MovaColors.green.withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: const Text(
                          'Disponible',
                          style: TextStyle(fontSize: 10, color: MovaColors.green, fontWeight: FontWeight.w600),
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '${v['categoryLabel'] ?? v['category']} · ${v['make'] ?? ''} ${v['model'] ?? ''}'.trim(),
                        style: const TextStyle(fontSize: 12, color: MovaColors.textSecondary),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 4),
                      Wrap(
                        spacing: 4,
                        runSpacing: 4,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          if (v['rating'] != null) ...[
                            const Icon(Icons.star, size: 14, color: Colors.amber),
                            Text('${v['rating']}', style: const TextStyle(fontSize: 12)),
                          ],
                          Text(
                            '${MarketConfig.formatCdf(v['dailyRateCdf'] as int? ?? 0)}/j',
                            style: const TextStyle(color: MovaColors.green, fontWeight: FontWeight.w600, fontSize: 13),
                          ),
                        ],
                      ),
                      if (v['ownerBadge'] != null)
                        Padding(
                          padding: const EdgeInsets.only(top: 4),
                          child: Text(
                            v['ownerBadge'].toString(),
                            style: const TextStyle(fontSize: 11, color: MovaColors.violet),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                    ],
                  ),
                ),
              ],
            ),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton.icon(
                onPressed: () => _toggleCompare(id),
                icon: Icon(selected ? Icons.check_box : Icons.check_box_outline_blank, color: MovaColors.violet, size: 20),
                label: Text(selected ? 'Retirer' : 'Comparer', style: const TextStyle(fontSize: 12)),
              ),
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
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: timeline.map<Widget>((step) {
          final m = step as Map<String, dynamic>;
          final done = m['completed'] == true;
          final current = m['current'] == true;
          return SizedBox(
            width: 72,
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
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          );
        }).toList(),
      ),
    );
  }

  Widget _featureChip(IconData icon, String label) {
    return Chip(
      avatar: Icon(icon, size: 16, color: MovaColors.violet),
      label: Text(label, style: const TextStyle(fontSize: 11)),
      backgroundColor: MovaColors.violet.withValues(alpha: 0.08),
    );
  }

  Widget _searchTab(ThemeData theme) {
    final bottomPad = MediaQuery.paddingOf(context).bottom + 24;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (_step == _RentalStep.search) ...[
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                _featureChip(Icons.verified_user, 'KYC & permis'),
                const SizedBox(width: 6),
                _featureChip(Icons.bolt, 'Dispo temps réel'),
                const SizedBox(width: 6),
                _featureChip(Icons.payment, 'Mobile money'),
                const SizedBox(width: 6),
                _featureChip(Icons.gps_fixed, 'GPS retrait'),
                const SizedBox(width: 6),
                _featureChip(Icons.shield, 'Assurance'),
                const SizedBox(width: 6),
                _featureChip(Icons.card_giftcard, 'Fidélité'),
              ],
            ),
          ),
          const SizedBox(height: 12),
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
            items: ServiceAreas.cityNames
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
          DropdownButtonFormField<String?>(
            value: _fuel.isEmpty ? null : _fuel,
            decoration: const InputDecoration(labelText: 'Carburant', isDense: true),
            items: _fuelOptions
                .map((f) => DropdownMenuItem<String?>(value: f.$1.isEmpty ? null : f.$1, child: Text(f.$2)))
                .toList(),
            onChanged: (v) => setState(() => _fuel = v ?? ''),
          ),
          const SizedBox(height: 8),
          LayoutBuilder(
            builder: (context, constraints) {
              final stacked = constraints.maxWidth < 400;
              final priceFields = [
                Expanded(
                  child: TextField(
                    controller: _minPriceController,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                      labelText: 'Prix min (CDF/j)',
                      isDense: true,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: TextField(
                    controller: _maxPriceController,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                      labelText: 'Prix max (CDF/j)',
                      isDense: true,
                    ),
                  ),
                ),
              ];
              final filterFields = [
                Expanded(
                  child: DropdownButtonFormField<String>(
                    value: _transmission.isEmpty ? null : _transmission,
                    decoration: const InputDecoration(labelText: 'Transmission', isDense: true),
                    items: const [
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
              ];
              if (stacked) {
                return Column(
                  children: [
                    Row(children: priceFields),
                    const SizedBox(height: 8),
                    DropdownButtonFormField<String>(
                      value: _transmission.isEmpty ? null : _transmission,
                      decoration: const InputDecoration(labelText: 'Transmission', isDense: true),
                      items: const [
                        DropdownMenuItem(value: 'AUTO', child: Text('Automatique')),
                        DropdownMenuItem(value: 'MANUAL', child: Text('Manuelle')),
                      ],
                      onChanged: (v) => setState(() => _transmission = v ?? ''),
                    ),
                    const SizedBox(height: 8),
                    DropdownButtonFormField<String>(
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
                  ],
                );
              }
              return Column(
                children: [
                  Row(children: priceFields),
                  const SizedBox(height: 8),
                  Row(children: filterFields),
                ],
              );
            },
          ),
          const SizedBox(height: 12),
          if (_compareIds.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: MovaButton(
                label: 'Comparer (${_compareIds.length})',
                isSecondary: true,
                onPressed: () => setState(() => _step = _RentalStep.compare),
              ),
            ),
          MovaButton(
            label: 'Rechercher',
            icon: Icons.search,
            isLoading: _loading,
            onPressed: _loading ? null : _search,
          ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            MovaErrorBanner(message: _error!, onRetry: _search),
          ],
          const SizedBox(height: 16),
          if (!_loading && _vehicles.isNotEmpty)
            Text(
              '${_vehicles.length} véhicule${_vehicles.length > 1 ? 's' : ''} disponible${_vehicles.length > 1 ? 's' : ''}',
              style: theme.textTheme.labelLarge?.copyWith(color: MovaColors.green),
            ),
          if (_loading)
            const Center(child: CircularProgressIndicator())
          else if (_vehicles.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 24),
              child: Column(
                children: [
                  const Icon(Icons.directions_car_outlined, size: 48, color: MovaColors.textSecondary),
                  const SizedBox(height: 12),
                  Text(
                    _error != null
                        ? 'Impossible de charger le catalogue.\nVérifiez votre connexion réseau.'
                        : 'Aucun véhicule pour ces critères.\nÉlargissez les filtres ou changez de ville.',
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: MovaColors.textSecondary),
                  ),
                  const SizedBox(height: 12),
                  MovaButton(label: 'Réessayer', isSecondary: true, onPressed: _search),
                ],
              ),
            )
          else
            ..._vehicles.map(_vehicleCard),
          SizedBox(height: bottomPad),
        ] else ...[
          Row(
            children: [
              IconButton(
                icon: const Icon(Icons.arrow_back),
                onPressed: () => setState(() => _step = _RentalStep.search),
              ),
              Expanded(
                child: Text('Comparaison', style: theme.textTheme.titleMedium, overflow: TextOverflow.ellipsis),
              ),
            ],
          ),
          _compareTable(),
          const SizedBox(height: 16),
          ..._vehicles
              .where((v) => _compareIds.contains(v['id']?.toString()))
              .map((v) => Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: MovaButton(
                      label: 'Réserver ${v['name']}',
                      isSecondary: true,
                      onPressed: () => _openDetail(v),
                    ),
                  )),
          SizedBox(height: bottomPad),
        ],
      ],
    );
  }

  Widget _myRentalsTab(ThemeData theme) {
    if (_loadingList) return const Center(child: CircularProgressIndicator());
    if (_myRentals.isEmpty) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: const [
          SizedBox(height: 48),
          Icon(Icons.event_busy, size: 48, color: MovaColors.textSecondary),
          SizedBox(height: 12),
          Text(
            'Aucune réservation.\nParcourez le catalogue et réservez en quelques clics.',
            textAlign: TextAlign.center,
            style: TextStyle(color: MovaColors.textSecondary),
          ),
        ],
      );
    }
    return ListView.builder(
      physics: const AlwaysScrollableScrollPhysics(),
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
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        vehicle?['name']?.toString() ?? inq['vehicleType']?.toString() ?? 'Location',
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                    ),
                    _statusChip(inq['statusLabel']?.toString(), inq['status']?.toString()),
                  ],
                ),
                Text(
                  '${_formatDate(DateTime.parse(inq['startDate']?.toString() ?? DateTime.now().toIso8601String()))} → '
                  '${_formatDate(DateTime.parse(inq['endDate']?.toString() ?? DateTime.now().toIso8601String()))}',
                  style: const TextStyle(color: MovaColors.textSecondary, fontSize: 13),
                ),
                if (inq['remainingLabel'] != null &&
                    ['CONFIRMED', 'IN_PROGRESS', 'RETURNED'].contains(inq['status']?.toString().toUpperCase())) ...[
                  const SizedBox(height: 4),
                  Text(
                    inq['remainingActive'] == true
                        ? 'Temps restant : ${inq['remainingLabel']}'
                        : inq['remainingLabel']?.toString() ?? '',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: inq['remainingActive'] == true ? MovaColors.violet : MovaColors.textSecondary,
                    ),
                  ),
                ],
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
                        Expanded(
                          child: Text(
                            'Propriétaire : ${inq['ownerContactPhone']}',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
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
      scrollable: false,
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
                RefreshIndicator(
                  onRefresh: _search,
                  child: SingleChildScrollView(
                    physics: kMovaScrollPhysics,
                    child: _searchTab(theme),
                  ),
                ),
                RefreshIndicator(
                  onRefresh: _loadMyRentals,
                  child: _myRentalsTab(theme),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

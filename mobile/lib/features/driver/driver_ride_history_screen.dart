import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_client.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/billing/driver_earnings_display.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import '../history/history_format.dart';
import 'active_ride_screen.dart';
import '../chat/ride_chat_screen.dart';
import '../../core/i18n/i18n.dart';

enum _Period { today, week, month, all }

/// Every mission of the driver: taxi rides (cash confirmation, chat) and deliveries, errands,
/// moves, scheduled rides, rental logistics and carpools — with net earnings per period.
class DriverRideHistoryScreen extends ConsumerStatefulWidget {
  const DriverRideHistoryScreen({super.key});

  @override
  ConsumerState<DriverRideHistoryScreen> createState() => _DriverRideHistoryScreenState();
}

class _DriverRideHistoryScreenState extends ConsumerState<DriverRideHistoryScreen> {
  List<Map<String, dynamic>> _items = [];
  bool _loading = true;
  bool _loadingMore = false;
  bool _hasMoreRides = false;
  bool _hasMoreOther = false;
  String? _error;
  _Period _period = _Period.all;

  @override
  void initState() {
    super.initState();
    _load();
  }

  static List<Map<String, dynamic>> _rows(dynamic data, String key) {
    final list = data is Map ? (data['data'] ?? data[key]) : null;
    return (list is List ? list : const []).whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
  }

  Future<({List<Map<String, dynamic>> rides, List<Map<String, dynamic>> other, String? error})> _fetch(String? before) async {
    final api = ref.read(apiClientProvider);
    final b = before == null ? '' : '&before=${Uri.encodeQueryComponent(before)}';
    final results = await Future.wait([
      api.get('/rides/history?role=driver&limit=50$b', skipCache: true),
      api.get('/history/driver?limit=50$b', skipCache: true),
    ]);
    String? error;
    final rides = switch (results[0]) {
      Success(:final data) => _rows(data, 'rides').map((r) => {...r, 'type': 'RIDE'}).toList(),
      Failure() => <Map<String, dynamic>>[],
    };
    if (results[0] case Failure(error: final e)) error = e.message;
    final other = switch (results[1]) {
      Success(:final data) => _rows(data, 'data'),
      Failure() => <Map<String, dynamic>>[],
    };
    if (results[1] case Success(:final data) when data is Map) _hasMoreOther = data['hasMore'] == true;
    _hasMoreRides = rides.length >= 50;
    return (rides: rides, other: other, error: error);
  }

  void _sort(List<Map<String, dynamic>> list) {
    DateTime at(Map<String, dynamic> m) => DateTime.tryParse(m['createdAt']?.toString() ?? '') ?? DateTime(2000);
    list.sort((a, b) => at(b).compareTo(at(a)));
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final r = await _fetch(null);
    if (!mounted) return;
    setState(() {
      _items = [...r.rides, ...r.other];
      _sort(_items);
      _error = _items.isEmpty ? r.error : null;
      _loading = false;
    });
  }

  Future<void> _loadMore() async {
    if (_loadingMore || _items.isEmpty) return;
    final oldest = _items
        .map((e) => DateTime.tryParse(e['createdAt']?.toString() ?? ''))
        .whereType<DateTime>()
        .fold<DateTime?>(null, (min, d) => min == null || d.isBefore(min) ? d : min);
    if (oldest == null) return;
    setState(() => _loadingMore = true);
    final r = await _fetch(oldest.toUtc().toIso8601String());
    if (!mounted) return;
    setState(() {
      final seen = _items.map((e) => '${e['type']}:${e['id']}').toSet();
      _items = [..._items, ...[...r.rides, ...r.other].where((e) => seen.add('${e['type']}:${e['id']}'))];
      _sort(_items);
      _loadingMore = false;
    });
  }

  List<Map<String, dynamic>> get _visible {
    if (_period == _Period.all) return _items;
    final now = DateTime.now();
    final from = switch (_period) {
      _Period.today => DateTime(now.year, now.month, now.day),
      _Period.week => now.subtract(const Duration(days: 7)),
      _Period.month => DateTime(now.year, now.month),
      _Period.all => DateTime(2000),
    };
    return _items.where((e) {
      final d = DateTime.tryParse(e['completedAt']?.toString() ?? e['createdAt']?.toString() ?? '')?.toLocal();
      return d != null && !d.isBefore(from);
    }).toList();
  }

  static bool _isDone(Map<String, dynamic> m) =>
      const {'COMPLETED', 'DELIVERED', 'RETURNED', 'PAID'}.contains(m['status']?.toString());

  static int? _net(Map<String, dynamic> m) => DriverEarningsDisplay.netFromMap(m);

  static String _typeLabel(String? type) => switch (type) {
        'RIDE' => tr('Course taxi'),
        'PARCEL' => tr('Livraison colis'),
        'EXPRESS' => tr('Livraison express'),
        'FOOD' => tr('Livraison repas'),
        'ERRAND' => tr('Courses & commissions'),
        'MOVING' => tr('Déménagement'),
        'SCHEDULED' => tr('Course planifiée'),
        'RENTAL' => tr('Location logistique'),
        'CARPOOL' => tr('Covoiturage'),
        _ => tr('Mission'),
      };

  static IconData _typeIcon(String? type) => switch (type) {
        'RIDE' || 'SCHEDULED' => Icons.local_taxi_outlined,
        'PARCEL' || 'EXPRESS' => Icons.inventory_2_outlined,
        'FOOD' => Icons.restaurant_outlined,
        'ERRAND' => Icons.shopping_basket_outlined,
        'MOVING' => Icons.local_shipping_outlined,
        'RENTAL' => Icons.car_rental_outlined,
        'CARPOOL' => Icons.groups_outlined,
        _ => Icons.work_outline,
      };

  String _statusLabel(Map<String, dynamic> m) {
    final status = m['status']?.toString();
    if (m['type'] == 'RIDE' && status == 'COMPLETED') {
      return m['isPaid'] == true ? tr('Terminée · Payée') : tr('Terminée · À encaisser');
    }
    return switch (status) {
      'COMPLETED' || 'DELIVERED' => tr('Terminée'),
      'RETURNED' => tr('Retournée'),
      'PAID' => tr('Payée'),
      'CANCELLED' => tr('Annulée'),
      'DRIVER_ASSIGNED' || 'ASSIGNED' || 'CONFIRMED' => tr('Assignée'),
      'ARRIVING' || 'PICKED_UP' || 'IN_TRANSIT' => tr('En route'),
      'IN_PROGRESS' || 'ACTIVE' => tr('En cours'),
      'PENDING' || 'SCHEDULED' || 'SEARCHING' => tr('En attente'),
      _ => status ?? '—',
    };
  }

  Color _statusColor(Map<String, dynamic> m) {
    final status = m['status']?.toString();
    if (m['type'] == 'RIDE' && status == 'COMPLETED') {
      return m['isPaid'] == true ? MovaColors.green : MovaColors.orange;
    }
    if (status == 'CANCELLED') return MovaColors.error;
    if (_isDone(m)) return MovaColors.green;
    return MovaColors.violet;
  }

  bool _needsCashConfirm(Map<String, dynamic> m) =>
      m['type'] == 'RIDE' && m['status']?.toString() == 'COMPLETED' && m['isPaid'] != true;

  Future<void> _openRide(Map<String, dynamic> ride) async {
    final rideId = ride['id']?.toString();
    if (rideId == null) return;
    final result = await ref.read(apiClientProvider).getRide(rideId);
    if (!mounted) return;
    switch (result) {
      case Success(:final data):
        await Navigator.push(context, MaterialPageRoute(builder: (_) => ActiveRideScreen(ride: data)));
        if (mounted) _load();
      case Failure(:final error):
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.message)));
    }
  }

  void _openChat(Map<String, dynamic> ride) {
    final rideId = ride['id']?.toString();
    if (rideId == null) return;
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => RideChatScreen(rideId: rideId, myRole: 'driver', peerLabel: tr('Passager'))),
    );
  }

  /// Detail of a mission: route, date, status, gross, SENGA commission, net.
  void _showDetail(Map<String, dynamic> m) {
    final gross = (m['driverGrossCdf'] ?? m['priceCdf'] ?? m['estimatedFareCdf']) as num?;
    final net = _net(m);
    final fee = (m['platformFeeCdf'] as num?) ?? (gross != null && net != null ? gross - net : null);
    final pct = m['commissionPercent'] as num?;
    Widget row(String label, String value, {Color? color, bool bold = false}) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 3),
          child: Row(
            children: [
              Expanded(child: Text(label, style: const TextStyle(color: MovaColors.textSecondary))),
              Text(value, style: TextStyle(color: color, fontWeight: bold ? FontWeight.bold : FontWeight.normal)),
            ],
          ),
        );
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Icon(_typeIcon(m['type']?.toString()), color: MovaColors.violet),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(_typeLabel(m['type']?.toString()), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                  ),
                  Text(_statusLabel(m), style: TextStyle(color: _statusColor(m), fontWeight: FontWeight.w600)),
                ],
              ),
              const SizedBox(height: 12),
              if ((m['pickupAddress'] ?? '').toString().isNotEmpty) row(tr('Départ'), m['pickupAddress'].toString()),
              if ((m['dropoffAddress'] ?? '').toString().isNotEmpty) row(tr('Arrivée'), m['dropoffAddress'].toString()),
              if (m['type'] != 'RIDE' && (m['title'] ?? '').toString().isNotEmpty && m['pickupAddress'] == null)
                row(tr('Mission'), m['title'].toString()),
              row(tr('Date'), formatHistoryDate(m['completedAt']?.toString() ?? m['createdAt']?.toString())),
              const Divider(),
              if (gross != null) row(tr('Montant de la mission'), MarketConfig.formatCdf(gross.round())),
              if (fee != null && fee > 0)
                row(
                  pct != null ? trf('Commission SENGA ({pct} %)', {'pct': pct.round()}) : tr('Commission SENGA'),
                  '− ${MarketConfig.formatCdf(fee.round())}',
                ),
              if (net != null) row(tr('Votre gain net'), MarketConfig.formatCdf(net), color: MovaColors.green, bold: true),
              if (m['type'] == 'RIDE')
                row(tr('Paiement'), m['isPaid'] == true ? tr('Payée') : tr('À encaisser')),
              const SizedBox(height: 12),
              if (_needsCashConfirm(m))
                MovaButton(
                  label: tr('Confirmer le paiement espèces'),
                  icon: Icons.payments_outlined,
                  onPressed: () {
                    Navigator.pop(ctx);
                    _openRide(m);
                  },
                ),
              TextButton(onPressed: () => Navigator.pop(ctx), child: Text(tr('Fermer'))),
            ],
          ),
        ),
      ),
    );
  }

  Widget _periodBar(List<Map<String, dynamic>> visible) {
    final done = visible.where(_isDone).toList();
    final total = done.fold<int>(0, (sum, m) => sum + (_net(m) ?? 0));
    final labels = {
      _Period.today: tr('Aujourd\'hui'),
      _Period.week: tr('7 jours'),
      _Period.month: tr('Ce mois'),
      _Period.all: tr('Tout'),
    };
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Wrap(
          spacing: 8,
          children: [
            for (final p in _Period.values)
              ChoiceChip(
                key: Key('driverHistoryPeriod_${p.name}'),
                label: Text(labels[p]!),
                selected: _period == p,
                onSelected: (_) => setState(() => _period = p),
              ),
          ],
        ),
        const SizedBox(height: 8),
        MovaCard(
          child: Row(
            children: [
              Expanded(
                child: Text(
                  trf('{count} mission(s) terminée(s)', {'count': done.length}),
                  style: const TextStyle(color: MovaColors.textSecondary),
                ),
              ),
              Text(
                trf('Gain net : {total}', {'total': MarketConfig.formatCdf(total)}),
                style: const TextStyle(fontWeight: FontWeight.bold, color: MovaColors.green),
              ),
            ],
          ),
        ),
        const SizedBox(height: 8),
      ],
    );
  }

  Widget _tile(Map<String, dynamic> m) {
    final net = _net(m);
    final type = m['type']?.toString();
    final from = m['pickupAddress']?.toString();
    final to = m['dropoffAddress']?.toString();
    final title = type == 'RIDE' || from != null ? (from ?? tr('Course')) : (m['title']?.toString() ?? _typeLabel(type));
    return MovaCard(
      onTap: () => _showDetail(m),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(_typeIcon(type), size: 18, color: MovaColors.violet),
              const SizedBox(width: 6),
              Text(_typeLabel(type), style: const TextStyle(fontSize: 12, color: MovaColors.textSecondary)),
              const Spacer(),
              Text(
                formatHistoryDate(m['completedAt']?.toString() ?? m['createdAt']?.toString()),
                style: const TextStyle(fontSize: 12, color: MovaColors.textSecondary),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Row(
            children: [
              Expanded(
                child: Text(title, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600)),
              ),
              if (type == 'RIDE' && m['status']?.toString() != 'CANCELLED' && m['id'] != null)
                IconButton(
                  icon: const Icon(Icons.chat_bubble_outline, color: MovaColors.violet),
                  tooltip: tr('Chat passager'),
                  onPressed: () => _openChat(m),
                ),
              if (net != null)
                Text(MarketConfig.formatCdf(net), style: const TextStyle(fontWeight: FontWeight.bold, color: MovaColors.green)),
            ],
          ),
          if (to != null && to.isNotEmpty)
            Text('→ $to', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: MovaColors.textSecondary, fontSize: 13)),
          const SizedBox(height: 6),
          Text(
            _statusLabel(m),
            style: TextStyle(color: _statusColor(m), fontSize: 12, fontWeight: FontWeight.w600),
          ),
          if (_needsCashConfirm(m)) ...[
            const SizedBox(height: 6),
            Text(
              tr('Appuyez pour confirmer le paiement espèces (PIN)'),
              style: TextStyle(color: MovaColors.orange.withValues(alpha: 0.95), fontSize: 12, fontWeight: FontWeight.w600),
            ),
          ],
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final visible = _visible;
    return MovaScreen(
      title: tr('Mes missions'),
      scrollable: false,
      actions: [IconButton(icon: const Icon(Icons.refresh), tooltip: tr('Actualiser'), onPressed: _load)],
      child: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? MovaErrorBanner(message: _error!, onRetry: _load)
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(
                    children: [
                      _periodBar(visible),
                      if (visible.isEmpty)
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 32),
                          child: Center(
                            child: Text(tr('Aucune mission sur cette période.'), style: const TextStyle(color: MovaColors.textSecondary)),
                          ),
                        ),
                      for (final m in visible) ...[_tile(m), const SizedBox(height: 8)],
                      if (_hasMoreRides || _hasMoreOther)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 16),
                          child: MovaButton(
                            key: const Key('driverHistoryLoadMore'),
                            label: _loadingMore ? tr('Chargement…') : tr('Charger plus'),
                            isSecondary: true,
                            icon: Icons.expand_more,
                            onPressed: _loadingMore ? null : _loadMore,
                          ),
                        ),
                    ],
                  ),
                ),
    );
  }
}

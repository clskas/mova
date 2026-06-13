import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_client.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';

class RentalScreen extends ConsumerStatefulWidget {
  const RentalScreen({super.key});

  @override
  ConsumerState<RentalScreen> createState() => _RentalScreenState();
}

class _RentalScreenState extends ConsumerState<RentalScreen> {
  List<Map<String, dynamic>> _vehicles = [];
  String? _selectedVehicleId;
  DateTime _startDate = DateTime.now().add(const Duration(days: 1));
  DateTime _endDate = DateTime.now().add(const Duration(days: 3));
  final _pickupController = TextEditingController(text: 'Gombe, Kinshasa');
  final _phoneController = TextEditingController(text: '+243812345678');
  final _notesController = TextEditingController();
  List<Map<String, dynamic>> _inquiries = [];
  int? _estimatedTotal;
  bool _loading = false;
  bool _loadingList = true;
  String? _error;
  String? _validationError;

  @override
  void initState() {
    super.initState();
    _loadVehicles();
    _loadInquiries();
  }

  @override
  void dispose() {
    _pickupController.dispose();
    _phoneController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  String _formatDate(DateTime dt) {
    final d = dt.day.toString().padLeft(2, '0');
    final m = dt.month.toString().padLeft(2, '0');
    return '$d/$m/${dt.year}';
  }

  int _rentalDays() => _endDate.difference(_startDate).inDays.clamp(1, 30);

  Map<String, dynamic> _estimatePayload() => {
        'vehicleId': _selectedVehicleId!,
        'startDate': DateTime(_startDate.year, _startDate.month, _startDate.day).toIso8601String(),
        'endDate': DateTime(_endDate.year, _endDate.month, _endDate.day).toIso8601String(),
      };

  Map<String, dynamic> _bookingPayload() => {
        ..._estimatePayload(),
        'pickupAddress': _pickupController.text.trim(),
        'contactPhone': MarketConfig.normalizePhone(_phoneController.text.trim()),
        if (_notesController.text.trim().isNotEmpty) 'notes': _notesController.text.trim(),
      };

  Future<void> _loadVehicles() async {
    final api = ref.read(apiClientProvider);
    await api.checkHealth();
    final result = await api.get('/rental/vehicles');
    if (!mounted) return;
    setState(() {
      if (result case Success(:final data)) {
        final raw = data['data'] as List? ?? [];
        _vehicles = raw.cast<Map<String, dynamic>>();
        _selectedVehicleId ??= _vehicles.isNotEmpty ? _vehicles.first['id']?.toString() : null;
      }
    });
  }

  Future<void> _loadInquiries() async {
    setState(() => _loadingList = true);
    final api = ref.read(apiClientProvider);
    await api.checkHealth();
    final result = await api.get('/rental/inquiries');
    setState(() {
      _loadingList = false;
      if (result case Success(:final data)) {
        final raw = data['data'] as List? ?? data['inquiries'] as List? ?? [];
        _inquiries = raw.cast<Map<String, dynamic>>();
      }
    });
  }

  Future<void> _pickDate({required bool isStart}) async {
    final initial = isStart ? _startDate : _endDate;
    final date = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 90)),
    );
    if (date == null || !mounted) return;
    setState(() {
      if (isStart) {
        _startDate = date;
        if (!_endDate.isAfter(_startDate)) {
          _endDate = _startDate.add(const Duration(days: 1));
        }
      } else {
        _endDate = date;
      }
      _estimatedTotal = null;
    });
  }

  String? _validate() {
    if (_selectedVehicleId == null || _selectedVehicleId!.isEmpty) {
      return 'Choisissez un véhicule disponible.';
    }
    if (_pickupController.text.trim().isEmpty) {
      return 'Indiquez le lieu de prise en charge.';
    }
    if (!MarketConfig.validatePhone(_phoneController.text.trim())) {
      return 'Numéro de téléphone invalide (+243…).';
    }
    if (!_endDate.isAfter(_startDate)) {
      return 'La date de fin doit être après la date de début.';
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
    final result = await api.post('/rental/estimate', _estimatePayload());
    setState(() {
      _loading = false;
      switch (result) {
        case Success(:final data):
          _estimatedTotal = data['estimatedPriceCdf'] as int? ?? data['estimatedTotalCdf'] as int?;
        case Failure(:final error):
          _error = error.message;
      }
    });
  }

  Future<void> _book() async {
    final validation = _validate();
    if (validation != null) {
      setState(() => _validationError = validation);
      return;
    }
    if (_estimatedTotal == null) {
      setState(() => _validationError = 'Estimez le prix avant de réserver.');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
      _validationError = null;
    });
    final api = ref.read(apiClientProvider);
    final result = await api.post('/rental/bookings', _bookingPayload());
    setState(() => _loading = false);
    switch (result) {
      case Success(:final data):
        if (mounted) {
          final inquiry = data['inquiry'] as Map<String, dynamic>?;
          showDialog<void>(
            context: context,
            builder: (ctx) => AlertDialog(
              title: const Text('Demande enregistrée'),
              content: Text(
                data['message']?.toString() ??
                    'Un conseiller MOVA vous contactera sous 24 h.\n'
                        'Réf. : ${inquiry?['id'] ?? ''}\n'
                        'Total estimé : ${MarketConfig.formatCdf(_estimatedTotal ?? 0)}',
                maxLines: 6,
                overflow: TextOverflow.ellipsis,
              ),
              actions: [
                TextButton(
                  onPressed: () {
                    Navigator.pop(ctx);
                    _loadInquiries();
                    setState(() => _estimatedTotal = null);
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
    final days = _rentalDays();

    return MovaScreen(
      title: 'Location véhicule',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Réservez un véhicule avec chauffeur ou en location libre.',
            style: theme.textTheme.bodyMedium?.copyWith(color: MovaColors.textSecondary),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
          if (_loadingList)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 16),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (_inquiries.isNotEmpty) ...[
            const SizedBox(height: 16),
            Text('Mes demandes', style: theme.textTheme.titleSmall),
            const SizedBox(height: 8),
            ..._inquiries.take(3).map((inq) {
              return Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: MovaCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        inq['vehicleType']?.toString() ?? 'Véhicule',
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                      Text(
                        '${_formatDate(DateTime.parse(inq['startDate']?.toString() ?? DateTime.now().toIso8601String()))} → '
                        '${_formatDate(DateTime.parse(inq['endDate']?.toString() ?? DateTime.now().toIso8601String()))}',
                        style: const TextStyle(color: MovaColors.textSecondary, fontSize: 13),
                      ),
                      Text(
                        inq['status']?.toString() ?? 'PENDING',
                        style: const TextStyle(color: MovaColors.violet, fontSize: 13),
                      ),
                    ],
                  ),
                ),
              );
            }),
            const Divider(height: 24),
          ],
          Text('Véhicule disponible', style: theme.textTheme.titleSmall),
          const SizedBox(height: 8),
          if (_vehicles.isEmpty)
            const Text('Aucun véhicule disponible.', style: TextStyle(color: MovaColors.textSecondary))
          else
            ..._vehicles.map((v) {
              final id = v['id']?.toString() ?? '';
              final rate = v['dailyRateCdf'] as int? ?? 0;
              return RadioListTile<String>(
                title: Text(v['name']?.toString() ?? 'Véhicule', maxLines: 1, overflow: TextOverflow.ellipsis),
                subtitle: Text(
                  '${v['category'] ?? ''} · ${MarketConfig.formatCdf(rate)}/jour',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 12),
                ),
                value: id,
                groupValue: _selectedVehicleId,
                onChanged: (val) => setState(() {
                  _selectedVehicleId = val;
                  _estimatedTotal = null;
                }),
              );
            }),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: MovaCard(
                  onTap: () => _pickDate(isStart: true),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Début', style: theme.textTheme.labelMedium),
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
                      Text('Fin', style: theme.textTheme.labelMedium),
                      Text(_formatDate(_endDate)),
                    ],
                  ),
                ),
              ),
            ],
          ),
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(
              '$days jour${days > 1 ? 's' : ''}',
              style: theme.textTheme.bodySmall?.copyWith(color: MovaColors.textSecondary),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _pickupController,
            decoration: const InputDecoration(
              labelText: 'Lieu de prise en charge',
              prefixIcon: Icon(Icons.location_on_outlined),
            ),
            onChanged: (_) => setState(() => _estimatedTotal = null),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _phoneController,
            keyboardType: TextInputType.phone,
            decoration: const InputDecoration(
              labelText: 'Téléphone de contact',
              prefixIcon: Icon(Icons.phone_outlined),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _notesController,
            maxLines: 2,
            decoration: const InputDecoration(
              labelText: 'Notes (optionnel)',
              hintText: 'Siège enfant, assurance…',
              prefixIcon: Icon(Icons.notes_outlined),
            ),
          ),
          if (_estimatedTotal != null) ...[
            const SizedBox(height: 16),
            MovaCard(
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Expanded(
                    child: Text('Estimation ($days j)', maxLines: 1, overflow: TextOverflow.ellipsis),
                  ),
                  Text(
                    MarketConfig.formatCdf(_estimatedTotal!),
                    style: const TextStyle(
                      fontSize: 18,
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
            label: _estimatedTotal == null ? 'Estimer le prix' : 'Envoyer la demande',
            isLoading: _loading,
            icon: _estimatedTotal == null ? Icons.calculate_outlined : Icons.check_circle_outline,
            onPressed: _loading ? null : (_estimatedTotal == null ? _estimate : _book),
          ),
        ],
      ),
    );
  }
}

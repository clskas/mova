import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_client.dart';
import '../../core/config/market_config.dart';
import '../../core/location/service_areas.dart';
import '../../core/error/result.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import 'rental_booking_detail_screen.dart';

class RentalDetailScreen extends ConsumerStatefulWidget {
  const RentalDetailScreen({
    super.key,
    required this.vehicleId,
    this.initialVehicle,
    this.startDate,
    this.endDate,
    this.pickupCity,
    this.returnCity,
  });

  final String vehicleId;
  final Map<String, dynamic>? initialVehicle;
  final DateTime? startDate;
  final DateTime? endDate;
  final String? pickupCity;
  final String? returnCity;

  @override
  ConsumerState<RentalDetailScreen> createState() => _RentalDetailScreenState();
}

class _RentalDetailScreenState extends ConsumerState<RentalDetailScreen> {
  Map<String, dynamic>? _vehicle;
  Map<String, dynamic>? _quote;
  DateTime _startDate = DateTime.now().add(const Duration(days: 1));
  DateTime _endDate = DateTime.now().add(const Duration(days: 3));
  String _pickupCity = 'Kinshasa';
  String _returnCity = 'Kinshasa';
  String _rentalPeriod = 'DAILY';
  String _mileageType = 'UNLIMITED';
  String _insuranceTier = 'BASIC';
  bool _childSeat = false;
  bool _gps = false;
  bool _extraDriver = false;
  String _logisticsMode = 'SELF_PASSENGER';
  final _passengerDriverNameController = TextEditingController();
  final _passengerDriverPhoneController = TextEditingController();
  final _pickupController = TextEditingController(text: 'Gombe, Kinshasa');
  final _phoneController = TextEditingController(text: '+243812345678');
  final _notesController = TextEditingController();
  bool _loading = true;
  bool _submitting = false;
  String? _error;
  int _step = 0; // 0=detail, 1=quote, 2=confirm

  @override
  void initState() {
    super.initState();
    if (widget.startDate != null) _startDate = widget.startDate!;
    if (widget.endDate != null) _endDate = widget.endDate!;
    if (widget.pickupCity != null) _pickupCity = widget.pickupCity!;
    if (widget.returnCity != null) _returnCity = widget.returnCity!;
    if (widget.initialVehicle != null) {
      _vehicle = widget.initialVehicle;
      _loading = false;
    }
    _loadVehicle();
  }

  @override
  void dispose() {
    _pickupController.dispose();
    _phoneController.dispose();
    _notesController.dispose();
    _passengerDriverNameController.dispose();
    _passengerDriverPhoneController.dispose();
    super.dispose();
  }

  Future<void> _loadVehicle() async {
    if (widget.vehicleId.isEmpty) {
      setState(() => _loading = false);
      return;
    }
    final api = ref.read(apiClientProvider);
    final result = await api.get('/rental/vehicles/${widget.vehicleId}');
    if (!mounted) return;
    setState(() {
      _loading = false;
      switch (result) {
        case Success(:final data):
          _vehicle = data['vehicle'] as Map<String, dynamic>? ?? data;
          _error = null;
        case Failure(:final error):
          _error = error.message;
      }
    });
  }

  Map<String, dynamic> _quotePayload() => {
        'vehicleId': widget.vehicleId,
        'startDate': DateTime(_startDate.year, _startDate.month, _startDate.day).toIso8601String(),
        'endDate': DateTime(_endDate.year, _endDate.month, _endDate.day).toIso8601String(),
        'pickupCity': _pickupCity,
        'returnCity': _returnCity,
        'rentalPeriod': _rentalPeriod,
        'mileageType': _mileageType,
        'insuranceTier': _insuranceTier,
        'addOns': {
          'childSeat': _childSeat,
          'gps': _gps,
          'extraDriver': _extraDriver,
        },
        'logisticsMode': _logisticsMode,
        if (_logisticsMode == 'PASSENGER_DRIVER') ...{
          if (_passengerDriverNameController.text.trim().isNotEmpty)
            'passengerDriverName': _passengerDriverNameController.text.trim(),
          'passengerDriverPhone': MarketConfig.normalizePhone(_passengerDriverPhoneController.text.trim()),
        },
      };

  Future<void> _fetchQuote() async {
    setState(() {
      _submitting = true;
      _error = null;
    });
    final api = ref.read(apiClientProvider);
    final result = await api.post('/rental/quote', _quotePayload());
    if (!mounted) return;
    setState(() {
      _submitting = false;
      switch (result) {
        case Success(:final data):
          _quote = data;
          _step = 2;
        case Failure(:final error):
          _error = error.message;
      }
    });
  }

  Future<void> _confirm() async {
    if (!MarketConfig.validatePhone(_phoneController.text.trim())) {
      setState(() => _error = 'Numéro de téléphone invalide (+243…).');
      return;
    }
    if (_logisticsMode == 'PASSENGER_DRIVER' &&
        !MarketConfig.validatePhone(_passengerDriverPhoneController.text.trim())) {
      setState(() => _error = 'Téléphone du chauffeur passager invalide (+243…).');
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });
    final api = ref.read(apiClientProvider);
    final payload = {
      ..._quotePayload(),
      'pickupAddress': _pickupController.text.trim(),
      'contactPhone': MarketConfig.normalizePhone(_phoneController.text.trim()),
      if (_notesController.text.trim().isNotEmpty) 'notes': _notesController.text.trim(),
    };
    final result = await api.post('/rental/bookings', payload);
    if (!mounted) return;
    setState(() => _submitting = false);
    switch (result) {
      case Success(:final data):
        final inquiry = data['inquiry'] as Map<String, dynamic>? ?? data['booking'] as Map<String, dynamic>?;
        final bookingId = inquiry?['id']?.toString() ?? '';
        if (!mounted) return;
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(
            builder: (_) => RentalBookingDetailScreen(
              bookingId: bookingId,
              initialBooking: {
                ...?inquiry,
                if (data['quote'] != null) 'totalCdf': (data['quote'] as Map)['totalCdf'],
                'timeline': inquiry?['timeline'] ??
                    [
                      {'label': 'Demande', 'completed': true, 'current': true},
                      {'label': 'Confirmée', 'completed': false, 'current': false},
                      {'label': 'En cours', 'completed': false, 'current': false},
                      {'label': 'Retournée', 'completed': false, 'current': false},
                    ],
              },
            ),
          ),
        );
      case Failure(:final error):
        setState(() => _error = error.message);
    }
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
      _quote = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final v = _vehicle;

    if (_loading) {
      return const MovaScreen(title: 'Détail véhicule', child: Center(child: CircularProgressIndicator()));
    }

    if (v == null) {
      return MovaScreen(
        title: 'Détail véhicule',
        child: MovaErrorBanner(message: _error ?? 'Véhicule introuvable', onRetry: _loadVehicle),
      );
    }

    final imageUrl = v['imageUrl']?.toString();
    final resolvedImage = imageUrl != null && imageUrl.isNotEmpty
        ? MarketConfig.resolveMediaUrl(imageUrl)
        : null;
    final features = (v['features'] as List?)?.cast<String>() ?? [];

    return MovaScreen(
      title: v['name']?.toString() ?? 'Véhicule',
      scrollable: true,
      child: Column(
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
                Icon(Icons.date_range, size: 18, color: MovaColors.violet),
                SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Location longue durée (jours/semaines) — pas une course VTC à la demande.',
                    style: TextStyle(fontSize: 12, color: MovaColors.violet),
                  ),
                ),
              ],
            ),
          ),
          if (resolvedImage != null && resolvedImage.isNotEmpty)
            ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: Image.network(
                resolvedImage,
                height: 180,
                width: double.infinity,
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => Container(
                  height: 180,
                  color: MovaColors.violet.withValues(alpha: 0.15),
                  child: const Icon(Icons.directions_car, size: 64, color: MovaColors.violet),
                ),
              ),
            ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: Text(
                  '${v['make'] ?? ''} ${v['model'] ?? ''} ${v['year'] ?? ''}'.trim(),
                  style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              if (v['rating'] != null)
                Row(
                  children: [
                    const Icon(Icons.star, color: Colors.amber, size: 18),
                    Text(' ${v['rating']}'),
                  ],
                ),
            ],
          ),
          Text(
            '${v['categoryLabel'] ?? v['category']} · ${v['transmissionLabel'] ?? v['transmission']} · ${v['seats']} places',
            style: theme.textTheme.bodySmall?.copyWith(color: MovaColors.textSecondary),
          ),
          if (v['ownerName'] != null) ...[
            const SizedBox(height: 8),
            Row(
              children: [
                const Icon(Icons.verified_user_outlined, size: 16, color: MovaColors.violet),
                const SizedBox(width: 4),
                Expanded(
                  child: Text(
                    'Propriétaire : ${v['ownerName']}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                if (v['ownerBadge'] != null) ...[
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: MovaColors.violet.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(v['ownerBadge'].toString(), style: const TextStyle(fontSize: 11, color: MovaColors.violet)),
                  ),
                ],
              ],
            ),
          ],
          Text(
            '${MarketConfig.formatCdf(v['dailyRateCdf'] as int? ?? 0)}/jour · Caution ${MarketConfig.formatCdf(v['depositCdf'] as int? ?? 0)}',
            style: const TextStyle(color: MovaColors.green, fontWeight: FontWeight.w600),
          ),
          if (_step == 0) ...[
            const SizedBox(height: 16),
            if (features.isNotEmpty) ...[
              Text('Équipements', style: theme.textTheme.titleSmall),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 4,
                children: features.map((f) => Chip(label: Text(f, style: const TextStyle(fontSize: 12)))).toList(),
              ),
            ],
            const SizedBox(height: 12),
            Text('Politique d\'annulation', style: theme.textTheme.titleSmall),
            Text(
              v['cancellationPolicy']?.toString() ?? '',
              style: theme.textTheme.bodySmall?.copyWith(color: MovaColors.textSecondary),
            ),
            const SizedBox(height: 24),
            MovaButton(
              label: 'Configurer la location',
              icon: Icons.tune_outlined,
              onPressed: () => setState(() => _step = 1),
            ),
          ],
          if (_step >= 1) ...[
            const Divider(height: 24),
            Text('Dates', style: theme.textTheme.titleSmall),
            Row(
              children: [
                Expanded(
                  child: MovaCard(
                    onTap: () => _pickDate(isStart: true),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Prise en charge', style: theme.textTheme.labelMedium),
                        Text('${_startDate.day}/${_startDate.month}/${_startDate.year}'),
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
                        Text('${_endDate.day}/${_endDate.month}/${_endDate.year}'),
                      ],
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              value: _pickupCity,
              decoration: const InputDecoration(labelText: 'Ville de prise en charge'),
              items: ServiceAreas.cityNames
                  .map((c) => DropdownMenuItem(value: c, child: Text(c)))
                  .toList(),
              onChanged: (v) => setState(() {
                _pickupCity = v ?? _pickupCity;
                _quote = null;
              }),
            ),
            const SizedBox(height: 8),
            DropdownButtonFormField<String>(
              value: _returnCity,
              decoration: const InputDecoration(labelText: 'Ville de retour'),
              items: ServiceAreas.cityNames
                  .map((c) => DropdownMenuItem(value: c, child: Text(c)))
                  .toList(),
              onChanged: (v) => setState(() {
                _returnCity = v ?? _returnCity;
                _quote = null;
              }),
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: SegmentedButton<String>(
                segments: const [
                  ButtonSegment(value: 'DAILY', label: Text('Journée')),
                  ButtonSegment(value: 'WEEKLY', label: Text('Semaine')),
                ],
                selected: {_rentalPeriod},
                onSelectionChanged: (s) => setState(() {
                  _rentalPeriod = s.first;
                  _quote = null;
                }),
              ),
            ),
            const SizedBox(height: 12),
            Text('Assurance', style: theme.textTheme.titleSmall),
            ...['BASIC', 'STANDARD', 'PREMIUM'].map((tier) {
              final labels = {'BASIC': 'Basique', 'STANDARD': 'Standard', 'PREMIUM': 'Premium'};
              return RadioListTile<String>(
                title: Text(labels[tier] ?? tier),
                value: tier,
                groupValue: _insuranceTier,
                onChanged: (v) => setState(() {
                  _insuranceTier = v!;
                  _quote = null;
                }),
              );
            }),
            Text('Kilométrage', style: theme.textTheme.titleSmall),
            SizedBox(
              width: double.infinity,
              child: SegmentedButton<String>(
                segments: const [
                  ButtonSegment(value: 'UNLIMITED', label: Text('Illimité')),
                  ButtonSegment(value: 'LIMITED', label: Text('Limité')),
                ],
                selected: {_mileageType},
                onSelectionChanged: (s) => setState(() {
                  _mileageType = s.first;
                  _quote = null;
                }),
              ),
            ),
            const SizedBox(height: 8),
            Text('Options', style: theme.textTheme.titleSmall),
            CheckboxListTile(
              title: const Text('Siège enfant'),
              value: _childSeat,
              onChanged: (v) => setState(() {
                _childSeat = v ?? false;
                _quote = null;
              }),
              controlAffinity: ListTileControlAffinity.leading,
              contentPadding: EdgeInsets.zero,
            ),
            CheckboxListTile(
              title: const Text('GPS'),
              value: _gps,
              onChanged: (v) => setState(() {
                _gps = v ?? false;
                _quote = null;
              }),
              controlAffinity: ListTileControlAffinity.leading,
              contentPadding: EdgeInsets.zero,
            ),
            CheckboxListTile(
              title: const Text('Conducteur supplémentaire'),
              value: _extraDriver,
              onChanged: (v) => setState(() {
                _extraDriver = v ?? false;
                _quote = null;
              }),
              controlAffinity: ListTileControlAffinity.leading,
              contentPadding: EdgeInsets.zero,
            ),
            const SizedBox(height: 8),
            Text('Remise du véhicule', style: theme.textTheme.titleSmall),
            RadioListTile<String>(
              title: const Text('Je récupère le véhicule moi-même'),
              value: 'SELF_PASSENGER',
              groupValue: _logisticsMode,
              onChanged: (v) => setState(() => _logisticsMode = v!),
              contentPadding: EdgeInsets.zero,
            ),
            RadioListTile<String>(
              title: const Text('Mon chauffeur s\'occupe du transport'),
              value: 'PASSENGER_DRIVER',
              groupValue: _logisticsMode,
              onChanged: (v) => setState(() => _logisticsMode = v!),
              contentPadding: EdgeInsets.zero,
            ),
            RadioListTile<String>(
              title: const Text('Livraison par un chauffeur MOVA'),
              value: 'MOVA_DRIVER',
              groupValue: _logisticsMode,
              onChanged: (v) => setState(() => _logisticsMode = v!),
              contentPadding: EdgeInsets.zero,
            ),
            if (_logisticsMode == 'PASSENGER_DRIVER') ...[
              TextField(
                controller: _passengerDriverNameController,
                decoration: const InputDecoration(labelText: 'Nom du chauffeur (optionnel)'),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: _passengerDriverPhoneController,
                keyboardType: TextInputType.phone,
                decoration: const InputDecoration(labelText: 'Téléphone du chauffeur *'),
              ),
            ],
            if (_step == 2) ...[
              TextField(
                controller: _pickupController,
                decoration: const InputDecoration(labelText: 'Adresse de prise en charge'),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: _phoneController,
                keyboardType: TextInputType.phone,
                decoration: const InputDecoration(labelText: 'Téléphone'),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: _notesController,
                maxLines: 2,
                decoration: const InputDecoration(labelText: 'Notes (optionnel)'),
              ),
            ],
            if (_quote != null) ...[
              const SizedBox(height: 16),
              MovaCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Total estimé', style: theme.textTheme.titleSmall),
                    Text(
                      MarketConfig.formatCdf(_quote!['totalCdf'] as int? ?? 0),
                      style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: MovaColors.green),
                    ),
                    if (_quote!['breakdown'] != null) ...[
                      const SizedBox(height: 8),
                      Text(
                        'Location : ${MarketConfig.formatCdf((_quote!['breakdown'] as Map)['rentalFeeCdf'] as int? ?? 0)}',
                        style: const TextStyle(fontSize: 12, color: MovaColors.textSecondary),
                      ),
                      if (((_quote!['breakdown'] as Map)['interCityFeeCdf'] as int? ?? 0) > 0)
                        Text(
                          'Inter-ville : ${MarketConfig.formatCdf((_quote!['breakdown'] as Map)['interCityFeeCdf'] as int)}',
                          style: const TextStyle(fontSize: 12, color: MovaColors.textSecondary),
                        ),
                    ],
                  ],
                ),
              ),
            ],
            if (_error != null) ...[
              const SizedBox(height: 12),
              MovaErrorBanner(message: _error!),
            ],
            const SizedBox(height: 16),
            MovaButton(
              label: _step == 2 ? 'Réserver maintenant' : 'Obtenir le devis',
              isLoading: _submitting,
              icon: _step == 2 ? Icons.check_circle_outline : Icons.receipt_long_outlined,
              onPressed: _submitting ? null : (_step == 2 ? _confirm : _fetchQuote),
            ),
          ],
        ],
      ),
    );
  }
}

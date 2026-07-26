import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:latlong2/latlong.dart';

import '../../core/api/api_client.dart';
import '../../core/error/result.dart';
import '../../core/location/location_service.dart';
import '../../core/location/service_area_location.dart';
import '../../core/location/service_areas.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';

const _categories = [
  ('MARKET', 'Marché'),
  ('HOSPITAL', 'Hôpital'),
  ('UNIVERSITY', 'Université'),
  ('PHARMACY', 'Pharmacie'),
  ('SCHOOL', 'École'),
  ('GOVERNMENT', 'Administration'),
  ('TRANSPORT', 'Transport'),
  ('OTHER', 'Autre'),
];

class SuggestPlaceScreen extends ConsumerStatefulWidget {
  const SuggestPlaceScreen({super.key});

  @override
  ConsumerState<SuggestPlaceScreen> createState() => _SuggestPlaceScreenState();
}

class _SuggestPlaceScreenState extends ConsumerState<SuggestPlaceScreen> {
  final _nameController = TextEditingController();
  final _addressController = TextEditingController();
  final _notesController = TextEditingController();
  String _category = 'OTHER';
  String _city = 'Kinshasa';
  LatLng? _coords;
  bool _loadingGps = false;
  bool _submitting = false;
  String? _error;
  List<Map<String, dynamic>> _mine = [];

  @override
  void initState() {
    super.initState();
    _loadMine();
  }

  @override
  void dispose() {
    _nameController.dispose();
    _addressController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _loadMine() async {
    final result = await ref.read(apiClientProvider).listMyPoiSuggestions();
    if (!mounted) return;
    if (result case Success(:final data)) {
      setState(() => _mine = data);
    }
  }

  Future<void> _useMyLocation() async {
    setState(() {
      _loadingGps = true;
      _error = null;
    });
    final loc = await LocationService.getCurrentLocation();
    if (!mounted) return;
    if (loc == null) {
      setState(() {
        _loadingGps = false;
        _error = 'Activez le GPS pour positionner le lieu.';
      });
      return;
    }
    setState(() {
      _coords = loc.position;
      _city = ServiceAreas.cityNameForCoords(loc.position);
      _loadingGps = false;
      if (_addressController.text.trim().isEmpty) {
        _addressController.text = loc.label;
      }
    });
  }

  Future<void> _submit() async {
    final name = _nameController.text.trim();
    if (name.length < 2) {
      setState(() => _error = 'Indiquez le nom du lieu.');
      return;
    }
    final coords = _coords;
    if (coords == null) {
      setState(() => _error = 'Positionnez le lieu (GPS ou coordonnées).');
      return;
    }
    if (!ServiceAreaLocation.isInBounds(coords)) {
      setState(() => _error = ServiceAreaLocation.outOfAreaMessage());
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });

    final result = await ref.read(apiClientProvider).submitPoiSuggestion(
      name: name,
      category: _category,
      lat: coords.latitude,
      lng: coords.longitude,
      city: _city,
      address: _addressController.text.trim().isEmpty ? null : _addressController.text.trim(),
      notes: _notesController.text.trim().isEmpty ? null : _notesController.text.trim(),
    );

    if (!mounted) return;
    switch (result) {
      case Success(:final data):
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(data['message']?.toString() ?? 'Suggestion envoyée.')),
        );
        _nameController.clear();
        _notesController.clear();
        setState(() {
          _submitting = false;
          _coords = null;
        });
        await _loadMine();
      case Failure(:final error):
        setState(() {
          _submitting = false;
          _error = error.message;
        });
    }
  }

  String _statusLabel(String? status) => switch (status) {
        'PENDING' => 'En attente',
        'APPROVED' => 'Publié',
        'REJECTED' => 'Refusé',
        _ => status ?? '—',
      };

  Color _statusColor(String? status) => switch (status) {
        'APPROVED' => MovaColors.green,
        'REJECTED' => MovaColors.orange,
        _ => MovaColors.violet,
      };

  @override
  Widget build(BuildContext context) {
    return MovaScreen(
      title: 'Suggérer un lieu',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'Proposez un marché, une pharmacie, un arrêt… Après validation par SENGA, le lieu apparaîtra dans la recherche d\'adresses.',
            style: TextStyle(color: MovaColors.textSecondary, fontSize: 14),
          ),
          const SizedBox(height: 16),
          if (_error != null) ...[
            MovaErrorBanner(message: _error!, onRetry: () => setState(() => _error = null)),
            const SizedBox(height: 12),
          ],
          TextField(
            controller: _nameController,
            decoration: const InputDecoration(
              labelText: 'Nom du lieu',
              hintText: 'Ex. Marché Gambela',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            value: _category,
            decoration: const InputDecoration(
              labelText: 'Catégorie',
              border: OutlineInputBorder(),
            ),
            items: _categories
                .map((c) => DropdownMenuItem(value: c.$1, child: Text(c.$2)))
                .toList(),
            onChanged: (v) {
              if (v != null) setState(() => _category = v);
            },
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            value: _city,
            decoration: const InputDecoration(
              labelText: 'Ville',
              border: OutlineInputBorder(),
            ),
            items: ServiceAreas.all
                .map((a) => DropdownMenuItem(value: a.name, child: Text(a.name)))
                .toList(),
            onChanged: (v) {
              if (v != null) setState(() => _city = v);
            },
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _addressController,
            decoration: const InputDecoration(
              labelText: 'Adresse (optionnel)',
              hintText: 'Rue, quartier…',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _notesController,
            decoration: const InputDecoration(
              labelText: 'Précisions (optionnel)',
              hintText: 'Horaires, repère visuel…',
              border: OutlineInputBorder(),
            ),
            maxLines: 2,
          ),
          const SizedBox(height: 12),
          MovaButton(
            label: _coords == null ? 'Utiliser ma position GPS' : 'Mettre à jour la position GPS',
            icon: Icons.my_location,
            isSecondary: true,
            isLoading: _loadingGps,
            onPressed: _loadingGps ? null : _useMyLocation,
          ),
          if (_coords != null) ...[
            const SizedBox(height: 8),
            Text(
              'Position : ${_coords!.latitude.toStringAsFixed(5)}, ${_coords!.longitude.toStringAsFixed(5)}',
              style: const TextStyle(fontSize: 12, color: MovaColors.textSecondary),
            ),
          ],
          const SizedBox(height: 16),
          MovaButton(
            label: 'Envoyer la suggestion',
            icon: Icons.place_outlined,
            isLoading: _submitting,
            onPressed: _submitting ? null : _submit,
          ),
          if (_mine.isNotEmpty) ...[
            const SizedBox(height: 24),
            const Text(
              'Mes suggestions',
              style: TextStyle(fontWeight: FontWeight.w600, fontSize: 16),
            ),
            const SizedBox(height: 8),
            ..._mine.map((s) {
              final status = s['status']?.toString();
              return Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: MovaCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              s['name']?.toString() ?? 'Lieu',
                              style: const TextStyle(fontWeight: FontWeight.w600),
                            ),
                          ),
                          Text(
                            _statusLabel(status),
                            style: TextStyle(color: _statusColor(status), fontWeight: FontWeight.w600, fontSize: 12),
                          ),
                        ],
                      ),
                      Text(
                        '${s['city'] ?? ''} · ${s['category'] ?? ''}',
                        style: const TextStyle(fontSize: 12, color: MovaColors.textSecondary),
                      ),
                      if (status == 'REJECTED' && s['rejectionReason'] != null)
                        Text(
                          s['rejectionReason'].toString(),
                          style: const TextStyle(fontSize: 12, color: MovaColors.orange),
                        ),
                    ],
                  ),
                ),
              );
            }),
          ],
        ],
      ),
    );
  }
}

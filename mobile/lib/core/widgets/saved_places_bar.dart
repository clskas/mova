import 'package:flutter/material.dart';
import 'package:latlong2/latlong.dart';

import '../location/saved_places_store.dart';
import '../theme/mova_colors.dart';

/// Puces Maison / Bureau / lieux nommés / récents GPS.
class SavedPlacesBar extends StatefulWidget {
  const SavedPlacesBar({
    super.key,
    required this.onSelected,
    this.assignableCoords,
    this.assignableLabel,
  });

  final void Function(SavedPlace place) onSelected;
  final LatLng? assignableCoords;
  final String? assignableLabel;

  @override
  State<SavedPlacesBar> createState() => _SavedPlacesBarState();
}

class _SavedPlacesBarState extends State<SavedPlacesBar> {
  List<SavedPlace> _places = [];
  SavedPlace? _home;
  SavedPlace? _work;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  Future<void> _reload() async {
    final home = await SavedPlacesStore.getHome();
    final work = await SavedPlacesStore.getWork();
    final chips = await SavedPlacesStore.chips();
    if (!mounted) return;
    setState(() {
      _home = home;
      _work = work;
      _places = chips;
    });
  }

  Future<void> _assignSlot(String kind) async {
    final coords = widget.assignableCoords;
    if (coords == null) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Placez d\'abord un pin ou choisissez une destination.'),
          ),
        );
      }
      return;
    }
    final label = widget.assignableLabel;
    if (kind == 'home') {
      await SavedPlacesStore.saveHome(coords.latitude, coords.longitude, address: label);
    } else {
      await SavedPlacesStore.saveWork(coords.latitude, coords.longitude, address: label);
    }
    await _reload();
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(kind == 'home' ? 'Maison enregistrée.' : 'Bureau enregistré.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          _slotChip(
            label: 'Maison',
            icon: Icons.home_outlined,
            place: _home,
            onAssign: () => _assignSlot('home'),
          ),
          _slotChip(
            label: 'Bureau',
            icon: Icons.work_outline,
            place: _work,
            onAssign: () => _assignSlot('work'),
          ),
          for (final place in _places.where((p) => p.kind != 'home' && p.kind != 'work'))
            Padding(
              padding: const EdgeInsets.only(right: 8, bottom: 8),
              child: ActionChip(
                avatar: Icon(
                  place.kind == 'recent' ? Icons.history : Icons.bookmark_outline,
                  size: 16,
                  color: MovaColors.violet,
                ),
                label: Text(place.name, overflow: TextOverflow.ellipsis),
                onPressed: () => widget.onSelected(place),
              ),
            ),
        ],
      ),
    );
  }

  Widget _slotChip({
    required String label,
    required IconData icon,
    required SavedPlace? place,
    required VoidCallback onAssign,
  }) {
    return Padding(
      padding: const EdgeInsets.only(right: 8, bottom: 8),
      child: GestureDetector(
        onLongPress: onAssign,
        child: ActionChip(
          avatar: Icon(icon, size: 16, color: MovaColors.green),
          label: Text(place == null ? '$label · définir' : label),
          onPressed: place != null ? () => widget.onSelected(place) : onAssign,
        ),
      ),
    );
  }
}

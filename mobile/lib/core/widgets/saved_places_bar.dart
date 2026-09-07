import 'package:flutter/material.dart';

import '../location/saved_places_store.dart';
import '../theme/mova_colors.dart';

/// Puces lieux nommés / récents GPS (sans Maison / Bureau).
class SavedPlacesBar extends StatefulWidget {
  const SavedPlacesBar({
    super.key,
    required this.onSelected,
  });

  final void Function(SavedPlace place) onSelected;

  @override
  State<SavedPlacesBar> createState() => _SavedPlacesBarState();
}

class _SavedPlacesBarState extends State<SavedPlacesBar> {
  List<SavedPlace> _places = [];

  @override
  void initState() {
    super.initState();
    _reload();
  }

  Future<void> _reload() async {
    final chips = await SavedPlacesStore.chips();
    if (!mounted) return;
    setState(() {
      _places = chips.where((p) => p.kind != 'home' && p.kind != 'work').toList();
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_places.isEmpty) return const SizedBox.shrink();
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          for (final place in _places)
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
}

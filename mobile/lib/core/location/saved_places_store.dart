import 'dart:convert';

import 'package:latlong2/latlong.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../cache/unified_history_cache.dart';
import '../storage/local_cache.dart';

/// Maison, Bureau, lieux nommés et récents GPS (historique de courses).
class SavedPlace {
  const SavedPlace({
    required this.id,
    required this.name,
    required this.kind,
    required this.lat,
    required this.lng,
    this.address,
  });

  final String id;
  final String name;
  final String kind; // home | work | named | recent
  final double lat;
  final double lng;
  final String? address;

  LatLng get coords => LatLng(lat, lng);

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'kind': kind,
        'lat': lat,
        'lng': lng,
        if (address != null) 'address': address,
      };

  factory SavedPlace.fromJson(Map<String, dynamic> json) {
    return SavedPlace(
      id: json['id']?.toString() ?? '',
      name: json['name']?.toString() ?? 'Lieu',
      kind: json['kind']?.toString() ?? 'named',
      lat: (json['lat'] as num?)?.toDouble() ?? 0,
      lng: (json['lng'] as num?)?.toDouble() ?? 0,
      address: json['address']?.toString(),
    );
  }

  Map<String, dynamic> toSuggestion() => {
        'label': name,
        'address': address ?? name,
        'lat': lat,
        'lng': lng,
        'source': 'poi',
        'catalogSource': 'USER',
      };
}

class SavedPlacesStore {
  SavedPlacesStore._();

  static const homeKey = 'mova_saved_place_home';
  static const workKey = 'mova_saved_place_work';
  static const namedKey = 'mova_saved_places_named';

  static Future<SavedPlace?> getHome() => _readSlot(homeKey);
  static Future<SavedPlace?> getWork() => _readSlot(workKey);

  static Future<void> saveHome(double lat, double lng, {String? address}) {
    return _writeSlot(
      homeKey,
      SavedPlace(
        id: 'home',
        name: 'Maison',
        kind: 'home',
        lat: lat,
        lng: lng,
        address: address,
      ),
    );
  }

  static Future<void> saveWork(double lat, double lng, {String? address}) {
    return _writeSlot(
      workKey,
      SavedPlace(
        id: 'work',
        name: 'Bureau',
        kind: 'work',
        lat: lat,
        lng: lng,
        address: address,
      ),
    );
  }

  static Future<List<SavedPlace>> namedPlaces() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(namedKey);
    if (raw == null || raw.isEmpty) return [];
    final list = jsonDecode(raw) as List;
    return list
        .whereType<Map>()
        .map((e) => SavedPlace.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  static Future<void> saveNamed({
    required String name,
    required double lat,
    required double lng,
    String? address,
  }) async {
    final trimmed = name.trim();
    if (trimmed.length < 2) return;
    final existing = await namedPlaces();
    final next = [
      SavedPlace(
        id: 'named-${DateTime.now().millisecondsSinceEpoch}',
        name: trimmed,
        kind: 'named',
        lat: lat,
        lng: lng,
        address: address ?? trimmed,
      ),
      ...existing.where((p) => p.name.toLowerCase() != trimmed.toLowerCase()),
    ].take(20).toList();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(namedKey, jsonEncode(next.map((p) => p.toJson()).toList()));
  }

  /// Pins / destinations GPS déjà utilisés (historique unifié + cache courses).
  static Future<List<SavedPlace>> recentsFromHistory() async {
    final items = <Map<String, dynamic>>[];
    final unified = await UnifiedHistoryCache.load();
    for (final raw in unified.data) {
      if (raw is Map) items.add(Map<String, dynamic>.from(raw));
    }
    items.addAll(await LocalCache().getRideHistory());

    final seen = <String>{};
    final out = <SavedPlace>[];
    for (final item in items) {
      final meta = item['meta'] is Map
          ? Map<String, dynamic>.from(item['meta'] as Map)
          : item;
      final lat = (meta['dropoffLat'] as num?)?.toDouble() ??
          (item['dropoffLat'] as num?)?.toDouble();
      final lng = (meta['dropoffLng'] as num?)?.toDouble() ??
          (item['dropoffLng'] as num?)?.toDouble();
      if (lat == null || lng == null) continue;
      final key = '${lat.toStringAsFixed(4)},${lng.toStringAsFixed(4)}';
      if (seen.contains(key)) continue;
      seen.add(key);
      final name = meta['dropoffAddress']?.toString() ??
          item['dropoffAddress']?.toString() ??
          item['title']?.toString() ??
          'Récent';
      if (name.trim().isEmpty) continue;
      out.add(
        SavedPlace(
          id: 'recent-$key',
          name: name.trim(),
          kind: 'recent',
          lat: lat,
          lng: lng,
          address: name.trim(),
        ),
      );
      if (out.length >= 6) break;
    }
    return out;
  }

  static Future<List<SavedPlace>> chips() async {
    final home = await getHome();
    final work = await getWork();
    final named = await namedPlaces();
    final recents = await recentsFromHistory();
    return [
      if (home != null) home,
      if (work != null) work,
      ...named.take(4),
      ...recents.take(4),
    ];
  }

  /// Suggestions locales : le catalogue utilisateur passe avant le mock Mapbox.
  static List<Map<String, dynamic>> autocomplete(
    String query,
    List<SavedPlace> places,
  ) {
    final q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    final matches = places.where((p) {
      final name = p.name.toLowerCase();
      final address = (p.address ?? '').toLowerCase();
      return name.contains(q) || address.contains(q);
    }).map((p) => p.toSuggestion());
    return rankUserCatalogFirst([...matches]);
  }

  static List<Map<String, dynamic>> rankUserCatalogFirst(
    List<Map<String, dynamic>> items,
  ) {
    final user = items.where((i) => i['catalogSource']?.toString() == 'USER').toList();
    final rest = items.where((i) => i['catalogSource']?.toString() != 'USER').toList();
    return [...user, ...rest];
  }

  static Future<SavedPlace?> _readSlot(String key) async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(key);
    if (raw == null || raw.isEmpty) return null;
    return SavedPlace.fromJson(jsonDecode(raw) as Map<String, dynamic>);
  }

  static Future<void> _writeSlot(String key, SavedPlace place) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(key, jsonEncode(place.toJson()));
  }
}

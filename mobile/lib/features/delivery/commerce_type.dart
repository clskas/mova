import 'package:flutter/material.dart';

import '../../core/theme/mova_colors.dart';

/// Partner store verticals exposed on `/deliveries/restaurants` as `commerceType`.
abstract final class CommerceTypes {
  static const restaurant = 'RESTAURANT';
  static const supermarket = 'SUPERMARKET';
  static const pharmacy = 'PHARMACY';
  static const boutique = 'BOUTIQUE';

  static const all = <String>[
    restaurant,
    supermarket,
    pharmacy,
    boutique,
  ];

  static String normalize(dynamic raw) {
    final value = raw?.toString().trim().toUpperCase() ?? '';
    if (all.contains(value)) return value;
    return restaurant;
  }

  static String labelFr(String? type) {
    switch (normalize(type)) {
      case supermarket:
        return 'Supermarché';
      case pharmacy:
        return 'Pharmacie';
      case boutique:
        return 'Boutique';
      case restaurant:
      default:
        return 'Restaurant';
    }
  }

  /// Singular noun for user-facing copy when type is known.
  static String storeNoun(String? type, {bool plural = false}) {
    switch (normalize(type)) {
      case supermarket:
        return plural ? 'supermarchés' : 'supermarché';
      case pharmacy:
        return plural ? 'pharmacies' : 'pharmacie';
      case boutique:
        return plural ? 'boutiques' : 'boutique';
      case restaurant:
        return plural ? 'restaurants' : 'restaurant';
      default:
        return plural ? 'magasins' : 'magasin';
    }
  }

  /// Soft generic when type is mixed / unknown (lists, empty states).
  static String storesNoun({String? filterType, bool plural = true}) {
    if (filterType != null && filterType.trim().isNotEmpty) {
      return storeNoun(filterType, plural: plural);
    }
    return plural ? 'magasins' : 'magasin';
  }

  static String catalogNoun(String? type) {
    return normalize(type) == restaurant ? 'Menu' : 'Catalogue';
  }

  static String itemNoun(String? type, {bool plural = false}) {
    if (normalize(type) == restaurant) {
      return plural ? 'plats' : 'plat';
    }
    return plural ? 'articles' : 'article';
  }

  static IconData icon(String? type) {
    switch (normalize(type)) {
      case supermarket:
        return Icons.local_grocery_store_outlined;
      case pharmacy:
        return Icons.local_pharmacy_outlined;
      case boutique:
        return Icons.checkroom_outlined;
      case restaurant:
      default:
        return Icons.restaurant;
    }
  }

  static Color badgeColor(String? type) {
    switch (normalize(type)) {
      case supermarket:
        return MovaColors.orange;
      case pharmacy:
        return const Color(0xFF0D9488);
      case boutique:
        return MovaColors.violet;
      case restaurant:
      default:
        return MovaColors.green;
    }
  }

  /// Chip filters shown on the passenger discovery list (French labels).
  static const filterChips = <({String? value, String label})>[
    (value: null, label: 'Tous'),
    (value: restaurant, label: 'Restaurants'),
    (value: supermarket, label: 'Supermarchés'),
    (value: pharmacy, label: 'Pharmacies'),
    (value: boutique, label: 'Boutiques'),
  ];
}

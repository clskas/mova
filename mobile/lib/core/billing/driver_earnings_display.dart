import '../config/market_config.dart';

/// Affichage cohérent des revenus chauffeur (net après commission MOVA).
/// Le chauffeur ne voit jamais le montant total payé par le passager.
class DriverEarningsDisplay {
  DriverEarningsDisplay._();

  static int? netFromMap(Map<String, dynamic> data) {
    final net = data['driverNetCdf'] ?? data['displayAmountCdf'];
    if (net is num && net > 0) return net.round();
    return null;
  }

  static int? grossFromMap(Map<String, dynamic> data) {
    final gross = data['driverGrossCdf'] ??
        data['priceCdf'] ??
        data['estimatedFareCdf'] ??
        data['estimatedPriceCdf'] ??
        data['finalFareCdf'];
    if (gross is num && gross > 0) return gross.round();
    return null;
  }

  static String formatNet(Map<String, dynamic> data) {
    final net = netFromMap(data);
    if (net != null) return MarketConfig.formatCdf(net);
    return '—';
  }

  static String netLabel({int? net}) {
    if (net == null) return 'Revenu net indisponible';
    return 'Votre revenu net (après commission MOVA)';
  }

  static String deliveryNetLabel({
    required Map<String, dynamic> data,
    String? type,
  }) =>
      serviceNetLabel(data: data, type: type);

  static String serviceNetLabel({
    required Map<String, dynamic> data,
    String? type,
  }) {
    final net = netFromMap(data);
    if (net == null) return 'Revenu net indisponible';
    final normalized = type?.toUpperCase() ?? data['type']?.toString().toUpperCase();
    return switch (normalized) {
      'FOOD' => 'Gain livraison repas (frais de course uniquement)',
      'ERRAND' => 'Revenu net (course + remboursement achats)',
      'MOVING' => 'Revenu net déménagement',
      'CARPOOL' => 'Gain sur les places réservées',
      'RENTAL' => 'Rémunération logistique MOVA',
      'SCHEDULED' => 'Revenu net course planifiée',
      'PARCEL' || 'EXPRESS' || 'DELIVERY' => 'Revenu net livraison',
      _ => netLabel(net: net),
    };
  }

  static String activityTypeLabel(String? type) {
    return switch (type?.toUpperCase()) {
      'RIDE' => 'Course',
      'DELIVERY' => 'Livraison',
      'ERRAND' => 'Courses & commissions',
      'MOVING' => 'Déménagement',
      'RENTAL' => 'Location logistique',
      'CARPOOL' => 'Covoiturage',
      'SCHEDULED' => 'Course planifiée',
      _ => 'Mission',
    };
  }
}

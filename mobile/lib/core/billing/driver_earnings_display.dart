import '../config/market_config.dart';
import '../../core/i18n/i18n.dart';

/// Affichage cohérent des revenus chauffeur (net après commission SENGA).
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
    if (net == null) return tr('Revenu net indisponible');
    return tr('Votre revenu net (après commission SENGA)');
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
    if (net == null) return tr('Revenu net indisponible');
    final normalized = type?.toUpperCase() ?? data['type']?.toString().toUpperCase();
    return switch (normalized) {
      'FOOD' => tr('Gain livraison repas (frais de course uniquement)'),
      'ERRAND' => tr('Revenu net (course + remboursement achats)'),
      'MOVING' => tr('Revenu net déménagement'),
      'CARPOOL' => tr('Gain sur les places réservées'),
      'RENTAL' => tr('Rémunération logistique SENGA'),
      'SCHEDULED' => tr('Revenu net course planifiée'),
      'PARCEL' || 'EXPRESS' || 'DELIVERY' => tr('Revenu net livraison'),
      _ => netLabel(net: net),
    };
  }

  static String activityTypeLabel(String? type) {
    return switch (type?.toUpperCase()) {
      'RIDE' => tr('Course'),
      'DELIVERY' => tr('Livraison'),
      'ERRAND' => tr('Courses & commissions'),
      'MOVING' => tr('Déménagement'),
      'RENTAL' => tr('Location logistique'),
      'CARPOOL' => tr('Covoiturage'),
      'SCHEDULED' => tr('Course planifiée'),
      _ => tr('Mission'),
    };
  }
}

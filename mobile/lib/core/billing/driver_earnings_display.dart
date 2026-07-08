import '../config/market_config.dart';

/// Affichage cohérent des revenus chauffeur (net après commission MOVA).
class DriverEarningsDisplay {
  DriverEarningsDisplay._();

  static int? netFromMap(Map<String, dynamic> data) {
    final net = data['driverNetCdf'];
    if (net is num && net > 0) return net.round();
    return null;
  }

  static int? grossFromMap(Map<String, dynamic> data) {
    final gross = data['priceCdf'] ??
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

  static String netLabel({int? net, int? gross}) {
    if (net == null) return 'Revenu net indisponible';
    if (gross != null && net < gross) {
      return 'Votre revenu net (course ${MarketConfig.formatCdf(gross)} pour le passager)';
    }
    return 'Votre revenu net (après commission MOVA)';
  }

  /// Libellé contextuel livraison — le livreur ne voit que sa part, pas le panier client.
  static String deliveryNetLabel({
    required Map<String, dynamic> data,
    String? type,
    int? passengerTotal,
  }) => serviceNetLabel(data: data, type: type, passengerTotal: passengerTotal);

  /// Libellé revenu net pour tout service MOVA.
  static String serviceNetLabel({
    required Map<String, dynamic> data,
    String? type,
    int? passengerTotal,
  }) {
    final net = netFromMap(data);
    if (net == null) return 'Revenu net indisponible';
    final normalized = type?.toUpperCase();
    final clientTotal = passengerTotal ?? data['passengerTotalCdf'] as int? ?? grossFromMap(data);
    if (normalized == 'FOOD') {
      if (clientTotal != null && clientTotal > 0) {
        return 'Votre gain livraison (client : ${MarketConfig.formatCdf(clientTotal)} au total)';
      }
      return 'Votre gain sur les frais de livraison uniquement';
    }
    if (normalized == 'ERRAND') {
      return 'Votre revenu net (course + remboursement achats)';
    }
    if (normalized == 'MOVING') {
      if (clientTotal != null && clientTotal > 0) {
        return 'Votre revenu net (devis ${MarketConfig.formatCdf(clientTotal)} pour le client)';
      }
      return 'Votre revenu net (après commission MOVA)';
    }
    if (normalized == 'CARPOOL') {
      return 'Votre gain sur les places réservées';
    }
    if (normalized == 'RENTAL') {
      if (clientTotal != null && clientTotal > 0) {
        return 'Votre rémunération logistique (location ${MarketConfig.formatCdf(clientTotal)} pour le client)';
      }
      return 'Votre rémunération logistique MOVA';
    }
    if (normalized == 'SCHEDULED' || normalized == 'RIDE') {
      return netLabel(net: net, gross: clientTotal);
    }
    final gross = data['driverGrossCdf'] as int? ?? grossFromMap(data);
    if (gross != null && net < gross) {
      return 'Votre revenu net (livraison ${MarketConfig.formatCdf(gross)} pour le client)';
    }
    return netLabel(net: net, gross: gross);
  }
}

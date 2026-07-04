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
}

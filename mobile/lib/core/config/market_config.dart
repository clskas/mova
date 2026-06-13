/// Configuration marché RDC — couverture nationale, Kinshasa par défaut.
class MarketConfig {
  static const country = 'CD';
  static const currency = 'CDF';
  static const currencySymbol = 'FC';
  static const phonePrefix = '+243';
  static const defaultCity = 'Kinshasa';
  static const timezone = 'Africa/Kinshasa';
  static const locale = 'fr_CD';

  static const defaultLat = -4.3217;
  static const defaultLng = 15.3125;

  /// Passerelle API unique (microservices). Définir via `--dart-define=API_URL=...`
  /// Ex. émulateur Android : `http://10.0.2.2:3000/api`, appareil/simulateur iOS : `http://localhost:3000/api`
  static const apiBaseUrl = String.fromEnvironment(
    'API_URL',
    defaultValue: 'http://10.0.2.2:3000/api',
  );

  /// Racine passerelle (sans `/api`) — health check et WebSocket GPS via ride-service.
  static String get gatewayBaseUrl {
    const suffix = '/api';
    if (apiBaseUrl.endsWith(suffix)) {
      return apiBaseUrl.substring(0, apiBaseUrl.length - suffix.length);
    }
    return apiBaseUrl;
  }

  static String get wsUrl => gatewayBaseUrl;

  static const mobileMoneyProviders = [
    MobileMoneyProvider(id: 'ORANGE_MONEY', name: 'Orange Money', color: 0xFFFF6600),
    MobileMoneyProvider(id: 'MPESA', name: 'M-Pesa (Vodacom)', color: 0xFFE60000),
    MobileMoneyProvider(id: 'AIRTEL_MONEY', name: 'Airtel Money', color: 0xFFED1C24),
  ];

  static const vehicleTypes = [
    VehicleTypeOption(id: 'MOTO_TAXI', label: 'Moto-taxi', icon: '🏍️'),
    VehicleTypeOption(id: 'STANDARD', label: 'Standard', icon: '🚗'),
    VehicleTypeOption(id: 'COMFORT', label: 'Confort', icon: '✨'),
    VehicleTypeOption(id: 'VIP', label: 'VIP', icon: '👑'),
  ];

  /// VIP n'existe pas côté API — mappe vers COMFORT pour les appels backend.
  static String apiVehicleType(String uiType) =>
      uiType == 'VIP' ? 'COMFORT' : uiType;

  static const kinshasaCommunes = [
    'Bandalungwa',
    'Barumbu',
    'Bumbu',
    'Gombe',
    'Kalamu',
    'Kasa-Vubu',
    'Kimbanseke',
    'Kinshasa',
    'Kintambo',
    'Kisenso',
    'Lemba',
    'Limete',
    'Lingwala',
    'Makala',
    'Maluku',
    'Masina',
    'Matete',
    'Mont-Ngafula',
    'Ndjili',
    'Ngaba',
    'Ngaliema',
    'Ngiri-Ngiri',
    'Nsele',
    'Selembao',
  ];

  static String formatCdf(int amount) {
    final formatted = amount.toString().replaceAllMapped(
      RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'),
      (m) => '${m[1]} ',
    );
    return '$formatted FC';
  }

  static bool validatePhone(String phone) {
    final cleaned = phone.replaceAll(' ', '');
    return RegExp(r'^\+243[0-9]{9}$').hasMatch(cleaned);
  }

  static String normalizePhone(String phone) {
    final cleaned = phone.replaceAll(' ', '');
    if (cleaned.startsWith('0')) return '+243${cleaned.substring(1)}';
    if (cleaned.startsWith('243')) return '+$cleaned';
    return cleaned;
  }
}

class MobileMoneyProvider {
  const MobileMoneyProvider({
    required this.id,
    required this.name,
    required this.color,
  });
  final String id;
  final String name;
  final int color;
}

class VehicleTypeOption {
  const VehicleTypeOption({
    required this.id,
    required this.label,
    required this.icon,
  });
  final String id;
  final String label;
  final String icon;
}

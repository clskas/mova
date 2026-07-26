/// Configuration marché RDC — couverture nationale (32 zones SENGA).
class MarketConfig {
  static const country = 'CD';
  static const currency = 'CDF';
  static const currencySymbol = 'FC';
  static const phonePrefix = '+243';
  static const coverageLabel = 'RDC';
  static const timezone = 'Africa/Kinshasa';
  static const locale = 'fr_CD';

  /// Centre carte RDC — fallback technique uniquement (pas de ville imposée).
  static const mapCenterLat = -2.88;
  static const mapCenterLng = 23.66;

  /// Emprise approximative du territoire RDC (couverture nationale).
  static const rdcMinLat = -13.6;
  static const rdcMaxLat = 5.6;
  static const rdcMinLng = 12.0;
  static const rdcMaxLng = 31.5;

  static bool isInDrcTerritory(double lat, double lng) =>
      lat >= rdcMinLat && lat <= rdcMaxLat && lng >= rdcMinLng && lng <= rdcMaxLng;

  /// Alias technique — centre carte RDC (pas Kinshasa).
  static const defaultLat = mapCenterLat;
  static const defaultLng = mapCenterLng;

  /// Passerelle API unique (microservices). Définir via `--dart-define=API_URL=...`
  /// Ex. émulateur Android : `http://10.0.2.2:3000/api`, appareil/simulateur iOS : `http://localhost:3000/api`
  static const apiBaseUrl = String.fromEnvironment(
    'API_URL',
    defaultValue: 'http://10.0.2.2:3000/api',
  );

  /// Secours dev (ex. IP LAN si `adb reverse` USB est inactif).
  static const apiFallbackUrl = String.fromEnvironment(
    'API_FALLBACK_URL',
    defaultValue: '',
  );

  /// URL API active après bascule automatique (health check).
  static String? _runtimeApiBaseUrl;

  static void applyRuntimeApiBase(String apiBase) {
    final trimmed = apiBase.trim();
    if (trimmed.isEmpty) return;
    _runtimeApiBaseUrl = trimmed;
  }

  static void clearRuntimeApiBase() {
    _runtimeApiBaseUrl = null;
  }

  static String get effectiveApiBaseUrl => _runtimeApiBaseUrl ?? apiBaseUrl;

  /// Racine passerelle (sans `/api`) — health check et WebSocket GPS via ride-service.
  static String get gatewayBaseUrl => _gatewayFromApi(apiBaseUrl);

  static String get effectiveGatewayBaseUrl =>
      _gatewayFromApi(effectiveApiBaseUrl);

  static String _gatewayFromApi(String apiUrl) {
    const suffix = '/api';
    if (apiUrl.endsWith(suffix)) {
      return apiUrl.substring(0, apiUrl.length - suffix.length);
    }
    return apiUrl;
  }

  static List<String> get gatewayProbeBases {
    final bases = <String>[gatewayBaseUrl];
    if (apiFallbackUrl.isNotEmpty) {
      final fallback = _gatewayFromApi(apiFallbackUrl);
      if (!bases.contains(fallback)) bases.add(fallback);
    }
    final active = effectiveGatewayBaseUrl;
    if (!bases.contains(active)) bases.insert(0, active);
    return bases;
  }

  /// URL absolue pour afficher une photo uploadée (`/api/uploads/...` ou URL complète).
  static String resolveMediaUrl(String url) {
    final trimmed = url.trim();
    if (trimmed.isEmpty) return trimmed;
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
    if (trimmed.startsWith('/')) return '${effectiveGatewayBaseUrl}$trimmed';
    return '${effectiveGatewayBaseUrl}/api/uploads/vehicles/$trimmed';
  }

  /// WebSocket (`/tracking` via api-gateway). Définir via `--dart-define=WS_URL=...`
  /// Par défaut : même hôte que [gatewayBaseUrl] (port 3000, pas ride-service direct).
  static String get wsUrl {
    const fromEnv = String.fromEnvironment('WS_URL', defaultValue: '');
    if (_runtimeApiBaseUrl != null) return effectiveGatewayBaseUrl;
    if (fromEnv.isNotEmpty) return fromEnv;
    return gatewayBaseUrl;
  }

  static String get effectiveWsUrl => wsUrl;

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

  /// Alias UI / contrat mobile → enum Prisma ride-service (`MOTO_TAXI`, `COMFORT`, …).
  static String apiVehicleType(String uiType) {
    switch (uiType.toUpperCase()) {
      case 'MOTO':
        return 'MOTO_TAXI';
      case 'CONFORT':
        return 'COMFORT';
      default:
        return uiType;
    }
  }

  static const kinshasaDistricts = [
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

import 'package:flutter/foundation.dart';

/// Configuration marché RDC — couverture nationale (32 zones SENGA).
class MarketConfig {
  static const country = 'CD';
  static const currency = 'CDF';
  static const currencySymbol = 'FC';
  static const phonePrefix = '+243';
  static const coverageLabel = 'RDC';
  static const timezone = 'Africa/Kinshasa';
  static const locale = 'fr_CD';

  /// Passerelle production (domaine custom). Les builds release doivent toujours aboutir ici.
  static const productionApiUrl = 'https://api.afri-soft.com/api';
  static const productionWsUrl = 'https://api.afri-soft.com';

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

  /// Web OAuth client ID (Google Cloud). Required as `serverClientId` so Android
  /// returns an ID token the backend can verify. Same value as `GOOGLE_CLIENT_ID`.
  ///
  /// Android OAuth clients (Play / Cloud Console) — SHA-1 of the upload keystore:
  /// `keytool -list -v -keystore <upload.jks> -alias <alias>`
  /// Packages: `cd.mova.mova.passenger`, `cd.mova.mova.driver`.
  /// `--dart-define=GOOGLE_SERVER_CLIENT_ID=....apps.googleusercontent.com`
  ///
  /// Must be the **Web** OAuth client (same as Render `GOOGLE_CLIENT_ID`).
  /// Android OAuth clients stay in Google Cloud (package + SHA-1) and on
  /// Render (`GOOGLE_ANDROID_CLIENT_ID` / `_DRIVER`) — not in this binary.
  static const googleServerClientId = String.fromEnvironment(
    'GOOGLE_SERVER_CLIENT_ID',
    defaultValue: '58917716638-rbgibno8pdvlud8dd00pdfjdv3q1dh4k.apps.googleusercontent.com',
  );

  /// `--dart-define=API_URL=...` (vide = défaut selon mode).
  static const _apiFromEnv = String.fromEnvironment('API_URL', defaultValue: '');

  /// `--dart-define=WS_URL=...`
  static const _wsFromEnv = String.fromEnvironment('WS_URL', defaultValue: '');

  /// Secours dev uniquement (ex. IP LAN si `adb reverse` USB est inactif).
  static const _fallbackFromEnv = String.fromEnvironment(
    'API_FALLBACK_URL',
    defaultValue: '',
  );

  /// Hôte local / RFC1918 / émulateur — interdit en release.
  static bool isNonRoutableDevHost(String url) {
    final uri = Uri.tryParse(url.trim());
    if (uri == null || uri.host.isEmpty) return true;
    final host = uri.host.toLowerCase();
    if (host == 'localhost' ||
        host == '127.0.0.1' ||
        host == '10.0.2.2' ||
        host == '::1' ||
        host.endsWith('.local')) {
      return true;
    }
    if (host.startsWith('10.') || host.startsWith('192.168.')) return true;
    final m = RegExp(r'^172\.(\d+)\.').firstMatch(host);
    if (m != null) {
      final second = int.tryParse(m.group(1) ?? '') ?? -1;
      if (second >= 16 && second <= 31) return true;
    }
    return false;
  }

  static String _resolveApiBase(String fromEnv) {
    final raw = fromEnv.trim().isNotEmpty
        ? fromEnv.trim()
        : (kReleaseMode ? productionApiUrl : 'http://10.0.2.2:3000/api');
    if (kReleaseMode && isNonRoutableDevHost(raw)) {
      return productionApiUrl;
    }
    return raw;
  }

  /// Passerelle API unique (microservices). Définir via `--dart-define=API_URL=...`
  /// Debug : émulateur `http://10.0.2.2:3000/api` ou LAN via script.
  /// Release : force toujours une URL publique (Render) — jamais d'IP LAN.
  static String get apiBaseUrl => _resolveApiBase(_apiFromEnv);

  /// Secours dev (ignoré en release pour éviter une bascule vers le LAN).
  static String get apiFallbackUrl {
    if (kReleaseMode) return '';
    return _fallbackFromEnv.trim();
  }

  /// URL API active après bascule automatique (health check).
  static String? _runtimeApiBaseUrl;

  static void applyRuntimeApiBase(String apiBase) {
    final trimmed = apiBase.trim();
    if (trimmed.isEmpty) return;
    // Jamais basculer vers une IP privée en release (ex. APK debug résiduel / mauvais define).
    if (kReleaseMode && isNonRoutableDevHost(trimmed)) return;
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
  /// Par défaut : même hôte que [gatewayBaseUrl].
  static String get wsUrl {
    if (_runtimeApiBaseUrl != null) return effectiveGatewayBaseUrl;
    final fromEnv = _wsFromEnv.trim();
    if (fromEnv.isNotEmpty) {
      if (kReleaseMode && isNonRoutableDevHost(fromEnv)) {
        return productionWsUrl;
      }
      return fromEnv;
    }
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

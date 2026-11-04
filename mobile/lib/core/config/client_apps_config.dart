/// Helpers for `/public/client-config` payload (MM + passenger service tiles).

bool mmChannelEnabled(Object? rawOp, String channel) {
  if (rawOp == true) return true;
  if (rawOp == false) return false;
  if (rawOp is Map) {
    final v = rawOp[channel];
    if (v is bool) return v;
    // Legacy: any visible channel if key missing
    if (channel == 'topup') return rawOp['topup'] == true || rawOp['withdraw'] == true && rawOp['topup'] == null;
    return rawOp['withdraw'] == true;
  }
  return false;
}

bool mmOperatorEnabledFor(Object? appRow, String operatorId, String channel) {
  if (appRow is! Map) return false;
  return mmChannelEnabled(appRow[operatorId], channel);
}

bool passengerServiceVisible(Object? services, String id) {
  if (services is! Map) return true;
  final v = services[id];
  if (v is bool) return v;
  return true;
}

/// Admin switch « nombre de passagers » (courses voiture). Off unless explicitly true.
bool passengerCountFeatureEnabled(Object? features) =>
    features is Map && features['passengerCountEnabled'] == true;

/// Admin switch « gamme Familiale » (6–8 places). Off unless explicitly true.
bool familialeFeatureEnabled(Object? features) =>
    features is Map && features['familialeEnabled'] == true;

/// Mirrors @mova/shared passenger-seats (driver excluded).
const Map<String, int> kDefaultPassengerSeats = {
  'MOTO_TAXI': 1,
  'STANDARD': 4,
  'COMFORT': 4,
  'VIP': 4,
  'FAMILIALE': 6,
  'UTILITAIRE': 2,
  'CAMION': 2,
};
const int kMaxRidePassengerCount = 8;

/// Standard / Confort / VIP are 4-seat cars; 5+ passengers book the Familiale gamme.
const int kCarPassengerLimit = 4;

/// Gammes limited to [kCarPassengerLimit] passengers.
bool isFourSeatGamme(String vehicleType) =>
    vehicleType == 'STANDARD' || vehicleType == 'COMFORT' || vehicleType == 'VIP';

/// Seats a driver may declare: Familiale 5–8, truck 1–2, moto 1, other cars 1–8.
List<int> declarableSeats(String vehicleType) => switch (vehicleType) {
      'MOTO_TAXI' => const [1],
      'CAMION' => const [1, 2],
      'FAMILIALE' => const [5, 6, 7, 8],
      _ => const [1, 2, 3, 4, 5, 6, 7, 8],
    };

int defaultPassengerSeats(String vehicleType) => kDefaultPassengerSeats[vehicleType] ?? 4;

/// « 3 passagers » — null for a single passenger (nothing to show).
String? passengerCountLabel(Object? raw) {
  final n = raw is num ? raw.toInt() : int.tryParse(raw?.toString() ?? '');
  if (n == null || n <= 1) return null;
  return '$n passagers';
}

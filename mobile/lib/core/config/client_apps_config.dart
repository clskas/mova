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

/// Mirrors @mova/shared passenger-seats (driver excluded).
const Map<String, int> kDefaultPassengerSeats = {
  'MOTO_TAXI': 1,
  'STANDARD': 4,
  'COMFORT': 4,
  'VIP': 4,
  'UTILITAIRE': 2,
  'CAMION': 2,
};
const int kMaxRidePassengerCount = 8;

int defaultPassengerSeats(String vehicleType) => kDefaultPassengerSeats[vehicleType] ?? 4;

/// « 3 passagers » — null for a single passenger (nothing to show).
String? passengerCountLabel(Object? raw) {
  final n = raw is num ? raw.toInt() : int.tryParse(raw?.toString() ?? '');
  if (n == null || n <= 1) return null;
  return '$n passagers';
}

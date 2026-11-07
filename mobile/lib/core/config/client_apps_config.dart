import '../../core/i18n/i18n.dart';

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

/// Admin switch « gamme Tricycle » (tricycle à passagers). Off unless explicitly true.
bool tricycleFeatureEnabled(Object? features) =>
    features is Map && features['tricycleEnabled'] == true;

/// Mirrors @mova/shared passenger-seats (driver excluded).
final Map<String, int> kDefaultPassengerSeats = {
  'MOTO_TAXI': 1,
  'STANDARD': 4,
  'COMFORT': 4,
  'VIP': 4,
  'FAMILIALE': 6,
  'UTILITAIRE': 2,
  'CAMION': 2,
  'TRICYCLE': 3,
  'TRIPOTEUR': 1,
};
/// Seat limits — defaults, replaced by the values set in the admin (Services SENGA → Nombre de places).
int kMaxRidePassengerCount = 8;

/// Largest group in a Standard / Confort / VIP car; above it the app books the Familiale gamme.
int kCarPassengerLimit = 4;

/// A passenger tricycle carries at most this many people.
int kTricyclePassengerLimit = 3;

/// A Familiale vehicle carries this many passengers.
int kFamilialeMinSeats = 5;
int kFamilialeMaxSeats = 8;

/// Applies the seat limits from /public/client-config (`seatLimits`). Invalid values are ignored.
void applySeatLimits(Map<String, dynamic>? raw) {
  int pick(String key, int current, int min, int max) {
    final v = raw?[key];
    final n = v is num ? v.toInt() : int.tryParse(v?.toString() ?? '');
    return n == null || n < min || n > max ? current : n;
  }

  kCarPassengerLimit = pick('carMaxPassengers', kCarPassengerLimit, 1, 8);
  kFamilialeMaxSeats = pick('familialeMaxSeats', kFamilialeMaxSeats, 5, 20);
  kFamilialeMinSeats = pick('familialeMinSeats', kFamilialeMinSeats, 2, kFamilialeMaxSeats);
  kTricyclePassengerLimit = pick('tricycleMaxSeats', kTricyclePassengerLimit, 1, 10);
  kMaxRidePassengerCount = [kFamilialeMaxSeats, kCarPassengerLimit, kTricyclePassengerLimit].reduce((a, b) => a > b ? a : b);
  kDefaultPassengerSeats['FAMILIALE'] = kFamilialeMinSeats > 6 ? kFamilialeMinSeats : (kFamilialeMaxSeats < 6 ? kFamilialeMaxSeats : 6);
  kDefaultPassengerSeats['TRICYCLE'] = kTricyclePassengerLimit < 3 ? kTricyclePassengerLimit : 3;
}

/// Gammes limited to [kCarPassengerLimit] passengers.
bool isFourSeatGamme(String vehicleType) =>
    vehicleType == 'STANDARD' || vehicleType == 'COMFORT' || vehicleType == 'VIP';

List<int> _range(int from, int to) => [for (var i = from; i <= to; i++) i];

/// Seats a driver may declare (Familiale and tricycle ranges come from the admin).
List<int> declarableSeats(String vehicleType) => switch (vehicleType) {
      'MOTO_TAXI' => const [1],
      'CAMION' => const [1, 2],
      'FAMILIALE' => _range(kFamilialeMinSeats, kFamilialeMaxSeats),
      'TRICYCLE' => _range(1, kTricyclePassengerLimit),
      'TRIPOTEUR' => const [1],
      _ => _range(1, kFamilialeMaxSeats > 8 ? kFamilialeMaxSeats : 8),
    };

/// Largest number of vehicle photos (driver vehicle, rental vehicle).
const kMaxVehiclePhotos = 5;

/// Vehicle photos from an API map: `photoUrls`, or the legacy single `imageUrl`.
List<String> vehiclePhotosFrom(Map<String, dynamic>? vehicle) {
  final raw = vehicle?['photoUrls'];
  if (raw is List) {
    final list = raw.map((e) => e?.toString().trim() ?? '').where((u) => u.isNotEmpty).toSet().toList();
    if (list.isNotEmpty) return list.take(kMaxVehiclePhotos).toList();
  }
  final single = vehicle?['imageUrl']?.toString().trim() ?? '';
  return single.isEmpty ? <String>[] : [single];
}

/// Volume utile (m³) a utilitaire / camion may declare; null for other vehicles.
/// Same ranges as @mova/shared CARGO_VOLUME_RANGE_M3.
({int min, int max})? cargoVolumeRange(String vehicleType) => switch (vehicleType) {
      'UTILITAIRE' => (min: 1, max: 25),
      'CAMION' => (min: 5, max: 100),
      'TRIPOTEUR' => (min: 1, max: 4),
      _ => null,
    };

/// Error message for a cargo volume entry, or null when valid (or not needed).
String? validateCargoVolume(String vehicleType, String raw) {
  final range = cargoVolumeRange(vehicleType);
  if (range == null) return null;
  final n = int.tryParse(raw.trim());
  if (n == null) return tr('Indiquez le volume utile de votre véhicule (m³).');
  if (n < range.min || n > range.max) {
    return trf('Volume utile : entre {min} et {max} m³ pour ce véhicule.', {'min': range.min, 'max': range.max});
  }
  return null;
}

int defaultPassengerSeats(String vehicleType) => kDefaultPassengerSeats[vehicleType] ?? 4;

/// « 3 passagers » — null for a single passenger (nothing to show).
String? passengerCountLabel(Object? raw) {
  final n = raw is num ? raw.toInt() : int.tryParse(raw?.toString() ?? '');
  if (n == null || n <= 1) return null;
  return '$n passagers';
}

/// KYC documents that pre-fill the driver onboarding form (read by the server IA).
const kScannableDocTypes = {
  'ID_PHOTO',
  'DRIVERS_LICENSE',
  'VEHICLE_REGISTRATION',
  'VEHICLE_INSURANCE',
  'TECHNICAL_INSPECTION',
  'FISCAL_STICKER',
};

const _scannedFieldLabels = {
  'firstName': 'prénom',
  'lastName': 'nom',
  'idNumber': 'n° de pièce',
  'licenseNumber': 'n° de permis',
  'expiryDate': "date d'expiration",
  'plateNumber': 'plaque',
  'make': 'marque',
  'model': 'modèle',
  'color': 'couleur',
};

/// Fills the controllers that are still empty with the fields read from a document.
/// Expiry dates go to the controller of that document (`<TYPE>.expiryDate`).
/// Returns the French labels of the fields filled. Never overwrites what the driver typed.
List<String> applyScannedFields(
  String docType,
  Map<String, String> fields,
  Map<String, dynamic> targets,
) {
  final filled = <String>[];
  fields.forEach((field, value) {
    final v = value.trim();
    if (v.isEmpty) return;
    final key = field == 'expiryDate' ? '$docType.expiryDate' : field;
    final target = targets[key];
    if (target == null) return;
    final text = (target.text as String).trim();
    if (text.isNotEmpty) return;
    target.text = v;
    final labelFr = _scannedFieldLabels[field];
    final label = labelFr == null ? null : tr(labelFr);
    if (label != null) filled.add(label);
  });
  return filled;
}

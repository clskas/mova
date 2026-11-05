import 'package:geolocator/geolocator.dart';

/// Une seule demande d'autorisation de localisation à la fois.
///
/// iOS lève [PermissionRequestInProgressException] quand deux écrans (ex. :
/// démarrage + accueil chauffeur) demandent l'autorisation en même temps
/// (Sentry SENGA-MOBILE-4). Les appels simultanés partagent donc la même
/// demande, et si une demande lancée hors de ce point d'entrée est déjà en
/// cours, on relit simplement l'état de l'autorisation.
class LocationPermissionGate {
  LocationPermissionGate._();

  static Future<LocationPermission>? _inFlight;

  static Future<LocationPermission> request({
    Future<LocationPermission> Function()? requester,
    Future<LocationPermission> Function()? checker,
    Duration retryDelay = const Duration(seconds: 1),
  }) {
    final pending = _inFlight;
    if (pending != null) return pending;

    final future = _run(
      requester ?? Geolocator.requestPermission,
      checker ?? Geolocator.checkPermission,
      retryDelay,
    ).whenComplete(() => _inFlight = null);
    _inFlight = future;
    return future;
  }

  static Future<LocationPermission> _run(
    Future<LocationPermission> Function() requester,
    Future<LocationPermission> Function() checker,
    Duration retryDelay,
  ) async {
    try {
      return await requester();
    } on PermissionRequestInProgressException {
      await Future<void>.delayed(retryDelay);
      return checker();
    }
  }
}

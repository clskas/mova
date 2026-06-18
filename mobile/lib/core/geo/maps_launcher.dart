import 'package:url_launcher/url_launcher.dart';

/// Deep links Google Maps / navigation apps with lat/lng coordinates.
abstract final class MapsLauncher {
  static Uri googleMapsDirectionsUri({
    required double destinationLat,
    required double destinationLng,
    double? originLat,
    double? originLng,
    String travelMode = 'driving',
  }) {
    final params = <String, String>{
      'api': '1',
      'destination': '$destinationLat,$destinationLng',
      'travelmode': travelMode,
    };
    if (originLat != null && originLng != null) {
      params['origin'] = '$originLat,$originLng';
    }
    return Uri.https('www.google.com', '/maps/dir/', params);
  }

  /// Android turn-by-turn via Google Maps app (`google.navigation:`).
  static Uri googleNavigationUri({
    required double destinationLat,
    required double destinationLng,
    String travelMode = 'd',
  }) {
    return Uri.parse(
      'google.navigation:q=$destinationLat,$destinationLng&mode=$travelMode',
    );
  }

  static Uri googleMapsDaddrUri({
    required double destinationLat,
    required double destinationLng,
  }) {
    return Uri.https('maps.google.com', '/', {
      'daddr': '$destinationLat,$destinationLng',
      'dirflg': 'd',
    });
  }

  static Future<bool> _tryLaunch(Uri uri, LaunchMode mode) async {
    try {
      return await launchUrl(uri, mode: mode);
    } catch (_) {
      return false;
    }
  }

  static Future<bool> openDirections({
    required double destinationLat,
    required double destinationLng,
    double? originLat,
    double? originLng,
    String travelMode = 'driving',
  }) async {
    final webUri = googleMapsDirectionsUri(
      destinationLat: destinationLat,
      destinationLng: destinationLng,
      originLat: originLat,
      originLng: originLng,
      travelMode: travelMode,
    );
    final navUri = googleNavigationUri(
      destinationLat: destinationLat,
      destinationLng: destinationLng,
    );
    final daddrUri = googleMapsDaddrUri(
      destinationLat: destinationLat,
      destinationLng: destinationLng,
    );
    final geoUri = Uri.parse(
      'geo:$destinationLat,$destinationLng?q=$destinationLat,$destinationLng',
    );

    for (final entry in [
      (navUri, LaunchMode.externalNonBrowserApplication),
      (navUri, LaunchMode.externalApplication),
      (webUri, LaunchMode.externalApplication),
      (daddrUri, LaunchMode.externalApplication),
      (daddrUri, LaunchMode.platformDefault),
      (geoUri, LaunchMode.externalApplication),
      (geoUri, LaunchMode.platformDefault),
    ]) {
      if (await _tryLaunch(entry.$1, entry.$2)) return true;
    }
    return false;
  }
}

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

    if (await canLaunchUrl(navUri)) {
      return launchUrl(navUri, mode: LaunchMode.externalApplication);
    }
    if (await canLaunchUrl(webUri)) {
      return launchUrl(webUri, mode: LaunchMode.externalApplication);
    }
    return false;
  }
}

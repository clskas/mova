import 'package:flutter/material.dart';

/// Icônes PNG brandées pour les services MOVA Passager (écran d'accueil & splash).
class PassengerServiceIcon extends StatelessWidget {
  const PassengerServiceIcon._(this.asset, {this.size = 48});

  final String asset;
  final double size;

  static const taxiAsset = 'assets/services/taximoto.png';
  static const deliveryAsset = 'assets/services/livraison.png';
  static const scheduledAsset = 'assets/services/reservation_planifiee.png';
  static const carpoolAsset = 'assets/services/covoiturage.png';
  static const rentalAsset = 'assets/services/location_vehicule.png';
  static const movingAsset = 'assets/services/demenagement.png';

  factory PassengerServiceIcon.taxi({double size = 48}) =>
      PassengerServiceIcon._(taxiAsset, size: size);

  factory PassengerServiceIcon.delivery({double size = 48}) =>
      PassengerServiceIcon._(deliveryAsset, size: size);

  factory PassengerServiceIcon.scheduled({double size = 48}) =>
      PassengerServiceIcon._(scheduledAsset, size: size);

  factory PassengerServiceIcon.carpool({double size = 48}) =>
      PassengerServiceIcon._(carpoolAsset, size: size);

  factory PassengerServiceIcon.rental({double size = 48}) =>
      PassengerServiceIcon._(rentalAsset, size: size);

  factory PassengerServiceIcon.moving({double size = 48}) =>
      PassengerServiceIcon._(movingAsset, size: size);

  @override
  Widget build(BuildContext context) {
    final ratio = MediaQuery.devicePixelRatioOf(context);
    final cache = (size * ratio).round().clamp(48, 256);

    return Image.asset(
      asset,
      width: size,
      height: size,
      fit: BoxFit.contain,
      cacheWidth: cache,
      cacheHeight: cache,
      filterQuality: FilterQuality.medium,
    );
  }
}

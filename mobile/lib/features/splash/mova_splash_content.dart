import 'package:flutter/material.dart';

import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_service_icons.dart';
import '../../core/widgets/passenger_service_icons.dart';
import '../../core/i18n/i18n.dart';

class MovaSplashService {
  const MovaSplashService({
    required this.label,
    required this.description,
    required this.icon,
    required this.color,
    this.brandedIcon = false,
  });

  final String label;
  final String description;
  final Widget icon;
  final Color color;
  final bool brandedIcon;
}

/// Services passager — aligné sur l'écran d'accueil Senga.
final passengerSplashServices = <MovaSplashService>[
  MovaSplashService(
    label: tr('Taxi / Moto-taxi'),
    description: 'Course immédiate partout en RDC',
    icon: PassengerServiceIcon.taxi(size: 40),
    color: MovaColors.violet,
    brandedIcon: true,
  ),
  MovaSplashService(
    label: tr('Livraisons'),
    description: 'Repas, colis, express et commissions',
    icon: PassengerServiceIcon.delivery(size: 40),
    color: MovaColors.green,
    brandedIcon: true,
  ),
  MovaSplashService(
    label: tr('Réservation planifiée'),
    description: 'Programmez votre trajet à l\'avance',
    icon: PassengerServiceIcon.scheduled(size: 40),
    color: MovaColors.violetLight,
    brandedIcon: true,
  ),
  MovaSplashService(
    label: tr('Covoiturage'),
    description: 'Partagez un trajet, économisez',
    icon: PassengerServiceIcon.carpool(size: 40),
    color: MovaColors.midnightSoft,
    brandedIcon: true,
  ),
  MovaSplashService(
    label: tr('Location véhicule'),
    description: 'Voiture, SUV ou minibus',
    icon: PassengerServiceIcon.rental(size: 40),
    color: MovaColors.violet,
    brandedIcon: true,
  ),
  MovaSplashService(
    label: tr('Déménagement'),
    description: 'Camion et manutention',
    icon: PassengerServiceIcon.moving(size: 40),
    color: MovaColors.midnight,
    brandedIcon: true,
  ),
  MovaSplashService(
    label: tr('Wallet SENGA'),
    description: 'Solde, recharge et paiements',
    icon: MovaServiceIcon.wallet(color: Colors.white, size: 40),
    color: MovaColors.gold,
  ),
  MovaSplashService(
    label: tr('Historique'),
    description: 'Vos courses et transactions',
    icon: MovaServiceIcon.history(color: Colors.white, size: 40),
    color: MovaColors.orange,
  ),
];

/// Services chauffeur — aligné sur l'app SENGA Driver.
final driverSplashServices = <MovaSplashService>[
  MovaSplashService(
    label: tr('Courses'),
    description: 'Acceptez taxi et moto-taxi à proximité',
    icon: MovaServiceIcon.taxi(color: Colors.white, size: 40),
    color: MovaColors.violet,
  ),
  MovaSplashService(
    label: tr('Livraisons'),
    description: 'Colis, repas, express et courses',
    icon: MovaServiceIcon.parcel(color: Colors.white, size: 40),
    color: MovaColors.green,
  ),
  MovaSplashService(
    label: tr('Missions assignées'),
    description: 'Location, déménagement et trajets planifiés',
    icon: MovaServiceIcon.calendar(color: Colors.white, size: 40),
    color: MovaColors.violetLight,
  ),
  MovaSplashService(
    label: tr('Revenus'),
    description: 'Suivi des gains et paiements',
    icon: MovaServiceIcon.wallet(color: Colors.white, size: 40),
    color: MovaColors.gold,
  ),
  MovaSplashService(
    label: tr('Covoiturage'),
    description: 'Publiez et gérez vos trajets partagés',
    icon: MovaServiceIcon.carpool(color: Colors.white, size: 40),
    color: MovaColors.midnightSoft,
  ),
  MovaSplashService(
    label: tr('GPS & disponibilité'),
    description: 'Restez en ligne pour recevoir des offres',
    icon: MovaServiceIcon.location(color: Colors.white, size: 40),
    color: MovaColors.green,
  ),
  MovaSplashService(
    label: tr('Documents KYC'),
    description: 'Dossier chauffeur et conformité',
    icon: Icon(Icons.verified_user_outlined, color: Colors.white, size: 40),
    color: MovaColors.orange,
  ),
  MovaSplashService(
    label: tr('Historique missions'),
    description: 'Courses et livraisons effectuées',
    icon: MovaServiceIcon.history(color: Colors.white, size: 40),
    color: MovaColors.violet,
  ),
];

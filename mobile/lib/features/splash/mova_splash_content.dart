import 'package:flutter/material.dart';

import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_service_icons.dart';

class MovaSplashService {
  const MovaSplashService({
    required this.label,
    required this.description,
    required this.icon,
    required this.color,
  });

  final String label;
  final String description;
  final Widget icon;
  final Color color;
}

/// Services passager — aligné sur l'écran d'accueil MOVA Passager.
final passengerSplashServices = <MovaSplashService>[
  MovaSplashService(
    label: 'Taxi / Moto-taxi',
    description: 'Course immédiate partout en RDC',
    icon: MovaServiceIcon.taxi(color: Colors.white, size: 40),
    color: MovaColors.violet,
  ),
  MovaSplashService(
    label: 'Livraisons',
    description: 'Repas, colis, express et commissions',
    icon: MovaServiceIcon.parcel(color: Colors.white, size: 40),
    color: MovaColors.green,
  ),
  MovaSplashService(
    label: 'Réservation planifiée',
    description: 'Programmez votre trajet à l\'avance',
    icon: MovaServiceIcon.calendar(color: Colors.white, size: 40),
    color: MovaColors.violetLight,
  ),
  MovaSplashService(
    label: 'Covoiturage',
    description: 'Partagez un trajet, économisez',
    icon: MovaServiceIcon.carpool(color: Colors.white, size: 40),
    color: MovaColors.midnightSoft,
  ),
  MovaSplashService(
    label: 'Location véhicule',
    description: 'Voiture, SUV ou minibus',
    icon: MovaServiceIcon.rental(color: Colors.white, size: 40),
    color: MovaColors.violet,
  ),
  MovaSplashService(
    label: 'Déménagement',
    description: 'Camion et manutention',
    icon: MovaServiceIcon.moving(color: Colors.white, size: 40),
    color: MovaColors.midnight,
  ),
  MovaSplashService(
    label: 'Wallet MOVA',
    description: 'Solde, recharge et paiements',
    icon: MovaServiceIcon.wallet(color: Colors.white, size: 40),
    color: MovaColors.gold,
  ),
  MovaSplashService(
    label: 'Historique',
    description: 'Vos courses et transactions',
    icon: MovaServiceIcon.history(color: Colors.white, size: 40),
    color: MovaColors.orange,
  ),
];

/// Services chauffeur — aligné sur l'app MOVA Chauffeur.
final driverSplashServices = <MovaSplashService>[
  MovaSplashService(
    label: 'Courses',
    description: 'Acceptez taxi et moto-taxi à proximité',
    icon: MovaServiceIcon.taxi(color: Colors.white, size: 40),
    color: MovaColors.violet,
  ),
  MovaSplashService(
    label: 'Livraisons',
    description: 'Colis, repas, express et courses',
    icon: MovaServiceIcon.parcel(color: Colors.white, size: 40),
    color: MovaColors.green,
  ),
  MovaSplashService(
    label: 'Missions assignées',
    description: 'Location, déménagement et trajets planifiés',
    icon: MovaServiceIcon.calendar(color: Colors.white, size: 40),
    color: MovaColors.violetLight,
  ),
  MovaSplashService(
    label: 'Revenus',
    description: 'Suivi des gains et paiements',
    icon: MovaServiceIcon.wallet(color: Colors.white, size: 40),
    color: MovaColors.gold,
  ),
  MovaSplashService(
    label: 'Covoiturage',
    description: 'Publiez et gérez vos trajets partagés',
    icon: MovaServiceIcon.carpool(color: Colors.white, size: 40),
    color: MovaColors.midnightSoft,
  ),
  MovaSplashService(
    label: 'GPS & disponibilité',
    description: 'Restez en ligne pour recevoir des offres',
    icon: MovaServiceIcon.location(color: Colors.white, size: 40),
    color: MovaColors.green,
  ),
  MovaSplashService(
    label: 'Documents KYC',
    description: 'Dossier chauffeur et conformité',
    icon: Icon(Icons.verified_user_outlined, color: Colors.white, size: 40),
    color: MovaColors.orange,
  ),
  MovaSplashService(
    label: 'Historique missions',
    description: 'Courses et livraisons effectuées',
    icon: MovaServiceIcon.history(color: Colors.white, size: 40),
    color: MovaColors.violet,
  ),
];

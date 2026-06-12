# Manuel utilisateur MOVA — Kinshasa, RDC

## Introduction

MOVA est une application de mobilité urbaine pour Kinshasa. Les passagers réservent des courses en moto-taxi ou taxi ; les chauffeurs reçoivent des demandes et gèrent leurs revenus en francs congolais (CDF).

## Applications disponibles

| Application | Public | Accès |
|-------------|--------|-------|
| MOVA Passager (mobile) | Passagers | `flutter run -t lib/main_passenger.dart --dart-define=FLAVOR=passenger` |
| MOVA Chauffeur (mobile) | Chauffeurs | `flutter run -t lib/main_driver.dart --dart-define=FLAVOR=driver` |
| MOVA Web (PWA) | Passagers | http://localhost:3001 |
| MOVA Admin | Équipe interne | http://localhost:3002 |

## Première connexion (OTP)

1. Saisissez votre numéro au format **+243** suivi de 9 chiffres.
2. Recevez un code OTP par SMS.
3. En mode développement (backend avec `MOCK_OTP=true`), utilisez le code **123456**.

## Passager — Réserver une course

1. Ouvrez l'onglet **Carte** ou **Réserver**.
2. Indiquez votre destination (ex. Gombe, Limete, Masina).
3. Choisissez le type de véhicule (moto-taxi, standard, confort).
4. Consultez l'estimation en CDF et confirmez.
5. Suivez la course en temps réel sur la carte.
6. À la fin, notez votre chauffeur (1 à 5 étoiles).

## Passager — Portefeuille

- Consultez votre solde en CDF.
- Payez via Orange Money, M-Pesa, Airtel Money ou portefeuille MOVA.

## Chauffeur — Mise en service

1. Complétez votre **KYC** (permis, carte grise, photo d'identité).
2. Activez le commutateur **En ligne**.
3. Acceptez ou refusez les courses entrantes (délai 30 secondes).
4. Utilisez **Navigation** pour rejoindre le passager.

## Chauffeur — Revenus et retraits

- Consultez vos revenus journaliers, hebdomadaires et mensuels.
- Demandez un retrait vers mobile money (minimum 500 FC).

## Aide et documents légaux

Dans l'application : **Aide** → Manuel, CGU, Politique de confidentialité.

Support : WhatsApp +243 900 000 000 — support@mova.cd

## Mode hors-ligne

Si le serveur est indisponible, l'application affiche des données de démonstration et conserve l'historique des courses en cache local.

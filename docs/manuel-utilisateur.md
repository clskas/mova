# Manuel utilisateur MOVA — Kinshasa, RDC

## Introduction

MOVA est une plateforme de mobilité urbaine pour Kinshasa et la RDC. Réservez des courses, livrez des colis, commandez des repas, planifiez vos trajets et bien plus — le tout en francs congolais (CDF).

## Applications disponibles

| Application | Public | Accès |
|-------------|--------|-------|
| MOVA Passager (mobile) | Passagers | `flutter run --flavor passenger -t lib/main_passenger.dart` |
| MOVA Chauffeur (mobile) | Chauffeurs | `flutter run --flavor driver -t lib/main_driver.dart` |
| MOVA Web (PWA) | Passagers | http://localhost:3000 (web dev : port 3001) |
| MOVA Admin | Équipe interne | http://localhost:3002 (admin dev) |

**API Gateway :** http://localhost:3000 — toutes les requêtes passent par `/api/...`

## Première connexion (OTP)

1. Saisissez votre numéro au format **+243** suivi de 9 chiffres.
2. Recevez un code OTP par SMS.
3. En mode développement (`MOCK_OTP=true`), utilisez le code **123456**.

## Services passager

### Taxi / Moto-taxi
1. Depuis l'accueil, touchez **Taxi / Moto-taxi**.
2. Indiquez destination (Gombe, Limete, Masina…).
3. Choisissez moto-taxi, standard ou confort.
4. Consultez l'estimation CDF et confirmez.
5. Suivez la course en temps réel.

### Livraison colis
1. Touchez **Livraison colis**.
2. Renseignez adresses enlèvement et livraison.
3. Choisissez la catégorie de poids (documents, petit, moyen, grand).
4. Ajoutez une photo (optionnel), consultez l'estimation et confirmez.
5. Suivez le statut : pris en charge → en transit → livré.

### Réservation planifiée
1. Touchez **Réservation planifiée**.
2. Choisissez date et heure (maximum J+7).
3. Indiquez départ, destination et type de véhicule.
4. Confirmez — retrouvez vos réservations dans **Historique → Réservations**.

### Livraison repas
1. Touchez **Livraison repas**.
2. Parcourez les restaurants partenaires Kinshasa.
3. Ajoutez des plats au panier, indiquez l'adresse de livraison.
4. Commandez et suivez la livraison.

### Courses & commissions
1. Touchez **Courses & commissions**.
2. Listez les articles à acheter ou la commission à effectuer.
3. Indiquez l'adresse de livraison, estimez et envoyez au livreur.

### Covoiturage
1. Touchez **Covoiturage**.
2. Recherchez un trajet existant ou créez le vôtre.
3. Rejoignez un trajet — le prix par place est affiché en CDF.

### Wallet MOVA
- Consultez votre solde en CDF.
- Payez via Orange Money, M-Pesa, Airtel Money ou portefeuille MOVA.

### Historique
Onglets : **Trajets | Colis | Repas | Réservations | Courses**

## Chauffeur

1. Complétez votre **KYC** (permis, carte grise, photo).
2. Activez **En ligne**.
3. Acceptez ou refusez courses, livraisons colis/repas et réservations planifiées.
4. **Navigation** vers le passager ou point de livraison.
5. Consultez **Revenus** et demandez un retrait (min. 500 FC).

## Aide et documents légaux

Dans l'application : **Aide** → Manuel, CGU, Politique de confidentialité.

Support : WhatsApp +243 900 000 000 — support@mova.cd

## Mode hors-ligne

Si la passerelle est indisponible, l'application affiche des données de démonstration et conserve l'historique en cache local.

## Admin (équipe interne)

- **Métriques** — utilisateurs, chauffeurs, courses, revenus, litiges
- **Utilisateurs** — recherche par nom, téléphone, rôle
- **KYC** — approbation ou rejet des dossiers chauffeurs
- **Litiges** — gestion des incidents
- **Livraisons & Planifiées** — vue opérationnelle

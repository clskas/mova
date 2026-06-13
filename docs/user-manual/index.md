# Manuel utilisateur MOVA — Kinshasa, RDC

MOVA est une plateforme de mobilité urbaine pour Kinshasa et la RDC. Réservez des courses, livrez des colis, commandez des repas, planifiez vos trajets et bien plus — le tout en francs congolais (CDF).

!!! info "Source de vérité"
    Ce dossier (`docs/user-manual/`) alimente le manuel in-app mobile (`mobile/assets/legal/manuel_fr.md`).
    Mettez à jour ici en premier, puis resynchronisez l'asset mobile si nécessaire.

## Applications

| Application | Public | Accès |
|-------------|--------|-------|
| MOVA Passager (mobile) | Passagers | `flutter run --flavor passenger -t lib/main_passenger.dart` |
| MOVA Chauffeur (mobile) | Chauffeurs | `flutter run --flavor driver -t lib/main_driver.dart` |
| MOVA Web (PWA) | Passagers | http://localhost:3000 (web dev : port 3001) |
| MOVA Admin | Équipe interne | http://localhost:3002 (admin dev) |

## Guides

- [Passager](passager.md) — services de l'écran d'accueil (taxi, colis, repas, wallet…)
- [Chauffeur](chauffeur.md) — KYC, mise en ligne, revenus
- [Admin](admin.md) — console d'administration interne

## Première connexion (OTP)

1. Saisissez votre numéro au format **+243** suivi de 9 chiffres.
2. Recevez un code OTP par SMS.
3. En mode développement (`MOCK_OTP=true`), utilisez le code **123456**.

## Paiements acceptés

| Moyen | Devise |
|-------|--------|
| Orange Money | CDF |
| M-Pesa (Vodacom) | CDF |
| Airtel Money | CDF |
| Portefeuille MOVA | CDF |

## Zone de service

Lancement à **Kinshasa**. Extension progressive vers Lubumbashi, Goma, Bukavu et autres villes de RDC.

## Support

- **WhatsApp :** +243 900 000 000
- **E-mail :** support@mova.cd
- Documents légaux in-app : **Aide & Manuel** → CGU, Politique de confidentialité

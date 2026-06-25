# Manuel utilisateur MOVA — Kinshasa, RDC

MOVA est une plateforme de mobilité urbaine pour Kinshasa et la RDC. Réservez des courses, livrez des colis, commandez des repas, planifiez vos trajets et bien plus — le tout en francs congolais (CDF).

!!! info "Source de vérité"
    Ce dossier (`docs/user-manual/`) alimente le manuel in-app mobile (`mobile/assets/legal/manuel_fr.md`).
    Mettez à jour ici en premier, puis exécutez `scripts/sync-user-manual.ps1`.

## Applications et niveaux d'accès

| Application | Public | Rôle / accès | Guide |
|-------------|--------|--------------|-------|
| MOVA Passager (mobile) | Grand public | Compte **PASSENGER** — tous les services consommateur | [Passager](passager.md) |
| MOVA Chauffeur (mobile) | Chauffeurs partenaires | Compte **DRIVER** — missions, KYC, revenus | [Chauffeur](chauffeur.md) |
| MOVA Web (PWA) | Passagers | Même accès que l'app Passager | [Passager](passager.md) |
| MOVA Admin (web) | Équipe interne uniquement | Rôles staff : SUPER_ADMIN, ADMIN, SUPPORT, FINANCE, CONTENT | [Admin](admin.md) |

Les comptes **passager** et **chauffeur** sont distincts : un même numéro ne peut pas cumuler les deux rôles sur la même application.

### Rôles staff (console admin)

| Rôle | Accès résumé |
|------|--------------|
| SUPER_ADMIN / ADMIN | Console complète |
| SUPPORT | Opérations, KYC, courses, livraisons, litiges |
| FINANCE | Tarifs, portefeuille, abonnements |
| CONTENT | Restaurants, communes, catalogue location |

Détail des menus et droits d'écriture : [Admin — Niveaux d'accès](admin.md#niveaux-daccès-par-rôle).

## Fonctionnalités transverses

### Suivi GPS

Pendant une course ou livraison active, le passager voit la position du chauffeur et le **trajet parcouru** (polyline). L'équipe support consulte la même trace dans l'admin (**Courses** / **Livraisons** → Détail).

### Première connexion (OTP)

1. **Splash animé** (mobile uniquement) : présentation des services MOVA (**4 s par service**, ~32 s au total). Touchez l'écran pour continuer sans attendre.
2. Saisissez votre numéro au format **+243** suivi de 9 chiffres.
3. Recevez un code OTP par SMS.
4. En mode développement (`MOCK_OTP=true`), utilisez le code **123456**.

Le splash **Passager** et le splash **Chauffeur** sont distincts : chacun met en avant les services de son application.

### Ville par défaut (mobile)

À l'ouverture, l'app détecte votre position et sélectionne la **ville MOVA** la plus proche (32 zones RDC). Vous pouvez la changer via le sélecteur sur l'écran d'accueil.

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

## Tests et documentation technique

- [Guide de test applications](../GUIDE_TEST_APPS.md) — scénarios manuels complets
- [RBAC — tests par rôle](../RBAC_TESTING.md) — vérification des accès admin

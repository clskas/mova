# Manuel utilisateur MOVA

!!! tip "Documentation vivante"
    Le manuel détaillé est maintenu dans [`docs/user-manual/`](user-manual/index.md) et alimente le contenu in-app mobile (`mobile/assets/legal/manuel_fr.md`).

## Sommaire par profil

| Profil | Document | Accès |
|--------|----------|-------|
| **Passager** | [passager.md](user-manual/passager.md) | App mobile Passager, Web PWA — taxi, colis, repas, location, suivi GPS… |
| **Chauffeur** | [chauffeur.md](user-manual/chauffeur.md) | App mobile Chauffeur — KYC, missions, position GPS, revenus |
| **Équipe interne** | [admin.md](user-manual/admin.md) | Console admin — **5 rôles** avec menus et droits différents |

## Niveaux d'accès — vue d'ensemble

### Applications mobiles (grand public)

- **Passager** : commander et suivre des services (courses, livraisons, wallet). Pas d'accès à la console admin.
- **Chauffeur** : accepter des missions après validation KYC (et type d'engin si applicable). Envoi automatique de la position GPS en mission.

### Console admin (staff uniquement)

| Rôle | Téléphone démo | Périmètre |
|------|----------------|-----------|
| SUPER_ADMIN | `+243900000001` | Accès et écriture sur tous les modules |
| ADMIN | `+243900000002` | Idem |
| SUPPORT | `+243900000003` | KYC, courses, livraisons, litiges, traces GPS |
| FINANCE | `+243900000004` | Tarifs, abonnements, portefeuille |
| CONTENT | `+243900000005` | Restaurants, communes, catalogue location |

Voir [Admin — Niveaux d'accès par rôle](user-manual/admin.md#niveaux-daccès-par-rôle) pour le détail des menus et permissions.

## Nouveautés récentes (juillet 2026)

- **Seuil dette espèces chauffeurs** (admin → Portefeuille) : blocage des notifications de courses si la dette cash dépasse le seuil ; règlement depuis Revenus chauffeur.
- **Rapports financiers partenaires** : historique portefeuille complet (filtres date, recherche, export CSV/PDF).
- **Livraisons colis/express** : saisie du lieu d'enlèvement par géocodage (en plus du GPS) ; libellé navigation « prendre colis » côté livreur.
- **Revenus chauffeur** : recherche par adresse ou référence dans l'historique d'activité.
- **Location véhicule** : filtres dates de location et carburant pris en compte côté API.
- **POI sur carte** : marchés, hôpitaux, universités, pharmacies (import OSM / seed Kinshasa) ; filtres sur l'écran taxi.
- **Courses & commissions v3** : autocomplétion point de retrait, alerte chauffeur à la création, séquestre wallet (budget max), photo preuve obligatoire, chat passager–livreur, estimation achats par catégorie.
- **Réservation planifiée v2** : rappels J-1 et H-1 (push + SMS), assignation auto 2 h avant, course GPS liée au démarrage, frais d'annulation tardive (50 %), file des chauffeurs volontaires.

## Nouveautés (juin 2026)

- **Splash animé** : écran d'accueil mobile (**4 s par service**, ~32 s, tap sur l'écran) — contenu **Passager** vs **Chauffeur** distinct.
- **Ville GPS** : sélection automatique de la ville MOVA à l'ouverture (mobile).
- **Mode hors ligne** : bannière réseau/serveur, secours API LAN, réessai au retour de l'app.
- **Trace GPS** : trajet parcouru visible passager, chauffeur (mission active) et admin (Courses / Livraisons).
- **Validation type d'engin** : VIP, Confort, etc. — approbation admin avant mise en ligne.
- **OCR KYC** : aide à la lecture des documents chauffeur côté admin.
- **Catalogue location** : gestion des véhicules à louer (rôle CONTENT+).

## Guides de test

- [GUIDE_TEST_APPS.md](GUIDE_TEST_APPS.md) — test manuel Admin, Passager, Chauffeur + microservices
- [RBAC_TESTING.md](RBAC_TESTING.md) — vérification des rôles staff

Voir aussi la section **Documentation utilisateur** sur la [page d'accueil](index.md).

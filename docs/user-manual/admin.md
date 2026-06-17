# MOVA Admin (équipe interne)

Console web sur http://localhost:3002 en développement.

## Modules

| Module | Usage |
|--------|-------|
| **Métriques** | Utilisateurs, chauffeurs, courses, revenus, litiges |
| **Utilisateurs** | Recherche par nom, téléphone, rôle |
| **Chauffeurs** | Suivi des profils et statuts |
| **KYC** | Approbation ou rejet des dossiers chauffeurs |
| **Restaurants** | Partenaires livraison repas |
| **Courses** | Vue opérationnelle des trajets en cours |
| **Livraisons** | Colis et repas |
| **Planifiées** | Réservations à venir |
| **Locations** | Demandes de location véhicule (catalogue seed + réservations passagers) |
| **Déménagements** | Demandes passagers (`POST /moving`) — statut et annulation |
| **Covoiturage** | Trajets publiés depuis l'app — statut et annulation |
| **Litiges** | Gestion des incidents |
| **Tarifs** | Grilles, majorations, **commissions plateforme** et codes promo |

## Opérations (lecture + mise à jour, pas de création manuelle)

Les modules **Locations**, **Déménagements**, **Covoiturage** et **Livraisons** affichent des demandes créées par les apps mobiles. L'admin peut :

- **Consulter** la liste et ouvrir le **Détail**
- **Modifier le statut** (ex. PENDING → ASSIGNED → COMPLETED)
- **Annuler** une demande en cours

Il n'est pas nécessaire de **créer** ces enregistrements depuis l'admin : ils proviennent des passagers/chauffeurs.

## Comptes suspendus

Si un chauffeur ou passager ne peut plus se connecter (« Compte suspendu »), allez dans **Utilisateurs** → modifier le statut **ACTIVE**.

Accès réservé aux rôles admin définis dans le RBAC (`packages/shared/src/admin-rbac.ts`).

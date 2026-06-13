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
| **Litiges** | Gestion des incidents |
| **Tarifs** | Grilles et majorations |

Accès réservé aux rôles admin définis dans le RBAC (`packages/shared/src/admin-rbac.ts`).

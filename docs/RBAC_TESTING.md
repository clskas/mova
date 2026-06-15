# RBAC — tests locaux par rôle

Guide pour vérifier que l’admin, le web PWA et le mobile respectent les niveaux d’accès.

## Prérequis

```powershell
cd c:\Users\Administrator\Mova
docker compose up -d --build
npm run migrate:all
npm run seed:admin-demo   # crée les 5 comptes staff + données démo
```

OTP dev : **`123456`** (`MOCK_OTP=true` dans `config/external-apis.env` ou Docker).

## Comptes staff (console admin)

| Téléphone | Rôle | Badge header | CRUD global |
|-----------|------|--------------|-------------|
| `+243900000001` | SUPER_ADMIN | Super admin | CRUD actif |
| `+243900000002` | ADMIN | Administrateur | CRUD actif |
| `+243900000003` | SUPPORT | Support | CRUD actif (sections limitées) |
| `+243900000004` | FINANCE | Finance | CRUD actif (sections limitées) |
| `+243900000005` | CONTENT | Contenu | CRUD actif (sections limitées) |

Connexion : http://localhost:3002/login — saisir le téléphone, OTP `123456`.

### Menu visible par rôle

| Section | SUPER_ADMIN | ADMIN | SUPPORT | FINANCE | CONTENT |
|---------|:-----------:|:-----:|:-------:|:-------:|:-------:|
| Tableau de bord | ✓ | ✓ | — | ✓ | — |
| Utilisateurs | ✓ | ✓ | ✓ | — | — |
| Chauffeurs | ✓ | ✓ | ✓ | — | — |
| KYC | ✓ | ✓ | ✓ | — | — |
| Courses | ✓ | ✓ | ✓ | — | — |
| Livraisons | ✓ | ✓ | ✓ | — | — |
| Restaurants | ✓ | ✓ | — | — | ✓ |
| Tarifs | ✓ | ✓ | — | ✓ | ✓ |
| Abonnements | ✓ | ✓ | — | ✓ | — |
| Portefeuille | ✓ | ✓ | — | ✓ | — |
| Litiges | ✓ | ✓ | ✓ | — | — |
| Planifiées | ✓ | ✓ | ✓ | — | — |
| Communes | ✓ | ✓ | — | — | ✓ |
| Locations | ✓ | ✓ | ✓ | — | ✓ |

### Écriture par page (exemples clés)

| Page | SUPER_ADMIN | ADMIN | SUPPORT | FINANCE | CONTENT |
|------|:-----------:|:-----:|:-------:|:-------:|:-------:|
| `/tarifs` | Enregistrer | Enregistrer | — (menu masqué) | Enregistrer | Enregistrer |
| `/utilisateurs` | Édition | Édition | Lecture seule | — | — |
| `/kyc` | Approuver/Rejeter | Approuver/Rejeter | Approuver/Rejeter | — | — |
| `/litiges` | Résoudre | Résoudre | Résoudre | — | — |
| `/restaurants` | CRUD | CRUD | — | — | CRUD |
| `/abonnements` | CRUD | CRUD | — | CRUD | — |
| `/portefeuille` | Édition | Édition | — | Édition | — |
| `/parametres` (communes) | Édition | Édition | — | — | Édition |

Sur `/tarifs`, un rôle en lecture seule affiche : *« Accès lecture seule pour votre rôle. »* et masque le bouton **Enregistrer**.

Source de vérité code : `admin/src/lib/rbac.ts` et `packages/shared/src/admin-rbac.ts`.

## Mobile (Flutter)

Deux flavors distincts — même API, UX différente :

| Flavor | Entrypoint | Compte seed | OTP |
|--------|------------|-------------|-----|
| Passager | `lib/main_passenger.dart` | `+243900000010` (Marie Kabila) | `123456` |
| Chauffeur | `lib/main_driver.dart` | `+243900000020` (Jean Mukendi) | `123456` |

Autres comptes démo (`seed-demo.ts`) :

- Passagers : `+243900000010`, `+243900000011`, `+243900000012`
- Chauffeurs : `+243900000020` … `+243900000023`

```powershell
cd mobile
# Émulateur
flutter run --flavor passenger -t lib/main_passenger.dart --dart-define=API_URL=http://localhost:3000/api
# Appareil physique (LAN dev 192.168.1.64)
flutter run --flavor passenger -t lib/main_passenger.dart `
  --dart-define=API_URL=http://192.168.1.64:3000/api `
  --dart-define=WS_URL=http://192.168.1.64:3000
flutter run --flavor driver -t lib/main_driver.dart `
  --dart-define=API_URL=http://192.168.1.64:3000/api `
  --dart-define=WS_URL=http://192.168.1.64:3000
```

## Web PWA (passager)

http://localhost:3001 — pas de rôles staff. Connexion passager avec les numéros `+243900000010`–`012`, OTP `123456`.

## Playwright (régression RBAC)

Avec la stack Docker + admin démarrés :

```powershell
npm run seed:admin-demo
cd admin; npm run dev          # :3002
cd e2e; npm run test:e2e:admin -- tests/admin-rbac-roles.spec.ts
```

Le spec `e2e/tests/admin-rbac-roles.spec.ts` se connecte à chaque compte staff et vérifie la visibilité du menu et les droits d’écriture sur `/tarifs`.

## Reseed manuel des rôles staff uniquement

```powershell
$env:DATABASE_URL = "postgresql://mova:mova@localhost:54320/mova_auth"
cd services/auth-service
npx ts-node prisma/seed-staff-roles.ts
```

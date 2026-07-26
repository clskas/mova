# SENGA Location — Portail partenaire (PWA)

Formulaire web pour que les propriétaires de véhicules soumettent leurs annonces.  
Validation et publication via l'admin SENGA → **Catalogue location** (`/catalogue-location`).

## Prérequis

- Backend SENGA (`docker compose up`, port 3000)
- Compte utilisateur avec rôle `RENTAL_PARTNER` (créé par l'admin dans **Utilisateurs**)

## Dev local

```powershell
cd c:\Users\Administrator\Senga\rental-partner
copy .env.example .env.local
npm install
npm run dev
```

→ http://localhost:3008

Compte démo (après seed auth) : `+243900000031` / OTP `123456`

## Flux

1. **Partenaire** : connexion OTP → formulaire véhicule + photo → statut `PENDING`
2. **Admin** : `/catalogue-location` → boutons **Approuver** / **Refuser**
3. **Passager** : véhicule visible dans l'app / PWA passager une fois `APPROVED` + `isActive`

## API partenaire

| Méthode | Route |
|---------|--------|
| GET | `/api/rental-partner/profile` |
| GET | `/api/rental-partner/vehicles` |
| POST | `/api/rental-partner/vehicles` |
| POST | `/api/rental-partner/vehicle-photo` |

## Créer un compte partenaire

Admin → **Utilisateurs** → créer / modifier un utilisateur avec rôle **RENTAL_PARTNER**.

Ou seed :

```powershell
cd c:\Users\Administrator\Senga\services\auth-service
npx prisma db seed
```

# MOVA — Portail Restaurant

Console web pour les **partenaires livraison repas** : recevoir, confirmer et préparer les commandes passées via l'app MOVA.

## Démarrage (dev)

```powershell
# 1. Migrations + compte partenaire
cd c:\Users\Administrator\Mova
.\scripts\seed-restaurant.ps1

# 2. Portail (port 3007)
cd restaurant
Copy-Item .env.example .env.local -ErrorAction SilentlyContinue
npm install
npm run dev
```

Ouvrir http://localhost:3007

## Connexion test

| Champ | Valeur |
|-------|--------|
| Téléphone | `+243900000030` |
| OTP (dev) | `123456` |
| Restaurant lié | Chez Flore (via `ownerUserId`) |

## Flux commande repas

1. Passager commande → statut `PENDING`
2. Restaurant **Accepte** → `RESTAURANT_CONFIRMED` (notification passager)
3. Restaurant **Prête pour livreur** → `READY_FOR_PICKUP`
4. Chauffeur accepte l'offre → livraison
5. Refus restaurant → `CANCELLED`

## API (`/api/restaurant/*`)

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/profile` | Profil restaurant lié |
| GET | `/orders` | Commandes actives |
| POST | `/orders/:id/confirm` | Accepter |
| POST | `/orders/:id/ready` | Prête pour livreur |
| POST | `/orders/:id/reject` | Refuser |
| PATCH | `/menu` | Disponibilité, délai prep |

JWT requis, rôle `RESTAURANT`.

## Onboarding partenaire (admin MOVA)

1. **Utilisateurs** → créer / modifier un compte avec rôle `RESTAURANT`
2. **Restaurants** → éditer le partenaire → coller `ownerUserId`
3. Remettre les identifiants OTP au restaurant

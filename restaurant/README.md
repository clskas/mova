# SENGA — Portail Restaurant

Console web pour les **partenaires livraison repas** : recevoir, confirmer et préparer les commandes passées via l'app SENGA.

## Démarrage (dev)

```powershell
# 1. Migrations + compte partenaire
cd c:\Users\Administrator\Senga
.\scripts\seed-restaurant.ps1

# 2. Portail (port 3007)
cd restaurant
Copy-Item .env.example .env.local -ErrorAction SilentlyContinue
npm install
npm run dev
```

Ouvrir http://localhost:3007

## PWA (installer sur tablette / téléphone)

1. Ouvrir http://localhost:3007 dans **Chrome** (Android) ou **Safari** (iOS)
2. Menu navigateur → **Ajouter à l'écran d'accueil** / **Installer l'application**
3. L'app s'ouvre en plein écran (`standalone`) avec icône SENGA Resto

Service worker : cache léger + fonctionnement basique hors ligne sur les pages visitées.


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
| GET | `/menu` | Menu complet (plats + photos) |
| GET | `/orders` | Commandes actives |
| POST | `/orders/:id/confirm` | Accepter |
| POST | `/orders/:id/ready` | Prête pour livreur |
| POST | `/orders/:id/reject` | Refuser |
| PATCH | `/menu` | Publier menu / paramètres |
| POST | `/menu-photo` | Upload photo plat (base64) |

JWT requis, rôle `RESTAURANT`.

## Onboarding partenaire (admin SENGA)

1. **Utilisateurs** → créer / modifier un compte avec rôle `RESTAURANT`
2. **Restaurants** → éditer le partenaire → coller `ownerUserId`
3. Remettre les identifiants OTP au restaurant

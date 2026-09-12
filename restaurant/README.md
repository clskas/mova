# SENGA Business — Portail partenaire

Console web pour les **partenaires commerce** (restaurant, supermarché, pharmacie, boutique) : recevoir, confirmer et préparer les commandes passées via l'app SENGA.

## Démarrage (dev)

```powershell
# 1. Migrations + comptes / magasins démo
cd c:\Users\Administrator\Mova
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
3. L'app s'ouvre en plein écran (`standalone`) avec icône SENGA Business

Service worker : cache léger + fonctionnement basique hors ligne sur les pages visitées.

## Compte démo restaurant

| Champ | Valeur |
|-------|--------|
| Téléphone | `+243900000030` |
| OTP (dev) | `123456` |
| Magasin lié | Chez Flore (`commerceType` RESTAURANT) |

Magasins démo multi-commerce (sans compte propriétaire) : `scripts/sql/seed-senga-business-stores.sql` (Supermarché Gombe, Pharmacie Victoire, Boutique Matonge).

## Flux commande

1. Passager commande → statut `PENDING`
2. Partenaire **Accepte** → `RESTAURANT_CONFIRMED` (notification passager)
3. Partenaire **Prête pour livreur** → `READY_FOR_PICKUP`
4. Chauffeur accepte l'offre → livraison
5. Refus partenaire → `CANCELLED`

## API (`/api/restaurant/*`)

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/profile` | Profil magasin lié (`commerceType`) |
| GET | `/menu` | Catalogue (plats / articles + photos) |
| GET | `/orders` | Commandes actives |
| POST | `/orders/:id/confirm` | Accepter |
| POST | `/orders/:id/ready` | Prête pour livreur |
| POST | `/orders/:id/reject` | Refuser |
| PATCH | `/menu` | Publier catalogue / paramètres |
| POST | `/menu-photo` | Upload photo article (base64) |

JWT requis, rôle `RESTAURANT`.

## Onboarding partenaire (admin SENGA)

1. **Utilisateurs** → créer / modifier un compte avec rôle `RESTAURANT`
2. **Restaurants** → créer le magasin avec le **type de commerce** (SENGA Business) → coller `ownerUserId`
3. Remettre les identifiants OTP au partenaire

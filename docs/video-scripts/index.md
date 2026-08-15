# Scripts vidéo — comment utiliser SENGA

Storyboards de tournage pour les **vidéos explicatives courtes** (30–60 s, max ~90 s).
Langue à l’écran et en voix off : **français simple, ton Kinshasa / RDC**.

Ces fichiers ne sont **pas** les démos Play Console `FOREGROUND_SERVICE_DATA_SYNC`
(`mobile/store-listing/senga/fgs-*-demo-README.md`). Ne pas committer les MP4 ni les fichiers `_*.png` / `_rebuild_*.py`.

## Applications (parcours complets)

| App | Durée | Parcours (happy path) | Script |
|-----|-------|------------------------|--------|
| Mobile passager (Senga) | ~50 s | Accueil → **Taxi / Moto-taxi** → destination → commander → **Suivi de course** | [passager-mobile.md](passager-mobile.md) |
| Mobile chauffeur (SENGA Driver) | ~60 s | **En ligne** → **Accepter la course** → naviguer → **Terminer la course** | [chauffeur-mobile.md](chauffeur-mobile.md) |
| Web / PWA passager | ~45 s | [senga.afri-soft.com](https://senga.afri-soft.com) → choisir un service → commander | [passager-web.md](passager-web.md) |
| Portail Restaurant | ~50 s | [restaurant.afri-soft.com](https://restaurant.afri-soft.com) → **Commandes** → **Accepter** → **Menu** | [restaurant.md](restaurant.md) |
| Portail Location | ~50 s | [rental.afri-soft.com](https://rental.afri-soft.com) → **Véhicules** → **Réservations** | [location.md](location.md) |
| Admin | ~45 s | [admin.afri-soft.com](https://admin.afri-soft.com) → **Tableau de bord** → **KYC** → **Approuver** | [admin.md](admin.md) |

## Shorts — une vidéo par fonction (30–45 s)

Index détaillé : [shorts/README.md](shorts/README.md). MP4 : `out/shorts/`.

### Passager

| Fichier | Parcours | Script |
|---------|----------|--------|
| `senga-passager-taxi.mp4` | **Taxi / Moto-taxi** → estimer → confirmer → suivi | [shorts/passager-taxi.md](shorts/passager-taxi.md) |
| `senga-passager-livraisons.mp4` | **Livraisons** → **Livraison colis** | [shorts/passager-livraisons.md](shorts/passager-livraisons.md) |
| `senga-passager-reservation.mp4` | **Réservation planifiée** | [shorts/passager-reservation.md](shorts/passager-reservation.md) |
| `senga-passager-covoiturage.mp4` | **Covoiturage** → **Réserver** | [shorts/passager-covoiturage.md](shorts/passager-covoiturage.md) |
| `senga-passager-location.mp4` | **Location véhicule** → **Réserver maintenant** | [shorts/passager-location.md](shorts/passager-location.md) |
| `senga-passager-demenagement.mp4` | **Déménagement** → **Demander un devis** | [shorts/passager-demenagement.md](shorts/passager-demenagement.md) |
| `senga-passager-wallet.mp4` | **Wallet SENGA** / **Portefeuille** | [shorts/passager-wallet.md](shorts/passager-wallet.md) |

### Chauffeur

Tous les modules ci-dessous existent dans l’UI SENGA Driver (libellés réels). Aucun short inventé.

| Fichier | Libellés UI | Script |
|---------|-------------|--------|
| `senga-driver-taxi.mp4` | **En ligne** → **Nouvelle course** | [shorts/driver-taxi.md](shorts/driver-taxi.md) |
| `senga-driver-livraisons.mp4` | **Nouvelle livraison** | [shorts/driver-livraisons.md](shorts/driver-livraisons.md) |
| `senga-driver-reservation.mp4` | **Créneaux planifiés** / **Mission planifiée** (pas « Réservation planifiée ») | [shorts/driver-reservation.md](shorts/driver-reservation.md) |
| `senga-driver-covoiturage.mp4` | Menu **Covoiturage** → **Publier covoiturage** | [shorts/driver-covoiturage.md](shorts/driver-covoiturage.md) |
| `senga-driver-location.mp4` | **Missions assignées** → **Mission location** | [shorts/driver-location.md](shorts/driver-location.md) |
| `senga-driver-demenagement.mp4` | **Mission déménagement** | [shorts/driver-demenagement.md](shorts/driver-demenagement.md) |
| `senga-driver-revenus.mp4` | **Revenus** (pas « Wallet SENGA ») | [shorts/driver-revenus.md](shorts/driver-revenus.md) |

Régénérer les shorts : `python docs/video-scripts/build_shorts.py`

## Conventions de tournage

- Compte déjà connecté (sauf si le script dit le contraire). Pas de splash 32 s.
- Destinations Kinshasa : **Gombe**, **Limete**, **Masina**.
- Une seule action à la fois. Doigt / souris visible.
- **Super** = texte à l’écran (court). **VO** = voix off (même idée, une phrase).
- Carte de fin : logo SENGA + URL ou « Télécharger Senga / SENGA Driver ».
- Pas de données personnelles réelles ; masquer les numéros si besoin.

## Après le tournage

1. Exporter 1080p (vertical 9:16 pour mobile, 16:9 pour le web).
2. Sous-titres FR (même texte que les supers).
3. Héberger (YouTube non répertorié ou page AfriSoft). Ne pas committer le MP4 dans ce dépôt.

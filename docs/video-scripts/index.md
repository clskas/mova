# Scripts vidéo — comment utiliser SENGA

Storyboards de tournage pour les **vidéos explicatives courtes** (30–60 s, max ~90 s).
Langue à l’écran et en voix off : **français simple, ton Kinshasa / RDC**.

Ces fichiers ne sont **pas** les démos Play Console `FOREGROUND_SERVICE_DATA_SYNC`
(`mobile/store-listing/senga/fgs-*-demo-README.md`). Ne pas committer les MP4 ni les fichiers `_*.png` / `_rebuild_*.py`.

## Applications

| App | Durée | Parcours (happy path) | Script |
|-----|-------|------------------------|--------|
| Mobile passager (Senga) | ~50 s | Accueil → **Taxi / Moto-taxi** → destination → commander → **Suivi de course** | [passager-mobile.md](passager-mobile.md) |
| Mobile chauffeur (SENGA Driver) | ~60 s | **En ligne** → **Accepter la course** → naviguer → **Terminer la course** | [chauffeur-mobile.md](chauffeur-mobile.md) |
| Web / PWA passager | ~45 s | [senga.afri-soft.com](https://senga.afri-soft.com) → choisir un service → commander | [passager-web.md](passager-web.md) |
| Portail Restaurant | ~50 s | [restaurant.afri-soft.com](https://restaurant.afri-soft.com) → **Commandes** → **Accepter** → **Menu** | [restaurant.md](restaurant.md) |
| Portail Location | ~50 s | [rental.afri-soft.com](https://rental.afri-soft.com) → **Véhicules** → **Réservations** | [location.md](location.md) |
| Admin | ~45 s | [admin.afri-soft.com](https://admin.afri-soft.com) → **Tableau de bord** → **KYC** → **Approuver** | [admin.md](admin.md) |

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

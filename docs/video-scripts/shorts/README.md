# Shorts SENGA — une vidéo par fonction

Clips **30–45 s**, français, 9:16 (1080×1920). Storyboards ci-dessous ; MP4 générés dans `docs/video-scripts/out/shorts/`.

**Ne pas committer les MP4.**

## Passager (Senga)

| Fichier | Storyboard | Parcours |
|---------|------------|----------|
| `senga-passager-taxi.mp4` | [passager-taxi.md](passager-taxi.md) | Taxi / Moto-taxi |
| `senga-passager-livraisons.mp4` | [passager-livraisons.md](passager-livraisons.md) | Livraisons → colis |
| `senga-passager-reservation.mp4` | [passager-reservation.md](passager-reservation.md) | Réservation planifiée |
| `senga-passager-covoiturage.mp4` | [passager-covoiturage.md](passager-covoiturage.md) | Covoiturage |
| `senga-passager-location.mp4` | [passager-location.md](passager-location.md) | Location véhicule |
| `senga-passager-demenagement.mp4` | [passager-demenagement.md](passager-demenagement.md) | Déménagement |
| `senga-passager-wallet.mp4` | [passager-wallet.md](passager-wallet.md) | Wallet SENGA / Portefeuille |

## Chauffeur (SENGA Driver)

Tous les modules demandés existent dans l’UI chauffeur. Aucun short n’est inventé.

| Fichier | Storyboard | Libellés UI réels |
|---------|------------|-------------------|
| `senga-driver-taxi.mp4` | [driver-taxi.md](driver-taxi.md) | En ligne → Nouvelle course |
| `senga-driver-livraisons.mp4` | [driver-livraisons.md](driver-livraisons.md) | Nouvelle livraison |
| `senga-driver-reservation.mp4` | [driver-reservation.md](driver-reservation.md) | Créneaux planifiés / Mission planifiée |
| `senga-driver-covoiturage.mp4` | [driver-covoiturage.md](driver-covoiturage.md) | Menu Covoiturage → Publier covoiturage |
| `senga-driver-location.mp4` | [driver-location.md](driver-location.md) | Missions assignées → Mission location |
| `senga-driver-demenagement.mp4` | [driver-demenagement.md](driver-demenagement.md) | Mission déménagement |
| `senga-driver-revenus.mp4` | [driver-revenus.md](driver-revenus.md) | Revenus (pas « Wallet SENGA ») |

## Modules chauffeur absents

Aucun des 7 thèmes demandés n’est absent. Deux écarts de libellé :

- Pas de titre **Réservation planifiée** côté chauffeur → **Créneaux planifiés** / **Mission planifiée**.
- Pas d’écran **Wallet SENGA** côté chauffeur → **Revenus**.

## Régénérer

```powershell
python docs/video-scripts/build_shorts.py
```

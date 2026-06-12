# MOVA Mobile (Flutter)

Apps passager et chauffeur (flavors) pour la mobilité en RDC.

## Prérequis

- Flutter 3.32+
- Passerelle API locale sur le port 3000 (`docker compose up` ou backend/gateway)

## Configuration API

Toutes les requêtes passent par la **passerelle API** unique (microservices), pas par les services individuels.

| Plateforme | Variable | Valeur par défaut |
|------------|----------|-------------------|
| Android émulateur | `API_URL` | `http://10.0.2.2:3000/api` |
| iOS simulateur / appareil | `API_URL` | `http://localhost:3000/api` (ou IP LAN) |

WebSocket GPS : même hôte que la passerelle (`MarketConfig.wsUrl`), proxy vers ride-service.

Mode mock/hors-ligne activé automatiquement si la passerelle est indisponible.

## Lancer l'app

```powershell
cd mobile
flutter pub get
dart run flutter_launcher_icons

# Passager
flutter run --flavor passenger -t lib/main_passenger.dart

# Chauffeur
flutter run --flavor driver -t lib/main_driver.dart

# Avec passerelle sur machine hôte (appareil physique Android)
flutter run --flavor passenger -t lib/main_passenger.dart --dart-define=API_URL=http://192.168.x.x:3000/api
```

## Icônes

Source : `assets/icon/movaicone.png` (générée via `flutter_launcher_icons` pour les deux flavors).

## Tests

```powershell
flutter analyze
flutter test
```

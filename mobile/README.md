# MOVA Mobile (Flutter)

Apps passager et chauffeur (flavors) pour la mobilité en RDC.

## Prérequis

- Flutter 3.32+
- Passerelle API locale sur le port 3000 (`docker compose up` ou backend/gateway)

## Configuration API

Toutes les requêtes passent par la **passerelle API** unique (microservices), pas par les services individuels.

| Plateforme | `API_URL` | `WS_URL` |
|------------|-----------|----------|
| Android émulateur | `http://10.0.2.2:3000/api` | `http://10.0.2.2:3000` |
| Appareil physique (LAN) | `http://192.168.1.64:3000/api` | `http://192.168.1.64:3000` |
| iOS simulateur | `http://localhost:3000/api` | `http://localhost:3000` |

`10.0.2.2` est l'alias émulateur vers la machine hôte ; sur un **appareil physique**, utiliser l'IP LAN de la machine qui exécute Docker / la passerelle.

**Appareil de test actuel :** Samsung **SM G981V** (`R3CN70C59KF`) — machine dev **192.168.1.64** (même réseau Wi‑Fi que le téléphone).

WebSocket GPS : même hôte que la passerelle (`MarketConfig.wsUrl`), proxy vers ride-service.

Mode mock/hors-ligne activé automatiquement si la passerelle est indisponible.

## Lancer l'app

> **Important :** ne jamais lancer `flutter run` seul. Ce projet utilise des **flavors** (`passenger`, `driver`) : sans `--flavor` et `-t`, Gradle ne produit pas l'APK attendu et Flutter échoue avec *« Gradle build failed to produce an .apk file »*.

Depuis la racine du repo (recommandé) :

```powershell
.\scripts\run-mobile-passenger.ps1   # passager, LAN 192.168.1.64
.\scripts\run-mobile-driver.ps1      # chauffeur, LAN 192.168.1.64
```

Ou manuellement dans `mobile/` :

```powershell
cd mobile
flutter pub get
dart run flutter_launcher_icons

# Passager (émulateur)
flutter run --flavor passenger -t lib/main_passenger.dart `
  --dart-define=API_URL=http://10.0.2.2:3000/api `
  --dart-define=WS_URL=http://10.0.2.2:3000

# Chauffeur (émulateur)
flutter run --flavor driver -t lib/main_driver.dart `
  --dart-define=API_URL=http://10.0.2.2:3000/api `
  --dart-define=WS_URL=http://10.0.2.2:3000

# Appareil physique SM G981V (passerelle sur 192.168.1.64)
flutter run --flavor passenger -t lib/main_passenger.dart `
  --dart-define=API_URL=http://192.168.1.64:3000/api `
  --dart-define=WS_URL=http://192.168.1.64:3000
```

VS Code / Cursor : configurations **MOVA Passager/Chauffeur** dans `.vscode/launch.json`.

APK debug LAN : `..\scripts\build-mobile-debug.ps1` depuis la racine du repo.

## Icônes

Source : `assets/icon/movaicone.png` (générée via `flutter_launcher_icons` pour les deux flavors).

## Tests

```powershell
flutter analyze
flutter test
```

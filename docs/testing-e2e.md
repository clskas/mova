# Tests E2E — Playwright & Appium

Guide pour exécuter les tests end-to-end web, admin et mobile Android dans le monorepo MOVA.

## Structure

```
e2e/
├── package.json           # Dépendances Playwright + Appium
├── playwright.config.ts   # Projets admin (3002) et web (3001)
├── tests/                 # Specs Playwright
├── mobile/                # Tests Appium (Android)
│   ├── run-smoke.mjs
│   ├── run-taxi-flow.mjs
│   ├── run-services-navigation.mjs
│   └── helpers.mjs
└── .env.example           # Variables d'environnement
```

## Prérequis généraux

- **Node.js 22+**
- **Windows** : PowerShell 5+ (scripts `.ps1` inclus)

---

## Playwright (web + admin)

### Installation (une fois)

```powershell
cd e2e
npm install
npm run playwright:install
Copy-Item .env.example .env   # optionnel
```

### Variables d'environnement

| Variable | Défaut | Description |
|----------|--------|-------------|
| `ADMIN_BASE_URL` | `http://localhost:3002` | Back-office Next.js |
| `WEB_BASE_URL` | `http://localhost:3001` | PWA passager |
| `GATEWAY_URL` | `http://localhost:3000` | Health check API gateway |

### Lancer les apps cibles

```powershell
# Terminal 1 — admin
cd admin && npm run dev

# Terminal 2 — web (optionnel)
cd web && npm run dev
```

### Exécuter les tests

```powershell
cd e2e

# Tous les projets (skip auto si serveur arrêté)
npm run test:e2e

# Interface graphique Playwright
npm run test:e2e:ui

# Un seul projet
npm run test:e2e:admin
npm run test:e2e:web

# Rapport HTML
npm run test:e2e:report
```

Depuis la racine du monorepo :

```powershell
npm run test:e2e
npm run test:e2e:ui
```

Les tests **ignorent** (`skip`) les specs si l'URL cible ne répond pas — pratique sans stack complète.

---

## Appium (mobile Android)

Approche retenue : **Appium 2 + UiAutomator2** sur l'APK Flutter passager. Pas de modification du code Flutter requise pour le smoke test (recherche du texte « Bienvenue » sur l'écran OTP).

> **Alternative Flutter-native** : pour des tests plus profonds, envisager `integration_test` + [Patrol](https://patrol.leancode.co/) ou `appium-flutter-integration-driver`. UiAutomator2 reste le plus simple pour un smoke test initial.

### Prérequis Android

1. **Android SDK** (via Android Studio ou standalone)
   - `ANDROID_HOME` → ex. `C:\Users\<vous>\AppData\Local\Android\Sdk`
   - Ajouter au `PATH` : `%ANDROID_HOME%\platform-tools` (adb)
2. **Java JDK 11+** (`JAVA_HOME`)
3. **Raccourci Windows** : `. .\e2e\scripts\setup-env.ps1` configure `ANDROID_HOME` et `JAVA_HOME` pour la session.
4. **Appareil physique** (ex. SM G981V) ou émulateur
   - Débogage USB activé
   - `adb devices` liste l'appareil
5. **APK passager** (debug) ou app déjà installée

> Flutter expose les libellés via `content-desc` (accessibilité), pas `text` — les sélecteurs Appium utilisent `descriptionContains`.

### Installation Appium (une fois)

```powershell
cd e2e
npm install
npm run appium:install-drivers
npm run appium:doctor
```

### Construire l'APK passager (si besoin)

```powershell
cd mobile
flutter pub get
flutter build apk --debug --flavor passenger -t lib/main_passenger.dart
# Sortie: build/app/outputs/flutter-apk/app-passenger-debug.apk
```

### Variables mobile

| Variable | Défaut | Description |
|----------|--------|-------------|
| `APPIUM_HOST` | `127.0.0.1` | Hôte Appium |
| `APPIUM_PORT` | `4723` | Port Appium |
| `ANDROID_DEVICE` | `Android` | Nom adb (optionnel) |
| `APK_PATH` | `../mobile/build/.../app-passenger-debug.apk` | Chemin APK |
| `USE_INSTALLED_APP` | `true` | Lance l'app installée sans réinstaller l'APK |
| `E2E_TEST_PHONE` | `+243812345678` | Numéro pour connexion OTP mock |
| `E2E_MOCK_OTP` | `123456` | Code OTP (`MOCK_OTP=true` côté backend) |
| `E2E_STEP_TIMEOUT_MS` | `30000` | Timeout par étape (ms) |

Package Android passager : `cd.mova.mova.passenger`

OTP mock : avec `MOCK_OTP=true` sur l'API gateway / auth-service, le code fixe est **`123456`** (voir `services/auth-service/src/auth/auth.service.ts` et `mobile/lib/core/api/mock_data.dart`).

### Scénarios mobile

| Script npm | Fichier | Description |
|------------|---------|-------------|
| `test:mobile:smoke` | `run-smoke.mjs` | Lance l'app, vérifie écran OTP ou accueil |
| `test:mobile:taxi` | `run-taxi-flow.mjs` | OTP mock → accueil → Taxi → UI réservation → estimation (optionnelle, arrêt avant paiement) |
| `test:mobile:nav` | `run-services-navigation.mjs` | Après login, ouvre chaque carte service et vérifie le titre d'écran |
| `test:mobile:all` | les trois ci-dessus | Suite complète séquentielle |

Les sélecteurs utilisent `descriptionContains` (content-desc Flutter). L'état « déjà connecté » est géré automatiquement (`noReset: true`).

### Exécuter le smoke test

```powershell
# Terminal 1 — serveur Appium
cd e2e
npm run appium:start

# Terminal 2 — test (app passager installée ou APK construit)
cd e2e
npm run test:mobile:smoke

# Flux taxi (OTP → réservation)
npm run test:mobile:taxi

# Navigation tous les services
npm run test:mobile:nav

# Suite complète
npm run test:mobile:all

# Ou script PowerShell (vérifie adb + Appium)
npm run test:mobile:ps1
```

Depuis la racine :

```powershell
npm run test:mobile
```

### Dépannage Windows

| Problème | Action |
|----------|--------|
| `adb` introuvable | Configurer `ANDROID_HOME` + `platform-tools` dans PATH |
| Aucun appareil | Câble USB, autoriser débogage, `adb devices` |
| Appium ne démarre pas | `npm run appium:install-drivers`, vérifier JDK |
| Élément introuvable | Vérifier que l'app passager est ouverte sur l'écran OTP |

---

## CI (GitHub Actions)

Workflow stub : [`.github/workflows/e2e.yml`](../.github/workflows/e2e.yml)

- Déclenché manuellement (`workflow_dispatch`) pour ne pas bloquer la CI existante
- Installe Playwright et exécute les specs (avec skip si apps non démarrées)
- Les tests mobile Appium ne tournent pas en CI par défaut (appareil physique requis)

---

## Scripts racine

| Script | Description |
|--------|-------------|
| `npm run test:e2e` | Playwright — tous projets |
| `npm run test:e2e:ui` | Playwright UI mode |
| `npm run test:mobile` | Appium smoke passager (alias smoke) |
| `npm run test:mobile:taxi` | Flux taxi E2E |
| `npm run test:mobile:nav` | Navigation services |
| `npm run test:mobile:all` | Tous scénarios mobile |

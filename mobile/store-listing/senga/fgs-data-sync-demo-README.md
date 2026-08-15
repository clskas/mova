# Play Console — FOREGROUND_SERVICE_DATA_SYNC demos

These clips are **Play Console FGS compliance** demos, not user explainer videos.

User-facing shooting scripts (how to use the apps, 30–60 s, French): [`docs/video-scripts/`](../../../docs/video-scripts/index.md) — passenger [`passager-mobile.md`](../../../docs/video-scripts/passager-mobile.md), driver [`chauffeur-mobile.md`](../../../docs/video-scripts/chauffeur-mobile.md). Store listing pointer: [`VIDEO-EXPLAINER.md`](VIDEO-EXPLAINER.md).

Local videos (do **not** commit large binaries unless your release process requires it):

| App | Package | File |
|-----|---------|------|
| Senga (passenger) | `cd.mova.mova.passenger` | `fgs-senga-passenger-demo.mp4` |
| SENGA Driver | `cd.mova.mova.driver` | `fgs-senga-driver-demo.mp4` |

Older file `fgs-data-sync-demo.mp4` is a previous passenger-only attempt; prefer the two named files above.

---

## What each video shows

### Passenger — `fgs-senga-passenger-demo.mp4`

Recorded on a physical Samsung device with the Senga passenger APK. Walkthrough of the passenger app (welcome / login entry UI) and the system notification shade expanded so reviewers can inspect active notifications.

**Foreground-service notification visible?** No. In this codebase, `flutter_foreground_task` / `FOREGROUND_SERVICE_DATA_SYNC` is started at runtime mainly on the **driver** path (`DriverBackgroundService`, channel `mova_driver_online`) when the driver goes online. The passenger app declares the same AndroidManifest service type (shared Flutter Android module) but does not start that FGS while idle on the login/welcome screen.

### Driver — `fgs-senga-driver-demo.mp4`

Demo for **SENGA Driver** with the **current** launcher icon (steering wheel on green gradient — `movaicone_driver.png` / driver mipmap). Shows the driver app UI and the notification shade while the persistent foreground-service notification is active:

- **Title:** `SENGA Driver`
- **Text:** `En ligne — recherche de courses et missions`
- **Channel:** `mova_driver_online` (“SENGA Driver en ligne” / legacy label “MOVA Chauffeur en ligne”)
- **Notification id:** `1001`
- **Icon:** current Driver launcher (not the older colorful map-pin splash)

**Foreground-service notification visible?** Yes.

Upload reminder: YouTube **Unlisted**, no ads — then paste the URL into Play Console. See `fgs-data-sync-demo-driver-README.md`.

---

## What to upload for Play Console

Play Console asks for a **Video link** (URL), not a raw file upload. For each app, do one of:

1. **YouTube (recommended):** Upload the matching MP4 → set visibility to **Unlisted** → copy the watch URL.  
2. **Google Drive:** Upload the MP4 → Share → **Anyone with the link** (Viewer) → copy the link.

Paste the URL into **App content → Sensitive app permissions → Foreground service permissions** for that package.

Do **not** upload from this automation session — upload manually when ready.

---

## Suggested purpose text

### Passenger (`cd.mova.mova.passenger`)

> Senga (passenger) uses a foreground service of type `dataSync` so the app can keep ride booking and trip status synchronized with our backend while the user moves between screens or briefly backgrounds the app during an active request (matching, driver assigned, en route, arrival). The service may show a persistent notification while status sync is required, then stops when sync is no longer needed. Location is not the primary purpose of this FGS type; it supports reliable data synchronization of booking/trip state for the passenger experience in the Democratic Republic of the Congo.

### Driver (`cd.mova.mova.driver`)

> SENGA Driver uses a foreground service of type `dataSync` while the driver is online so the app can reliably poll and synchronize ride/delivery/moving offers and mission assignments with our backend, even when the app is briefly backgrounded. The service shows a persistent notification (“SENGA Driver” / “En ligne — recherche de courses et missions”) on channel `mova_driver_online` for as long as the driver remains available, then stops when the driver goes offline. Location may be used separately for matching; the `dataSync` FGS purpose is continuous job/offer data synchronization for drivers operating in the Democratic Republic of the Congo.

---

## Exact next steps for you

1. Open `mobile/store-listing/senga/` and confirm both MP4 files open locally.
2. Upload **`fgs-senga-passenger-demo.mp4`** → YouTube Unlisted (or Drive link) → paste into Play Console for **Senga** (`cd.mova.mova.passenger`) FGS `dataSync` declaration, with the passenger purpose text above.
3. Upload **`fgs-senga-driver-demo.mp4`** → YouTube **Unlisted**, no ads (or Drive link) → paste into Play Console for **SENGA Driver** (`cd.mova.mova.driver`) FGS `dataSync` declaration, with the driver purpose text above. This file uses the **current** Driver icon.
4. Prefer the driver video when reviewers expect a **visible** persistent FGS notification.
5. Optional: if Play insists on a live FGS under the **passenger** package, either (a) add a short-lived passenger data-sync FGS during active trip tracking and re-record, or (b) explain that the shared module declares the type while runtime start is trip-lifecycle gated on passenger.

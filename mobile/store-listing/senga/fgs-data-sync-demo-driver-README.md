# Play Console — FOREGROUND_SERVICE_DATA_SYNC demo (SENGA Driver)



Play Console **FGS** demo only. User explainer storyboard (how to drive with the app): [`docs/video-scripts/chauffeur-mobile.md`](../../../docs/video-scripts/chauffeur-mobile.md). Store listing pointer: [`VIDEO-EXPLAINER.md`](VIDEO-EXPLAINER.md).

**Package:** `cd.mova.mova.driver`  

**Local video (canonical):** `fgs-senga-driver-demo.mp4` (~49.5s)  

**Alias (same file):** `fgs-data-sync-demo-driver.mp4`  

**Icon branding:** current SENGA Driver launcher (steering wheel / green gradient) from `mobile/assets/icon/movaicone_driver.png` — **not** the older colorful map-pin splash.



Backup of the previous (old-icon) clip: `_fgs-senga-driver-demo-prev.mp4`.



## What this video shows



1. Title card with the **current** SENGA Driver launcher icon  

2. SENGA Driver app UI (login / Espace chauffeur) with the same current icon  

3. System notification shade with the **persistent foreground-service notification**:

   - Title: **SENGA Driver**

   - Text: **En ligne — recherche de courses et missions**

   - Notification uses the **current** driver icon (not the old grey / map-pin assets)

4. Brief return to the app, then shade again so the FGS notification stays readable



**Foreground-service notification visible?** **Yes.**



## What to upload for Play Console



Play Console asks for a **Video link** (URL), not a raw file upload.



1. **YouTube (recommended):** Upload `fgs-senga-driver-demo.mp4` → visibility **Unlisted** → **no ads** / no age restriction → copy the watch URL.  

2. **Google Drive (fallback):** Upload the MP4 → Share → **Anyone with the link** (Viewer) → copy the link.



Paste that URL into **App content → Sensitive app permissions → Foreground service permissions** for **SENGA Driver** (`cd.mova.mova.driver`).



Do **not** reuse the passenger-only clip (`fgs-senga-passenger-demo.mp4` / `fgs-data-sync-demo.mp4`) for the driver declaration.



## Suggested purpose text (paste into Play Console)



> SENGA Driver uses a foreground service of type `dataSync` so that, while a driver is online, the app can reliably poll and synchronize ride, delivery, moving, and rental job offers/assignments with our backend even when the UI is backgrounded. The service shows a persistent notification (“SENGA Driver — En ligne — recherche de courses et missions”) for the duration of online availability, then stops when the driver goes offline. Location is not the primary purpose of this FGS type; it supports continuous data synchronization of job/offer state for drivers operating in the Democratic Republic of the Congo.



## Related files



| File | Role |

|------|------|

| `fgs-senga-driver-demo.mp4` | Canonical driver FGS demo (current icon) |

| `fgs-data-sync-demo-driver.mp4` | Same content (alias) |

| `fgs-data-sync-demo-driver-README.md` | This README |

| `_fgs-senga-driver-demo-prev.mp4` | Backup of older demo (old icon) |

| `fgs-data-sync-demo-README.md` | Combined passenger + driver notes |

| `_rebuild_fgs_driver_demo.py` | Rebuild script (Pillow + ffmpeg) |



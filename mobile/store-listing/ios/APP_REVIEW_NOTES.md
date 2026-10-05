# App Store Review — SENGA / SENGA Driver (Guideline 2.1)

Verified in production API on 2026-10-05: demo OTP works for both accounts.

## Demo accounts

| App | Bundle ID | Phone (username) | OTP / password | Notes |
|-----|-----------|------------------|----------------|-------|
| **Senga** (passenger) | `cd.mova.mova` | `+243900000010` | `123456` | Seed passenger |
| **Senga Driver** | `cd.mova.mova.driver` | `+243900000023` | `123456` | KYC-approved demo driver |

**Important (Driver):** `123456` is the **SMS OTP**, not the local PIN.  
On the PIN screen tap **« Code PIN oublié ? »**, then enter OTP `123456`.

## App Review Information (paste into ASC)

### Username
```
+243900000023
```
(Use `+243900000010` for the passenger app.)

### Password
```
123456
```

### Notes (English — Resolution Center / App Review Information)

```
DEMO ACCESS (Guideline 2.1)

Senga Driver (cd.mova.mova.driver):
1. Open the app → enter phone +243900000023 → Continue
2. On the PIN screen, tap "Code PIN oublié ?" (Forgot PIN). Do NOT enter 123456 as the local PIN.
3. Enter SMS OTP: 123456
4. Toggle Online to receive jobs. Account is KYC-approved for App Review.
5. Account deletion: Aide (Help) → Contacter le support. Privacy: https://senga.afri-soft.com/privacy

Senga passenger (cd.mova.mova):
1. Enter phone +243900000010 → Continue
2. Enter SMS OTP: 123456
3. Home → request a ride (destination in DRC / Kinshasa)
4. Account deletion: Aide → Contacter le support

Walkthrough videos are attached / available in the submission package:
- senga-driver-app-review-walkthrough.mp4
- senga-passenger-app-review-walkthrough.mp4

Backend: production API https://api.afri-soft.com — demo phones use fixed OTP 123456 while ALLOW_TEST_OTP is enabled for App Review.
```

### Notes (French — optionnel)

```
ACCÈS DÉMO (Guideline 2.1)

Senga Driver :
1. Téléphone +243900000023 → Continuer
2. Écran PIN → « Code PIN oublié ? » (ne pas saisir 123456 comme PIN)
3. OTP SMS : 123456
4. Activer En ligne. Compte KYC approuvé pour la review.
5. Suppression compte : Aide → Contacter le support

Senga (passager) :
1. Téléphone +243900000010 → Continuer
2. OTP SMS : 123456
3. Accueil → demander une course
```

## What to Test

```
1) Sign in with the demo phone + OTP above (Driver: use Forgot PIN first).
2) Driver: toggle Online; Passenger: open home and start a ride request.
3) Open Aide and confirm account-deletion instructions are reachable.
4) Optional: Google Sign-In if available on the review device; SMS OTP demo path is sufficient for core flows.
```

## Video files

| File | Path |
|------|------|
| Driver walkthrough | `mobile/store-listing/ios/senga-driver-app-review-walkthrough.mp4` |
| Passenger walkthrough | `mobile/store-listing/ios/senga-passenger-app-review-walkthrough.mp4` |

Regenerate:
```bash
python mobile/store-listing/ios/_gen_app_review_video.py
python mobile/store-listing/ios/_gen_passenger_app_review_video.py
```

## ASC reply checklist

1. Demo username / password / notes are pushed via workflow `iOS App Review Resubmit` (API).
2. App Store Connect → each app → **App Review** / Resolution Center
3. Attach the matching MP4 (API cannot attach video):
   - Driver → `senga-driver-app-review-walkthrough.mp4`
   - Passenger → `senga-passenger-app-review-walkthrough.mp4`
4. Confirm **Submit for Review** succeeded (workflow PATCH `reviewSubmissions.submitted=true`).

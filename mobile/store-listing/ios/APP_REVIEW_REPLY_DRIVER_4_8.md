# Reply — Senga Driver (Guideline 4.8 + 2.1)

Paste into **Reply to App Review** after the new build is on the submission.

```
Thank you for the review feedback.

We have addressed both issues:

────────────────────────────────
1) Guideline 4.8 — Login Services
────────────────────────────────
SENGA Driver on iOS now offers Sign in with Apple as a login option, shown with equal prominence next to Google Sign-In (when Google is available).

Login methods on iOS:
- Sign in with Apple
- Google Sign-In (optional)
- Phone number + local 6-digit PIN
- Phone number + SMS OTP (Forgot PIN)

Sign in with Apple uses the standard ASAuthorizationAppleIDButton / system sheet and verifies the identity token on our backend against Apple's JWKS (audiences: cd.mova.mova and cd.mova.mova.driver).

────────────────────────────────
2) Guideline 2.1 — Demo account access
────────────────────────────────
Updated demo credentials (also set in App Review Information):

Username (phone): +243900000023
Password (local PIN): 123456

How to sign in on the device under review:
1. Launch SENGA Driver
2. Enter phone +243900000023 → Continue
3. On the PIN pad, enter 123456 (this is the App Review demo PIN)
4. You will land in the driver home; toggle Online to receive jobs

Alternatively, use Continuer avec Apple with any Apple ID on the review device.

Notes:
- 123456 works as the local PIN for this seed demo account (App Review mode).
- The account is provisioned automatically when you tap Continue (PIN pad appears; no SMS required).
- Account deletion path: Aide → Contacter le support
- Privacy: https://senga.afri-soft.com/privacy

The demo driver is KYC-approved so Online works immediately.
```

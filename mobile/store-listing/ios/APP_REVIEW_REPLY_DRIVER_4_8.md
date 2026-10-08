# Reply — Senga Driver (Guideline 4.8 + 2.1)

Paste into **Reply to App Review** after the new build is on the submission.

```
Thank you for the updated review feedback (Oct 8, 2026).

We have addressed both issues:

────────────────────────────────
1) Guideline 4.8 — Login Services
────────────────────────────────
Google Sign-In has been removed from the iOS build of SENGA Driver.
The only login methods on iOS are:
- Phone number + local 6-digit PIN, or
- Phone number + SMS OTP (Forgot PIN)

There is no third-party login on iOS in this build, so Sign in with Apple is not required under 4.8 for this submission. We will add Sign in with Apple before re-enabling Google Sign-In on iOS in a future release.

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

Notes:
- 123456 works as the local PIN for this seed demo account (App Review mode).
- Account deletion path: Aide → Contacter le support
- Privacy: https://senga.afri-soft.com/privacy

The demo driver is KYC-approved so Online works immediately.
Please use the new build submitted with this reply.

Thank you.
```

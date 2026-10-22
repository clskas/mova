# OTP SMS — bascule Africa's Talking ↔ SerdiPay

OTP SMS est branché dans `packages/shared` → `mova-auth` / `mova-notification`.  
Le canal actif est choisi **uniquement** via `SMS_PROVIDER` (pas de fallback silencieux vers un autre fournisseur).

**Hub multi-apps AfriSoft** (contrat `/v1`, SENGA + Educongo + futures apps) : [AFRISOFT_SMS_OTP_HUB_API.md](./AFRISOFT_SMS_OTP_HUB_API.md).

**Prod SENGA :** les secrets SMS vont sur le VPS `sms.afri-soft.com` (`/opt/afrisoft-sms/.env`). `mova-auth` (Render) n’appelle **pas** SerdiPay/AT directement : `AFRISOFT_SMS_HUB_URL` + HMAC `app_id=senga`. OTP métier (génération / verify / JWT) reste dans `mova-auth` ; le hub transporte le SMS (`POST /v1/sms/send`). Numéros seed : `ALLOW_TEST_OTP=true` → code `123456` sans SMS.

| `SMS_PROVIDER` | Backend | Credentials requis |
|----------------|---------|-------------------|
| `africastalking` | Africa's Talking Messaging API | `AFRICAS_TALKING_USERNAME`, `AFRICAS_TALKING_API_KEY` (+ sender recommandé) |
| `serdipay` | SerdiPay SMS API (`sms-api.pdf`) | `SERDIPAY_SMS_API_ID`, `SERDIPAY_SMS_API_KEY` |
| `twilio` | Twilio | `TWILIO_*` |

Si `SMS_PROVIDER=serdipay` mais que les clés SMS manquent, l’API renvoie une erreur claire listant `SERDIPAY_SMS_API_ID` / `SERDIPAY_SMS_API_KEY` — elle **ne bascule pas** vers AT même si AT est configuré.

Mobile Money reste indépendant (`MOBILE_MONEY_GATEWAY=serdipay`).

## SerdiPay SMS (doc `sms-api.pdf`)

- **Auth** : `apiId` + `apiKey` dans le corps JSON (pas de Bearer / `get-token` paiement).
- **Send** : `POST {SERDIPAY_SMS_BASE_URL}/api/sms-api/v1/send`  
  Body : `{ apiId, apiKey, phone, senderId?, text }` — téléphone en `+243…`.
- **Prod** : `https://apis.serdipay.com` — **Staging** : `https://api.serdipay.cloud`
- **HTTP** : `200` OK · `400` API ID · `403` crédit SMS insuffisant · `404` bad request · `406` Not Acceptable
- Activation : admin SerdiPay active l’API SMS ; credentials envoyés par WhatsApp/mail.
- Ces credentials sont **distincts** de `SERDIPAY_EMAIL` / `SERDIPAY_PASSWORD` (paiement).

### Que répondre si SerdiPay demande « le lien SMS » ?

Deux choses distinctes — ne pas les mélanger :

| Ce qu’ils veulent | Lien à donner |
|-------------------|---------------|
| **Leur** API SMS (souvent : « donnez-nous le lien SerdiPay ») | `https://apis.serdipay.com` — endpoint d’envoi : `https://apis.serdipay.com/api/sms-api/v1/send` |
| **Votre** domaine / IP à whitelister (sortant vers eux) | `https://sms.afri-soft.com` · IP `178.104.82.66` |
| Callback **paiement** (souvent confondu avec SMS) | `https://pay.afri-soft.com/webhooks/serdipay` |
| Callback DLR SMS | **Pas exposé** — OTP est synchrone ; confirmer avec SerdiPay s’ils en exigent un |

Si l’agent SerdiPay dit « le lien SerdiPay » : il parle en général de **`https://apis.serdipay.com`** (leur plateforme), pas de `sms.afri-soft.com` (c’est *votre* hub).

En prod SENGA n’appelle pas SerdiPay depuis Render : le VPS hub `sms.afri-soft.com` détient `SERDIPAY_SMS_*` et POST vers `apis.serdipay.com`.

### Variables Render (SerdiPay SMS)

| Variable | Exemple | Notes |
|----------|---------|--------|
| `SMS_PROVIDER` | `serdipay` | Switch explicite |
| `SERDIPAY_SMS_BASE_URL` | `https://apis.serdipay.com` | Staging : `https://api.serdipay.cloud` |
| `SERDIPAY_SMS_PATH` | `/api/sms-api/v1/send` | Défaut code si vide |
| `SERDIPAY_SMS_API_ID` | *(secret)* | Fourni par SerdiPay |
| `SERDIPAY_SMS_API_KEY` | *(secret)* | Fourni par SerdiPay |
| `SERDIPAY_SMS_SENDER_ID` | `SerdiPay` ou `MOVA` | Sender approuvé côté SerdiPay |
| `SERDIPAY_SMS_USERNAME` | optionnel | Identité compte ; non envoyé dans `send` |

Ne pas committer les secrets. Local : `config/external-apis.env.example` → `config/external-apis.env`.

## Africa's Talking

Voir [AFRICAS_TALKING_SMS.md](./AFRICAS_TALKING_SMS.md).

| Variable | Exemple |
|----------|---------|
| `SMS_PROVIDER` | `africastalking` |
| `AFRICAS_TALKING_USERNAME` | `mova` |
| `AFRICAS_TALKING_API_KEY` | *(secret)* |
| `AFRICAS_TALKING_ENV` | `production` |
| `AFRICAS_TALKING_SMS_SENDER` | `MOVA` (alphanumeric **approuvé**) |

## Basculer

1. **Hub (recommandé)** : clés SerdiPay SMS uniquement dans `/opt/afrisoft-sms/.env` ; `SMS_PROVIDER=serdipay` ; recreate du conteneur. Côté Render `mova-auth` : `AFRISOFT_SMS_HUB_URL=https://sms.afri-soft.com` + `AFRISOFT_HUB_API_KEY` (même clé HMAC que `AFRISOFT_HUB_APPS` senga).
2. Dashboard → Environment Groups → **`mova-external-apis`** (évitez d’y coller `SERDIPAY_SMS_*` si le hub est le canal).
3. Pour **AT en secours sur le hub** : `SMS_PROVIDER=africastalking` + `AFRICAS_TALKING_*` dans `/opt/afrisoft-sms/.env`.
4. Redeploy **`mova-auth`** (et **`mova-notification`** si SMS statut course).
5. Tant que le SMS réel n’est pas validé : **`ALLOW_TEST_OTP=true`** (OTP `123456` sur numéros seed uniquement).

## Tester

```http
POST https://<gateway>/api/auth/otp/request
Content-Type: application/json

{ "phone": "+2438XXXXXXXX" }
```

Numéro **hors** whitelist seed → SMS réel. Logs `mova-auth` : provider `SERDIPAY` ou `AFRICASTALKING`.

## Blocages connus

| Blocage | Action |
|---------|--------|
| AT `InvalidSenderId` | Attendre approbation alphanumeric RDC ; ou basculer temporairement sur SerdiPay SMS. |
| SerdiPay SMS 400 « An error occor while processing the sms » | Le texte ne doit pas contenir `.` `:` `;` `!` `?` (sanitize + retry). Si ça continue : sender ID non approuvé (`SERDIPAY_SMS_SENDER_ID` vide ou `SerdiPay`), ou API SMS non activée / mauvaises clés. Recréer le conteneur hub VPS après déploiement du code. |
| SerdiPay SMS 403 | Recharger / augmenter crédit SMS chez SerdiPay. |
| Credentials paiement vs SMS | `SERDIPAY_EMAIL` ne suffit pas pour l’OTP — il faut `SERDIPAY_SMS_API_ID` / `KEY`. |
| Admin SMS non activé | Demander à SerdiPay d’activer l’API SMS sur le compte marchand. |
| API « SMS envoyé » mais téléphone vide | Texte court + sans sender brandé + `SMS_OTP_REDUNDANT_SEND=1` sur le hub ; contacter SerdiPay avec heure/`sms_id` (pas de DLR exposé). |

### Fiabilité livraison (SENT mais pas reçu)

SerdiPay peut renvoyer HTTP 200 « SMS sent successfully » alors que DreamDigital (transporteur) répond `status:F` / `Invalid Destination Address`. Cause fréquente : numéro en `+243…` — DreamDigital exige `243…` ou `0XXXXXXXXX`.

Mitigations code :

- Envoi avec `243…` puis `0…` (pas `+243` en premier)
- `senderId` **obligatoire** (HTTP 422 sinon)
- Rejet des faux succès si DreamDigital `status:F`
- Texte OTP FR court `Votre code SENGA 123456` — pas de `\n`+hash Retriever, `<#>` ni `@domaine #code` (SerdiPay 503). Autofill : iOS = barre Messages ; Android = SMS User Consent (popup système selon langue du téléphone).

## Bannière de mise à jour (apps)

Source de vérité : `services/ride-service/src/public/mobile-store-version.json` + miroir Render `MOBILE_*`.
Le script `scripts/sync-mobile-app-version-env.sh` (après upload Play) **miroir Render d’abord**, puis commit sur `main` avec rebase/retry — un `git push` en échec ne doit plus laisser l’API bloquée sur un ancien `versionCode`.
- `SMS_OTP_REDUNDANT_SEND=1` — 2ᵉ envoi ~1,5 s pour `purpose=login|otp`

## Fichiers code

- Client SerdiPay SMS : `packages/shared/src/serdipay.ts` (`serdiPaySendSms`)
- Client hub SMS : `packages/shared/src/afrisoft-sms-hub.ts` (`afrisoftSmsHubSendSms`)
- Client AT : `packages/shared/src/africas-talking.ts` (`africasTalkingSendSms`, `resolveSmsBackend`)
- OTP auth : `services/auth-service/src/auth/sms.providers.ts`
- Notifs : `services/notification-service/src/sms/sms.service.ts`

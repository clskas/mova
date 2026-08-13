# OTP SMS — bascule Africa's Talking ↔ SerdiPay

OTP SMS est branché dans `packages/shared` → `mova-auth` / `mova-notification`.  
Le canal actif est choisi **uniquement** via `SMS_PROVIDER` (pas de fallback silencieux vers un autre fournisseur).

**Hub multi-apps AfriSoft** (contrat `/v1`, SENGA + Educongo + futures apps) : [AFRISOFT_SMS_OTP_HUB_API.md](./AFRISOFT_SMS_OTP_HUB_API.md).

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
- **Prod** : `https://serdipay.com` — **Staging** : `https://api.serdipay.cloud`
- **HTTP** : `200` OK · `400` API ID · `403` crédit SMS insuffisant · `404` bad request · `406` Not Acceptable
- Activation : admin SerdiPay active l’API SMS ; credentials envoyés par WhatsApp/mail.
- Ces credentials sont **distincts** de `SERDIPAY_EMAIL` / `SERDIPAY_PASSWORD` (paiement).

### Variables Render (SerdiPay SMS)

| Variable | Exemple | Notes |
|----------|---------|--------|
| `SMS_PROVIDER` | `serdipay` | Switch explicite |
| `SERDIPAY_SMS_BASE_URL` | `https://serdipay.com` | Staging : `https://api.serdipay.cloud` |
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

## Basculer sur Render

1. Dashboard → Environment Groups → **`mova-external-apis`** (ou env de `mova-auth` / `mova-notification`).
2. Pour **SerdiPay** : poser `SMS_PROVIDER=serdipay` + `SERDIPAY_SMS_API_ID` / `SERDIPAY_SMS_API_KEY` (+ sender / base URL).
3. Pour **AT** : poser `SMS_PROVIDER=africastalking` + `AFRICAS_TALKING_*` (garder les clés SerdiPay SMS si vous voulez rebasculer plus tard).
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
| SerdiPay SMS 403 | Recharger / augmenter crédit SMS chez SerdiPay. |
| Credentials paiement vs SMS | `SERDIPAY_EMAIL` ne suffit pas pour l’OTP — il faut `SERDIPAY_SMS_API_ID` / `KEY`. |
| Admin SMS non activé | Demander à SerdiPay d’activer l’API SMS sur le compte marchand. |

## Fichiers code

- Client SerdiPay SMS : `packages/shared/src/serdipay.ts` (`serdiPaySendSms`)
- Client AT : `packages/shared/src/africas-talking.ts` (`africasTalkingSendSms`, `resolveSmsBackend`)
- OTP auth : `services/auth-service/src/auth/sms.providers.ts`
- Notifs : `services/notification-service/src/sms/sms.service.ts`

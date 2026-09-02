# Handoff SMS / OTP — hub AfriSoft (`sms.afri-soft.com`)

**Public :** autre application AfriSoft qui **gère ses propres utilisateurs**.  
**Langue :** français (termes techniques EN inchangés).  
**Version :** septembre 2026 — contrat réel de `services/sms-hub-service` sur le VPS Hetzner.  
**Hub :** `https://sms.afri-soft.com` — déploiement `/opt/afrisoft-sms` (ne pas confondre avec `https://pay.afri-soft.com`).

Ce document est **autonome**. Vous n’avez pas besoin de `mova-auth`, ni de JWT SENGA, ni des clés SerdiPay / Africa’s Talking.

Uniquement si vous voulez **les comptes SENGA** (JWT `mova-auth`) : suivez [AFRISOFT_OTP_LOGIN_INTEGRATION.md](../AFRISOFT_OTP_LOGIN_INTEGRATION.md). Ce n’est **pas** le chemin par défaut.

---

## 1. Ce que vous appelez / What you call

| À utiliser | Ne pas utiliser |
|------------|-----------------|
| `https://sms.afri-soft.com` | `https://pay.afri-soft.com` (paiements) |
| `POST /v1/sms/send` (flux recommandé) | `https://api.afri-soft.com/api/auth/otp/*` (identité SENGA) |
| Headers HMAC `X-AfriSoft-*` depuis **votre backend** | Clés `SERDIPAY_SMS_*`, `AFRICAS_TALKING_*`, JWT SENGA |

```
Votre app (vos users, votre session)
        │
        │  1. générer OTP 6 chiffres, hash + TTL dans VOTRE DB
        │  2. POST /v1/sms/send  (HMAC)
        ▼
https://sms.afri-soft.com   ←  VPS /opt/afrisoft-sms
        │
        ▼
SerdiPay / Africa’s Talking  (secrets uniquement sur le hub)
```

Appelez le hub **uniquement depuis votre serveur**. Jamais depuis le mobile / le navigateur (la clé HMAC fuirait).

---

## 2. Authentification / Auth (HMAC)

Quatre headers **obligatoires** (noms exacts, code `hmac.guard.ts`) :

| Header | Valeur |
|--------|--------|
| `X-AfriSoft-App-Id` | `app_id` minuscules (`educongo`, `votreapp`, …) |
| `X-AfriSoft-Api-Key` | secret HMAC (même valeur que pour signer) |
| `X-AfriSoft-Timestamp` | Unix **secondes** |
| `X-AfriSoft-Signature` | hex HMAC-SHA256 |
| `Content-Type` | `application/json` |

```
string_to_sign = "{timestamp}.{METHOD}.{path}.{raw_body}"
signature      = hex( HMAC-SHA256(api_key, string_to_sign) )
```

- `path` : chemin exact **sans** host ni query, ex. `/v1/sms/send`
- `raw_body` : le JSON **exact** envoyé. Signez `JSON.stringify(obj)` puis envoyez **cette** chaîne.
- Skew max : **300 s** → sinon 401 `HUB_AUTH_TIMESTAMP_SKEW`
- `app_id` du body = header, sinon 403 `HUB_APP_MISMATCH`

---

## 3. Flux recommandé — OTP chez vous, SMS via le hub

Le hub **transporte** le SMS. **Vous** générez le code, vous le stockez (hash), vous le vérifiez, vous ouvrez **votre** session.

### 4 étapes

1. **Générer** un OTP 6 chiffres (`100000`–`999999`). Jamais un code fixe en prod.
2. **Stocker** dans **votre** DB / Redis : `sha256(pepper + ":" + code)` + `phone` + `expires_at` (~5 min) + compteur `attempts`.
3. **Envoyer** le SMS : `POST https://sms.afri-soft.com/v1/sms/send` (texte court, ~160 caractères GSM). Incluez le code **vous-même** dans `text`.
4. **Vérifier** chez vous : comparer le hash, lock après 5 échecs, **supprimer** le record si OK, émettre **votre** JWT / cookie.

Rate-limitez **vous-mêmes** (cooldown ~60 s / numéro, plafond ~5 SMS / 15 min). `/v1/sms/send` n’applique pas le cooldown OTP du hub (celui-ci ne s’applique qu’à `/v1/otp/send`).

---

## 4. Envoyer un SMS — `POST /v1/sms/send`

**Request**

```http
POST /v1/sms/send HTTP/1.1
Host: sms.afri-soft.com
Content-Type: application/json
X-AfriSoft-App-Id: educongo
X-AfriSoft-Api-Key: CHANGE_ME
X-AfriSoft-Timestamp: 1735689600
X-AfriSoft-Signature: <hmac_hex>
```

```json
{
  "app_id": "educongo",
  "phone": "243970000001",
  "text": "Votre code Educongo : 482913 Valide 5 minutes",
  "reference": "educongo_login_550e8400-e29b-41d4-a716-446655440000",
  "idempotency_key": "educongo:login:243970000001:2026-09-02T15"
}
```

| Champ | Obligatoire | Notes |
|-------|-------------|--------|
| `app_id` | oui | Identique au header |
| `phone` | oui | RDC, §6 |
| `text` | oui | 1–640 caractères. Mettez-y le code. |
| `reference` | recommandé | `{app_id}_{purpose}_{uuid}` |
| `idempotency_key` | recommandé | Body, **pas** un header. Fenêtre Redis **600 s**. |

**Response 200**

```json
{
  "sms_id": "sms_a1b2c3d4e5f67890",
  "status": "SENT",
  "reference": "educongo_login_550e8400-e29b-41d4-a716-446655440000",
  "provider": "serdipay",
  "phone_masked": "243****0001"
}
```

Le hub **ne génère pas** et **ne stocke pas** l’OTP sur cet endpoint. Si `status` = `SENT`, le fournisseur a accepté le SMS.

Même `idempotency_key` rejouée dans 10 min → **pas** de second SMS ; même `sms_id` + `status`. Distinct de `reference` (corrélation métier).

---

## 5. Variante optionnelle — le hub génère l’OTP

Si vous ne voulez pas stocker d’OTP : `POST /v1/otp/send` puis `POST /v1/otp/verify`. Après `verified: true`, créez **votre** session. Le hub ne crée pas d’utilisateur.

**Send** `{ "app_id", "phone", "purpose", "locale", "reference", "idempotency_key" }`  
Réponse : `{ "otp_id", "status": "SENT", "phone_masked", "expires_in_sec": 300, "provider", "message" }` — **jamais** le code en clair en prod.

**Verify** `{ "app_id", "phone", "code", "reference" }`  
Succès : `{ "verified": true, "otp_id", "reference", "purpose" }` (one-shot).  
Échec : `{ "verified": false, "reason": "INVALID_OR_EXPIRED"|"LOCKED", "attempts_remaining": 2 }`.

Texte SMS (marque = `APP_BRAND_NAMES` sur le VPS) :

- FR : `Votre code Educongo : 482913 Valide 5 minutes`
- EN : `Your Educongo code: 482913 Valid 5 minutes`

---

## 6. Téléphone RDC (`+243`)

Normalisé en `243XXXXXXXXX` (9 chiffres après `243`, **sans** `+`). Accepté en entrée :

| Entrée | Résultat |
|--------|----------|
| `+243970000001` | `243970000001` |
| `243970000001` | inchangé |
| `0970000001` (10 chiffres, `0` local) | `243970000001` |

Sinon HTTP **400**, `PHONE_INVALID`.

Évitez les numéros démo SENGA `2439000000xx` : le hub **n’envoie pas** de SMS réel (seed).

---

## 7. Erreurs, health, rate limits

Health public (sans HMAC) : `GET https://sms.afri-soft.com/health` → `{ "status", "provider", "apps": ["senga", "educongo", …] }`.

| HTTP | Code typique | Quand |
|------|--------------|--------|
| 401 | `HUB_AUTH_MISSING`, `HUB_AUTH_INVALID_KEY`, `HUB_AUTH_BAD_TIMESTAMP`, `HUB_AUTH_TIMESTAMP_SKEW`, `HUB_AUTH_BAD_SIGNATURE` | Headers / clé / HMAC / horloge |
| 403 | `HUB_APP_UNKNOWN`, `HUB_APP_MISMATCH` | `app_id` absent du registre, ou header ≠ body |
| 400 | `PHONE_INVALID` | Téléphone / body (`text` > 640) |
| 429 | `OTP_COOLDOWN`, `OTP_RATE_LIMIT` | Uniquement `/v1/otp/send` |
| 503 | `SMS_SEND_FAILED` | Fournisseur SMS indisponible |

Rate limits hub (`/v1/otp/send` seulement — défauts code / VPS) :

| Règle | Défaut | Variable hub (VPS, pas chez vous) |
|-------|--------|-----------------------------------|
| TTL du code | 300 s | `OTP_TTL_SEC` |
| Cooldown entre deux envois | 60 s | `OTP_COOLDOWN_SEC` |
| Plafond / téléphone | 5 / 900 s | `OTP_MAX_PER_PHONE_WINDOW`, `OTP_RATE_WINDOW_SEC` |
| Tentatives verify | 5 puis lock | `OTP_MAX_ATTEMPTS` |

HTTP **429** : `{ "message": "OTP cooldown active"|"OTP rate limit exceeded for this phone", "code": "OTP_COOLDOWN"|"OTP_RATE_LIMIT", "retry_after_sec": N }`.

---

## 8. Variables d’environnement / Env

Fichier placeholders : [afrisoft-sms-hub.env.example](./afrisoft-sms-hub.env.example). Copiez-le en `.env` **local / privé** (hors git).

| Variable **côté votre app** | D’où ça vient |
|-----------------------------|---------------|
| `AFRISOFT_SMS_HUB_URL` | Toujours `https://sms.afri-soft.com` (alias accepté : `SMS_HUB_URL`) |
| `AFRISOFT_HUB_APP_ID` | Partie **gauche** d’une paire dans `AFRISOFT_HUB_APPS` sur le VPS |
| `AFRISOFT_HUB_API_KEY` | Partie **droite** de cette paire (`app_id:api_key`) — header + HMAC |

**Source ops (noms seuls) :** `/opt/afrisoft-sms/.env` sur le VPS Hetzner.

- Extraire **uniquement** la paire utile de `AFRISOFT_HUB_APPS` (`senga:<clé>,educongo:<clé>,votreapp:<clé>`).
- Transmettre les 3 lignes **par canal privé** (pas GitHub, pas ce dépôt, pas `sms.json`).
- **Ne jamais** copier `SERDIPAY_SMS_*`, `AFRICAS_TALKING_*`, `OTP_PEPPER`, `MOCK_OTP_CODE`.

Noms présents sur le VPS (liste, pas de valeurs) : `SMS_IMAGE`, `SMS_PROVIDER`, `MOCK_*`, `OTP_TTL_SEC`, `OTP_MAX_ATTEMPTS`, `OTP_COOLDOWN_SEC`, `OTP_PEPPER`, `AFRISOFT_HUB_APPS`, `APP_BRAND_NAMES`, `CORS_ORIGIN`, `AFRICAS_TALKING_*`, `SERDIPAY_SMS_*`.

---

## 9. cURL + Node (aucun secret)

```bash
export AFRISOFT_SMS_HUB_URL=https://sms.afri-soft.com
export AFRISOFT_HUB_APP_ID=educongo
# export AFRISOFT_HUB_API_KEY=CHANGE_ME   # canal privé, pas git
TS=$(date +%s)
BODY='{"app_id":"educongo","phone":"243970000001","text":"Votre code Educongo : 482913 Valide 5 minutes","reference":"educongo_login_550e8400-e29b-41d4-a716-446655440000","idempotency_key":"educongo:login:243970000001:slot1"}'
SIG=$(node -e "const c=require('crypto');process.stdout.write(c.createHmac('sha256',process.env.AFRISOFT_HUB_API_KEY).update(process.argv[1]+'.POST./v1/sms/send.'+process.argv[2]).digest('hex'))" "$TS" "$BODY")
curl -sS -X POST "$AFRISOFT_SMS_HUB_URL/v1/sms/send" \
  -H "Content-Type: application/json" \
  -H "X-AfriSoft-App-Id: $AFRISOFT_HUB_APP_ID" \
  -H "X-AfriSoft-Api-Key: $AFRISOFT_HUB_API_KEY" \
  -H "X-AfriSoft-Timestamp: $TS" \
  -H "X-AfriSoft-Signature: $SIG" \
  -d "$BODY"
```

```js
import crypto from 'node:crypto';

const base = process.env.AFRISOFT_SMS_HUB_URL; // https://sms.afri-soft.com
const appId = process.env.AFRISOFT_HUB_APP_ID;
const apiKey = process.env.AFRISOFT_HUB_API_KEY;
const path = '/v1/sms/send';
const body = JSON.stringify({
  app_id: appId,
  phone: '243970000001',
  text: 'Votre code Demo : 482913 Valide 5 minutes',
  reference: `${appId}_login_${crypto.randomUUID()}`,
  idempotency_key: `${appId}:login:243970000001:demo1`,
});
const ts = String(Math.floor(Date.now() / 1000));
const sig = crypto.createHmac('sha256', apiKey).update(`${ts}.POST.${path}.${body}`).digest('hex');

const res = await fetch(`${base}${path}`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-AfriSoft-App-Id': appId,
    'X-AfriSoft-Api-Key': apiKey,
    'X-AfriSoft-Timestamp': ts,
    'X-AfriSoft-Signature': sig,
  },
  body,
});
console.log(res.status, await res.json());
```

Snippet copiable : [afrisoft-sms-otp/send-sms.example.mjs](./afrisoft-sms-otp/send-sms.example.mjs).

---

## 10. Checklist

1. AfriSoft enregistre votre `app_id` dans `AFRISOFT_HUB_APPS` (idéal : clé dédiée, pas celle de `senga`).
2. Vous recevez `AFRISOFT_HUB_APP_ID` + `AFRISOFT_HUB_API_KEY` **en privé**.
3. HMAC uniquement côté backend ; OTP 6 chiffres + hash + TTL **chez vous**.
4. `GET /health` puis un vrai `+243` (hors `2439000000xx`) via `POST /v1/sms/send`.
5. Gérer 401 / 403 / 429 / 503. Ne pas ouvrir un compte SerdiPay SMS séparé.

Contrat long : [AFRISOFT_SMS_OTP_HUB_API.md](../AFRISOFT_SMS_OTP_HUB_API.md).

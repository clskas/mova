# Pack d’intégration — SMS OTP AfriSoft (app sœur)

**Public :** équipe d’une **autre application AfriSoft** qui veut le même canal SMS / OTP que SENGA, **sans** réutiliser les comptes SENGA.  
**Langue :** français  
**Version :** septembre 2026 — contrat réel du hub `sms-hub-service`  
**URL de base :** `https://sms.afri-soft.com`  
**Ne pas utiliser :** `pay.afri-soft.com` (paiements) · `api.afri-soft.com` (identité SENGA)

Ce dossier est **autonome**. Contrat détaillé : [AFRISOFT_SMS_OTP_HUB_API.md](../../AFRISOFT_SMS_OTP_HUB_API.md).

---

## 0. Ce que vous recevez / ce que vous ne recevez pas

| Vous recevez (à coller dans *votre* `.env`) | Vous ne recevez **jamais** |
|---------------------------------------------|----------------------------|
| `AFRISOFT_SMS_HUB_URL` | `SERDIPAY_SMS_API_ID` / `SERDIPAY_SMS_API_KEY` |
| `AFRISOFT_HUB_APP_ID` | `AFRICAS_TALKING_*` |
| `AFRISOFT_HUB_API_KEY` | `OTP_PEPPER`, `MOCK_OTP_CODE` |
| (même clé HMAC que le hub SMS VPS) | JWT SENGA, `DATABASE_URL`, clés pay.afri-soft.com |

Les secrets fournisseur SMS restent **uniquement** sur le VPS `/opt/afrisoft-sms/.env`. Votre backend parle au hub ; le hub parle à SerdiPay / Africa’s Talking.

**Ne jamais committer** le `.env` rempli (GitHub, Slack public, tickets, captures d’écran). Voir [PRIVATE_NOTE.md](./PRIVATE_NOTE.md).

---

## 1. Flux recommandé (votre app, vos utilisateurs)

Le hub transporte le SMS. **Vous** générez le code, vous le stockez (hash), vous le vérifiez. Pas de JWT SENGA.

```
1. Backend  →  génère un OTP 6 chiffres, hash SHA-256, TTL ~5 min (Redis / DB)
2. Backend  →  POST https://sms.afri-soft.com/v1/sms/send   (HMAC, §3)
3. Utilisateur reçoit le SMS  « Votre code {MARQUE} : 482913 Valide 5 minutes »
4. Backend  →  compare le hash, invalide le code (one-shot), ouvre VOTRE session
```

Appelez le hub **uniquement depuis votre serveur**. Jamais depuis le mobile / le navigateur (la clé HMAC fuirait).

### Variante A — le hub génère et vérifie l’OTP

Si vous ne voulez pas stocker d’OTP : `POST /v1/otp/send` puis `POST /v1/otp/verify` (§5). Toujours **vos** comptes après `verified: true` — le hub ne crée pas d’utilisateur.

### Variante B — mêmes comptes SENGA (optionnel)

Uniquement si l’autre app doit **partager les utilisateurs SENGA** (JWT `mova-auth`) : suivez [AFRISOFT_OTP_LOGIN_INTEGRATION.md](../../AFRISOFT_OTP_LOGIN_INTEGRATION.md) (`https://api.afri-soft.com/api/auth/otp/*`). Ce n’est **pas** le chemin par défaut.

---

## 2. Authentification (app → hub)

Quatre headers **obligatoires** (noms exacts du code `hmac.guard.ts`) :

| Header | Exemple |
|--------|---------|
| `X-AfriSoft-App-Id` | `educongo` (minuscules) |
| `X-AfriSoft-Api-Key` | même secret que HMAC |
| `X-AfriSoft-Timestamp` | Unix **secondes** (ex. `1735689600`) |
| `X-AfriSoft-Signature` | hex HMAC-SHA256 |
| `Content-Type` | `application/json` |

Formule (identique au hub paiements) :

```
string_to_sign = "{timestamp}.{METHOD}.{path}.{raw_body}"
signature      = hex( HMAC-SHA256(api_key, string_to_sign) )
```

- `path` : chemin exact **sans** host ni query, ex. `/v1/sms/send`
- `raw_body` : le JSON **exact** envoyé (même espaces, même ordre de clés). Signez `JSON.stringify(obj)` puis envoyez **cette** chaîne.
- Skew max : **300 secondes**. Au-delà → 401 `HUB_AUTH_TIMESTAMP_SKEW`.
- `app_id` du body doit égaler le header (sinon 403 `HUB_APP_MISMATCH`).

---

## 3. Envoyer un SMS OTP — `POST /v1/sms/send`

C’est l’endpoint du flux recommandé.

**Requête**

```http
POST /v1/sms/send HTTP/1.1
Host: sms.afri-soft.com
Content-Type: application/json
X-AfriSoft-App-Id: educongo
X-AfriSoft-Api-Key: YOUR_SMS_HUB_API_KEY
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
| `phone` | oui | RDC, voir §6 |
| `text` | oui | 1–640 caractères. Incluez le code **vous-même**. |
| `reference` | recommandé | `{app_id}_{purpose}_{uuid}` |
| `idempotency_key` | recommandé | Protège les retries HTTP (body, **pas** un header) |

**Réponse 200**

```json
{
  "sms_id": "sms_a1b2c3d4e5f67890",
  "status": "SENT",
  "reference": "educongo_login_550e8400-e29b-41d4-a716-446655440000",
  "provider": "serdipay",
  "phone_masked": "243****0001"
}
```

Le hub **ne génère pas** et **ne stocke pas** l’OTP sur cet endpoint. Si `status` = `SENT`, le SMS a été accepté par le fournisseur.

**Échec envoi** → HTTP **503** (`SMS_SEND_FAILED`). L’enveloppe d’erreur Nest est :

```json
{
  "success": false,
  "error": { "code": "INTERNAL_ERROR", "message": "…" },
  "timestamp": "2026-09-02T15:00:00.000Z"
}
```

(`code` HTTP 503 peut aussi remonter `SMS_SEND_FAILED` dans les logs hub ; le client doit surtout tester le **status HTTP**.)

---

## 4. Comment votre backend gère l’OTP

1. Tirer 6 chiffres (`100000`–`999999`), jamais un code fixe en prod.
2. Stocker `sha256(pepper + ":" + code)` + `phone` + `expires_at` (5 min) + `attempts`.
3. Envoyer le SMS via `/v1/sms/send` (texte court, ~160 caractères GSM).
4. Au verify : comparer le hash, incrémenter `attempts`, lock après 5 échecs, **supprimer** le record si OK.
5. Émettre **votre** session (JWT / cookie) — pas un token SENGA.

Rate-limitez **vous-mêmes** (cooldown 60 s / numéro, plafond ~5 SMS / 15 min). `/v1/sms/send` n’applique pas le cooldown OTP du hub (celui-ci ne s’applique qu’à `/v1/otp/send`).

---

## 5. Variante hub OTP — `POST /v1/otp/send` + `/v1/otp/verify`

Le hub tire le code 6 chiffres, le hash (pepper VPS), envoie le SMS, et vérifie.

**Send** — body :

```json
{
  "app_id": "educongo",
  "phone": "243970000001",
  "purpose": "login",
  "locale": "fr",
  "reference": "educongo_login_550e8400-e29b-41d4-a716-446655440000",
  "idempotency_key": "educongo:login:243970000001:slot1"
}
```

**Réponse 200** (jamais le code en clair en prod) :

```json
{
  "otp_id": "otp_01HZX…",
  "status": "SENT",
  "reference": "educongo_login_550e8400-e29b-41d4-a716-446655440000",
  "phone_masked": "243****0001",
  "expires_in_sec": 300,
  "provider": "serdipay",
  "message": "Code envoyé."
}
```

Texte SMS généré par le hub (marque = `APP_BRAND_NAMES` sur le VPS) :

- FR : `Votre code Educongo : 482913 Valide 5 minutes`
- EN : `Your Educongo code: 482913 Valid 5 minutes`

**Verify**

```json
{
  "app_id": "educongo",
  "phone": "243970000001",
  "code": "482913",
  "reference": "educongo_login_550e8400-e29b-41d4-a716-446655440000"
}
```

Succès : `{ "verified": true, "otp_id", "reference", "purpose" }` — code **one-shot**.  
Échec : `{ "verified": false, "reason": "INVALID_OR_EXPIRED"|"LOCKED", "attempts_remaining": 2 }`.

---

## 6. Téléphone RDC, limites, erreurs, idempotence

### Téléphone

Normalisé en `243XXXXXXXXX` (9 chiffres après `243`, **sans** `+`). Accepté en entrée :

| Entrée | Résultat |
|--------|----------|
| `+243970000001` | `243970000001` |
| `243970000001` | inchangé |
| `00970970000001` si déjà `243…` | `243…` |
| `0970000001` (10 chiffres, `0` local) | `243970000001` |

Sinon HTTP **400**, `PHONE_INVALID`.

Évitez les numéros démo SENGA `+2439000000xx` : le hub **n’envoie pas** de SMS réel (seed).

### Rate limits (`/v1/otp/send` uniquement — défauts code, confirmés sur le VPS pour TTL / cooldown / attempts)

| Règle | Défaut | Variable hub |
|-------|--------|----------------|
| TTL du code | 300 s | `OTP_TTL_SEC` |
| Cooldown entre deux envois (même `app_id`+téléphone) | 60 s | `OTP_COOLDOWN_SEC` |
| Plafond / téléphone | 5 / 900 s | `OTP_MAX_PER_PHONE_WINDOW`, `OTP_RATE_WINDOW_SEC` |
| Tentatives verify | 5 puis lock | `OTP_MAX_ATTEMPTS` |

HTTP **429** : `{ "message": "OTP cooldown active"|"OTP rate limit exceeded for this phone", "code": "OTP_COOLDOWN"|"OTP_RATE_LIMIT", "retry_after_sec": N }`.

### Auth / validation

| HTTP | Quand |
|------|--------|
| 401 | Headers manquants, mauvaise clé, timestamp, HMAC |
| 403 | `app_id` inconnu (`AFRISOFT_HUB_APPS`) ou mismatch header/body |
| 400 | Téléphone / body invalide (`text` > 640) |
| 429 | Cooldown / quota OTP hub |
| 503 | Fournisseur SMS indisponible |

Health public (sans HMAC) : `GET https://sms.afri-soft.com/health` → `{ "status", "provider", "apps": ["senga", "educongo", …] }`.

### Idempotence

Champ body `idempotency_key`. Fenêtre Redis **600 s** (10 min).

- Même clé rejouée → **pas** de second SMS ; même `sms_id` / `otp_id` + `status`.
- Distinct de `reference` (corrélation métier).
- Suggestion : `{app_id}:{purpose}:{phone}:{fenêtre}` (ex. tranche de 5 min).

`reference` recommandé : `{app_id}_{purpose}_{uuid}` (`[a-z0-9]+` pour app/purpose).

---

## 7. Exemple Node (aucun secret)

Fichier copiable : [send-sms.example.mjs](./send-sms.example.mjs).

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

cURL (PowerShell : générez `SIG` avec Node, puis `curl`) :

```bash
# Unix / Git Bash
export AFRISOFT_SMS_HUB_URL=https://sms.afri-soft.com
export AFRISOFT_HUB_APP_ID=educongo
# export AFRISOFT_HUB_API_KEY=…   # depuis le fichier rempli en privé, pas git
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

---

## 8. Fichier d’environnement

Copiez [env.example](./env.example) → `.env` **local** (hors git). Noms de variables = ceux du client SENGA / du registre hub VPS.

| Variable (votre app) | Source VPS (`/opt/afrisoft-sms/.env`) |
|----------------------|----------------------------------------|
| `AFRISOFT_SMS_HUB_URL` | Toujours `https://sms.afri-soft.com` |
| `AFRISOFT_HUB_APP_ID` | Clé gauche d’une paire dans `AFRISOFT_HUB_APPS` (ex. `educongo`) |
| `AFRISOFT_HUB_API_KEY` | Clé droite de cette paire (`app_id:api_key`) |

`AFRISOFT_HUB_APPS` vaut `senga:<secret>,educongo:<secret>,…`. AfriSoft ops peut ajouter un `app_id` dédié (recommandé) plutôt que de partager la clé `senga`.

Alias acceptés par le client SENGA (inutile si vous copiez l’exemple) : `SMS_HUB_URL`, `AFRISOFT_PAY_HUB_API_KEY`.

---

## 9. Checklist onboarding

1. AfriSoft enregistre votre `app_id` dans `AFRISOFT_HUB_APPS` (et `APP_BRAND_NAMES` si vous utilisez `/v1/otp/send`).
2. Vous recevez le `.env` rempli **par canal privé** (pas GitHub).
3. HMAC uniquement côté backend.
4. Flux recommandé : OTP local + `POST /v1/sms/send`.
5. Tester `GET /health` puis un vrai `+243` (hors `2439000000xx`).
6. Gérer 401 / 403 / 429 / 503.
7. Ne pas ouvrir un compte SerdiPay / Africa’s Talking séparé.

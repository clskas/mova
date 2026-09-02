# AfriSoft SMS / OTP Hub — Contrat d’API

**Version :** 1.0 — Août 2026  
**Public :** équipes AfriSoft (SENGA / Mova, Educongo, applications futures)  
**Statut :** contrat cible multi-apps (architecture B) + état réel SENGA documenté  
**Langue :** français (en-têtes bilingues FR / EN)  
**Companion :** [AFRISOFT_PAYMENT_HUB_API.md](./AFRISOFT_PAYMENT_HUB_API.md) (même pattern auth / `app_id`)  
**Pack apps sœurs (OTP local + `/v1/sms/send`) :** [integrations/afrisoft-sms-otp/](./integrations/afrisoft-sms-otp/README.md)

---

## 1. Réponses clés / Key answers

### Pourquoi un hub SMS/OTP (et pas un compte AT / SerdiPay par app) ?

**Même logique que le hub paiements.** Un seul contrat fournisseur, **un Sender ID** (alphanumeric approuvé RDC), un jeu de credentials, et une surface d’intégration unique pour toutes les apps AfriSoft.

| Sans hub | Avec hub |
|----------|----------|
| N comptes AT / SerdiPay SMS | **1** contrat derrière le hub |
| N Sender IDs à faire approuver | **1** Sender ID partagé (ou whitelist contrôlée) |
| Credentials dispersés dans chaque app | Secrets **uniquement** dans le hub |
| Onboarding long pour chaque nouvelle app | Nouvelle app = `app_id` + clé API |

Les applications clientes (Educongo, futures apps…) appellent le hub en HTTPS ; elles **ne stockent jamais** `AFRICAS_TALKING_*` ni `SERDIPAY_SMS_*`.

### Les apps doivent-elles être sur le même VPS que le hub SMS ?

**Non.** Comme pour `pay.afri-soft.com` : seul le **module SMS** qui dialogue avec Africa’s Talking et/ou SerdiPay SMS détient les credentials. Les apps peuvent tourner n’importe où (Render, Vercel, autre VPS…), à condition d’appeler l’API HTTPS du hub avec `app_id` + HMAC.

### Relation avec `mova-auth` aujourd’hui ?

Aujourd’hui les apps SENGA (mobile / gateway) appellent **`mova-auth`** : `POST /api/auth/otp/request` et `POST /api/auth/otp/verify`. Le hub devient la **couche SMS/OTP multi-apps** ; `mova-auth` reste le service d’identité SENGA (JWT, users, PIN) et pourra **consommer** le hub en interne, ou **exposer** le contrat `/v1` en phase 1 (voir §8).

---

## 2. Architecture / Architecture overview

```
SENGA ──┐
Educongo┼── HTTPS (app_id + API key / HMAC) ──►  Module SMS / OTP AfriSoft
Future ─┘                                         (hub derrière sms.afri-soft.com
                                                   — phase 1 : peut vivre dans mova-auth)
                                                    • auth app
                                                    • génère / stocke OTP (TTL)
                                                    • 1 seul dialogue fournisseur SMS
                                                    • 1 Sender ID
                                                              │
                                              SMS_PROVIDER = africastalking | serdipay
                                                              │
                              ┌───────────────────────────────┴────────────────────────┐
                              ▼                                                        ▼
                      Africa's Talking                                          SerdiPay SMS
                      (Messaging API)                                           (sms-api)
```

### Règles d’or

1. **Seul le hub** détient les secrets AT / SerdiPay SMS et envoie les SMS.
2. Chaque app a un **`app_id`** stable (`senga`, `educongo`, …) — **mêmes identifiants** que le hub paiements quand c’est possible.
3. Chaque envoi OTP a une **référence unique** : `{app_id}_{purpose}_{uuid}` (voir §5).
4. Le switch fournisseur est **explicite** : `SMS_PROVIDER=africastalking|serdipay` (pas de fallback silencieux) — déjà dans le code SENGA.
5. Les apps **ne stockent jamais** les credentials fournisseur SMS.
6. Les téléphones finaux **n’appellent pas** le hub : seuls les backends d’apps (server-to-server).

**État code actuel (août 2026) :** SENGA envoie déjà des OTP via `mova-auth` → `packages/shared` (`africas-talking.ts`, `serdipay.ts` / `serdiPaySendSms`, `sms.providers.ts`). Les endpoints **`/v1/*` multi-apps** ci-dessous sont le **contrat d’intégration** à stabiliser ; l’extraction en microservice dédié est **phase 2**.

---

## 3. Authentification / Auth (`app_id` + clé + HMAC)

Aligné sur le [hub paiements](./AFRISOFT_PAYMENT_HUB_API.md) §3 — mêmes headers, même formule HMAC.

Chaque application reçoit à l’onboarding :

| Élément | Description |
|---------|-------------|
| `app_id` | Identifiant public (`senga`, `educongo`) |
| `api_key` | Clé secrète (header) — ne jamais committer |
| Quotas / rate limits | Ex. OTP/heure/téléphone et OTP/jour/`app_id` (config hub) |

> Les webhooks sortants ne sont **pas** requis pour l’OTP (réponse synchrone send/verify). Un `webhook_secret` n’est nécessaire que si une app s’abonne plus tard à des événements optionnels (`sms.delivered`, etc.) — hors scope phase 1.

### Headers requis (app → hub)

```http
X-AfriSoft-App-Id: educongo
X-AfriSoft-Api-Key: <api_key>
X-AfriSoft-Timestamp: 1735689600
X-AfriSoft-Signature: <hmac_hex>
Content-Type: application/json
```

### Signature HMAC-SHA256 (app → hub)

```
string_to_sign = "{timestamp}.{METHOD}.{path}.{raw_body}"
signature      = hex( HMAC_SHA256(api_key, string_to_sign) )
```

- `timestamp` : Unix seconds ; le hub rejette si `|now - timestamp| > 300` (5 min).
- `path` : chemin exact sans host, ex. `/v1/otp/send`.
- `raw_body` : corps JSON brut (chaîne vide si GET).

Exemple (Node) :

```js
const crypto = require('crypto');
const ts = Math.floor(Date.now() / 1000).toString();
const method = 'POST';
const path = '/v1/otp/send';
const body = JSON.stringify(payload);
const sig = crypto
  .createHmac('sha256', apiKey)
  .update(`${ts}.${method}.${path}.${body}`)
  .digest('hex');
```

> **Note SENGA interne :** les apps mobiles SENGA utilisent aujourd’hui des appels publics / semi-publics vers `/api/auth/otp/*` (pas ce schéma). Le schéma `app_id` + HMAC s’applique aux **backends d’apps sœurs** et, à terme, au backend SENGA qui appellerait le hub au lieu d’embarquer le provider SMS.

---

## 4. Endpoints / Endpoints

Base URL cible (phase 2) : `https://sms.afri-soft.com`  
Préfixe contrat multi-apps : `/v1`.

**Phase 1 (pragmatique) :** même contrat peut être exposé derrière le gateway SENGA / `mova-auth`, par ex. `https://<gateway>/api/sms-hub/v1/...` ou un reverse-proxy, **sans changer** les chemins relatifs `/v1/otp/*`. Voir §8.

### 4.1 Envoyer un OTP — `POST /v1/otp/send`

**Body :**

```json
{
  "app_id": "educongo",
  "phone": "243970000001",
  "purpose": "login",
  "locale": "fr",
  "reference": "educongo_login_550e8400-e29b-41d4-a716-446655440000",
  "idempotency_key": "educongo:login:243970000001:2026-08-13T10"
}
```

| Champ | Obligatoire | Notes |
|-------|-------------|--------|
| `app_id` | oui | Doit correspondre au header |
| `phone` | oui | Format `243…` sans `+` (normalisation hub acceptée aussi `+243…`) |
| `purpose` | recommandé | `login`, `register`, `reset`, `verify`, … |
| `locale` | non | `fr` (défaut) \| `en` — texte SMS |
| `reference` | recommandé | Voir format §5 |
| `idempotency_key` | recommandé | Évite double SMS si retry client |

**Réponse 200 / 202 :**

```json
{
  "otp_id": "otp_01HZX…",
  "status": "SENT",
  "reference": "educongo_login_550e8400-e29b-41d4-a716-446655440000",
  "phone_masked": "243****0001",
  "expires_in_sec": 300,
  "provider": "africastalking",
  "message": "Code envoyé."
}
```

- Le hub **ne renvoie jamais** le code OTP en clair dans la réponse (sauf mode test contrôlé, hors prod).
- Rate limit typique : cooldown par `phone` + plafond par `app_id` (ex. 5 OTP / 15 min / numéro).
- `provider` : valeur effective de `SMS_PROVIDER` (transparence ops ; les apps ne choisissent pas le canal).

**Erreurs utiles :** `429` rate limit · `402` / `503` crédit ou fournisseur indisponible · `400` téléphone invalide · `401` / `403` auth.

### 4.2 Vérifier un OTP — `POST /v1/otp/verify`

**Body :**

```json
{
  "app_id": "educongo",
  "phone": "243970000001",
  "code": "482913",
  "reference": "educongo_login_550e8400-e29b-41d4-a716-446655440000"
}
```

| Champ | Obligatoire | Notes |
|-------|-------------|--------|
| `app_id` | oui | |
| `phone` | oui | Même normalisation que send |
| `code` | oui | 4–8 chiffres (SENGA : 6) |
| `reference` | recommandé | Lie verify au send ; sinon dernier OTP actif pour `app_id`+`phone` |

**Réponse 200 — succès :**

```json
{
  "verified": true,
  "otp_id": "otp_01HZX…",
  "reference": "educongo_login_550e8400-e29b-41d4-a716-446655440000",
  "purpose": "login"
}
```

**Réponse 200 / 401 — échec :**

```json
{
  "verified": false,
  "reason": "INVALID_OR_EXPIRED",
  "attempts_remaining": 2
}
```

Après succès, le code est **invalidé** (one-shot). Tentatives limitées puis lock temporaire.

### 4.3 SMS transactionnel (optionnel) — `POST /v1/sms/send`

Pour notifications non-OTP (statut commande, rappel, etc.) — **pas** pour authentification.

```json
{
  "app_id": "senga",
  "phone": "243970000001",
  "text": "Votre course SENGA est terminée. Merci !",
  "reference": "senga_notify_7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "idempotency_key": "senga:ride:RIDE-42:completed-sms"
}
```

| Champ | Obligatoire | Notes |
|-------|-------------|--------|
| `text` | oui | Longueur max selon fournisseur (~160 / concat) ; le hub peut tronquer ou rejeter |
| Templates | phase 2 | Optionnel : `template_id` + `params` pour textes approuvés par app |

**Réponse :** `{ "sms_id", "status": "SENT"|"QUEUED", "reference", "provider" }`.

> SENGA aujourd’hui : une partie des SMS métier passe déjà par `mova-notification`. En phase 2, ce service peut devenir un **client** du hub au lieu d’appeler AT/SerdiPay directement.

---

## 5. Format de référence & idempotence / Reference & idempotency

Même convention que le hub paiements :

```
{app_id}_{purpose}_{uuid}
```

| Segment | Règle | Exemples |
|---------|--------|----------|
| `app_id` | `[a-z0-9]+` | `senga`, `educongo` |
| `purpose` | `[a-z0-9]+` | `login`, `register`, `reset`, `notify` |
| `uuid` | UUID v4 (minuscules) | `550e8400-e29b-41d4-a716-446655440000` |

Exemples :

- `senga_login_7c9e6679-7425-40de-944b-e07fc1f90ae7`
- `educongo_register_550e8400-e29b-41d4-a716-446655440000`

**Idempotency key** (header ou body) :

- Recommandé : `{app_id}:{purpose}:{phone}:{fenêtre}` ou id métier stable.
- Si la même clé est rejouée dans la fenêtre TTL (ex. 10 min) : le hub **ne renvoie pas** un second SMS ; il renvoie le même `otp_id` / `sms_id` et `status` précédent.
- Distinct de `reference` : `reference` est corrélation métier ; `idempotency_key` protège les retries HTTP.

---

## 6. Fournisseur SMS / Provider switch

Le hub (et aujourd’hui `mova-auth`) choisit le canal **uniquement** via :

| `SMS_PROVIDER` | Backend |
|----------------|---------|
| `mock` | Hub bootstrap — log OTP / fixed test code ; **pas de SMS réel** |
| `africastalking` | Africa’s Talking Messaging API |
| `serdipay` | SerdiPay SMS API |
| `twilio` | Legacy (éviter pour nouvelles apps) |

- **Pas de fallback silencieux** d’un fournisseur vers l’autre.
- Mobile Money reste **indépendant** (`MOBILE_MONEY_GATEWAY=serdipay` sur le hub paiements).
- Détail ops SENGA : [SMS_OTP_PROVIDERS.md](./SMS_OTP_PROVIDERS.md) · AT : [AFRICAS_TALKING_SMS.md](./AFRICAS_TALKING_SMS.md).

Variables côté **hub uniquement** (ne pas documenter de valeurs secrètes ; ne pas committer) :

| Famille | Rôle |
|---------|------|
| `SMS_PROVIDER` | Switch explicite |
| `AFRICAS_TALKING_*` | Username, API key, env, **Sender ID** |
| `SERDIPAY_SMS_*` | API ID / key, base URL, Sender ID |
| Table apps | `app_id`, `api_key_hash`, quotas, templates texte |

---

## 7. Exemples de requêtes / Example requests

### cURL — envoyer un OTP (Educongo)

```bash
APP_ID=educongo
API_KEY=***   # ne pas committer
TS=$(date +%s)
BODY='{"app_id":"educongo","phone":"243970000001","purpose":"login","locale":"fr","reference":"educongo_login_550e8400-e29b-41d4-a716-446655440000","idempotency_key":"educongo:login:243970000001:slot1"}'
SIG=$(node -e "const c=require('crypto');const b=process.argv[1],ts=process.argv[2],k=process.argv[3];process.stdout.write(c.createHmac('sha256',k).update(ts+'.POST./v1/otp/send.'+b).digest('hex'))" "$BODY" "$TS" "$API_KEY")

curl -sS -X POST "https://sms.afri-soft.com/v1/otp/send" \
  -H "Content-Type: application/json" \
  -H "X-AfriSoft-App-Id: $APP_ID" \
  -H "X-AfriSoft-Api-Key: $API_KEY" \
  -H "X-AfriSoft-Timestamp: $TS" \
  -H "X-AfriSoft-Signature: $SIG" \
  -d "$BODY"
```

### Vérifier

```bash
# Même headers HMAC sur path /v1/otp/verify
curl -sS -X POST "https://sms.afri-soft.com/v1/otp/verify" \
  -H "Content-Type: application/json" \
  -H "X-AfriSoft-App-Id: educongo" \
  -H "X-AfriSoft-Api-Key: $API_KEY" \
  -H "X-AfriSoft-Timestamp: $TS" \
  -H "X-AfriSoft-Signature: $SIG_VERIFY" \
  -d '{"app_id":"educongo","phone":"243970000001","code":"482913","reference":"educongo_login_550e8400-e29b-41d4-a716-446655440000"}'
```

---

## 8. Hébergement & phases / Hosting & rollout

### Domaine recommandé

| Option | Recommandation |
|--------|----------------|
| **`sms.afri-soft.com`** | **Préféré** — couvre OTP + SMS transactionnel ; parallèle à `pay.afri-soft.com` |
| `otp.afri-soft.com` | Acceptable si le périmètre reste strictement OTP (moins flexible) |

DNS : Cloudflare (même pratique que le hub paiements) — **A** `sms` → `178.104.82.66`, proxy **DNS only** (grey cloud).

### Hébergement VPS (déployé)

| Élément | Valeur |
|---------|--------|
| Domaine public | `https://sms.afri-soft.com` |
| IP VPS (Hetzner) | `178.104.82.66` (même machine que `pay.afri-soft.com`) |
| Chemin déploiement | `/opt/afrisoft-sms` |
| Compose | redis dédié (`afrisoft-sms-redis`) + hub Nest (`127.0.0.1:3001`) |
| Image | `docker/sms.Dockerfile` → `afrisoft-sms/hub:local` |
| Code | `services/sms-hub-service` |
| Scaffold repo | `deploy/afrisoft-sms/` |

**Mode actuel :** `SMS_PROVIDER=serdipay` une fois les clés SMS posées dans `/opt/afrisoft-sms/.env`. Health : `GET /health` → `provider` doit être `serdipay` (plus `mock`). Si les clés du PDF `sms-api.pdf` sont des exemples, le provider reste collé sur `serdipay` mais l’envoi réel échoue (400/403) — remplacer par les credentials WhatsApp/mail SerdiPay.

Pas d’obligation d’IP fixe pour AT (contrairement à SerdiPay MM). SerdiPay SMS — confirmer whitelist au moment de l’activation.

### Phase 1 — Contrat `/v1` + hub dédié MOCK (maintenant)

| Action | Détail |
|--------|--------|
| Contrat `/v1` | Doc + chemins figés |
| Hub `sms.afri-soft.com` | Thin Nest + Redis OTP ; auth `app_id` + HMAC |
| `SMS_PROVIDER=mock` | Bootstrap sans credentials fournisseur |
| SENGA mobile | **Continue** `/api/auth/otp/*` via `mova-auth` ; hub sert Educongo / apps sœurs |

### Phase 2 — Fournisseur réel + migration SENGA

| Action | Détail |
|--------|--------|
| Activer AT ou SerdiPay SMS | Credentials uniquement dans `/opt/afrisoft-sms/.env` |
| Migrer `mova-auth` | OTP SENGA : envoi SMS via `POST /v1/sms/send` (HMAC `app_id=senga`) ; verify JWT reste dans `mova-auth`. Seed `123456` inchangé. `/v1/otp/send` reste le contrat multi-apps (Educongo). |
| Migrer `mova-notification` | SMS métier → `POST /v1/sms/send` (même client HMAC) |

```
Maintenant
────────
Apps sœurs ──► sms.afri-soft.com  (SMS_PROVIDER=serdipay)
SENGA mobile ──► /api/auth/otp/* ──► mova-auth ──► POST /v1/sms/send (HMAC senga)
```

---

## 9. Relation avec OTP `mova-auth` / Relation to current auth OTP

| Couche | Rôle aujourd’hui | Rôle cible |
|--------|------------------|------------|
| App Flutter / client | `POST /api/auth/otp/request` + `verify` | Inchangé pour SENGA (auth métier) |
| `mova-auth` | Génère OTP, envoie SMS, vérifie, émet JWT | Reste auth SENGA ; **délègue** l’envoi SMS (+ éventuellement verify OTP générique) au hub |
| Hub SMS/OTP | — (contrat) | Couche SMS multi-apps : send/verify OTP + SMS |
| AT / SerdiPay | Appelés depuis shared / auth | Uniquement depuis le hub |

Endpoints historiques SENGA (ne pas casser) :

```http
POST /api/auth/otp/request   { "phone": "+2438…" }
POST /api/auth/otp/verify    { "phone": "+2438…", "code": "……" }
```

Mode test : `ALLOW_TEST_OTP=true` → code fixe sur numéros seed (voir [AFRICAS_TALKING_SMS.md](./AFRICAS_TALKING_SMS.md)). Le hub peut exposer un équivalent **par `app_id`** en staging uniquement.

---

## 10. Checklist onboarding nouvelle app

1. Demander à AfriSoft un **`app_id`** + **`api_key`** (réutiliser ceux du hub paiements si déjà onboardé).
2. Confirmer **locale** par défaut (`fr`) et libellés SMS (marque dans le texte : « Votre code Educongo : … »).
3. Implémenter HMAC (headers §3) côté backend — **jamais** depuis le mobile.
4. Appeler `POST /v1/otp/send` puis `POST /v1/otp/verify` ; gérer `429` / cooldown UX.
5. Générer `reference` `{app_id}_{purpose}_{uuid}` + `idempotency_key` sur retries.
6. Tester staging avec un vrai `+243` (hors whitelist test).
7. **Ne pas** ouvrir un compte AT / SerdiPay SMS séparé ni demander un second Sender ID (sauf accord commercial volume).
8. Pour SMS non-OTP : `POST /v1/sms/send` (optionnel).

### Côté hub (ops AfriSoft)

- [x] DNS `sms.afri-soft.com` → `178.104.82.66` + hub `/opt/afrisoft-sms` (MOCK)  
- [x] Endpoints `/v1/otp/*` + `/health` exposés (`SMS_PROVIDER=mock`)  
- [x] Registre `app_id` + `api_key` (env VPS `AFRISOFT_HUB_APPS`, chmod 600)  
- [ ] Sender ID approuvé (AT et/ou SerdiPay) pour la RDC  
- [x] Credentials fournisseur dans `/opt/afrisoft-sms/.env` (clés du PDF `sms-api.pdf` posées ; SerdiPay répond 400 « SMS API configuration not found for this merchant » — activer l’API SMS côté admin / demander les clés réelles)  
- [ ] `SMS_PROVIDER=serdipay` + SMS réel reçu ; `MOCK_RETURN_CODE=false`  
- [ ] Quotas / monitoring crédit SMS  
- [x] Client SENGA `mova-auth` → hub (`AFRISOFT_SMS_HUB_URL` + HMAC) — déployer Render + `AFRISOFT_HUB_API_KEY`  

---

## 11. Sécurité

- Jamais de secrets AT / SerdiPay SMS dans Educongo / apps clientes.
- Jamais renvoyer le code OTP dans les logs ou les réponses API (prod).
- TTL court (ex. 5 min) ; one-shot après verify réussi ; limite de tentatives.
- Rate limiting par téléphone et par `app_id`.
- TLS obligatoire ; rotation des `api_key` sans toucher au contrat fournisseur.
- Logs : masquer `phone` partiel ; ne jamais logger `api_key` ni corps OTP.

---

## 12. Références code SENGA

| Sujet | Emplacement |
|-------|-------------|
| Client Africa’s Talking | `packages/shared/src/africas-talking.ts` |
| Client SerdiPay SMS | `packages/shared/src/serdipay.ts` (`serdiPaySendSms`) |
| Client hub SMS (SENGA → VPS) | `packages/shared/src/afrisoft-sms-hub.ts` |
| Switch `SMS_PROVIDER` | `resolveSmsBackend` (shared) + `services/auth-service/src/auth/sms.providers.ts` |
| OTP request / verify | `services/auth-service/src/auth/auth.service.ts` / `auth.controller.ts` |
| SMS métier | `services/notification-service/src/sms/sms.service.ts` |
| Ops providers | [SMS_OTP_PROVIDERS.md](./SMS_OTP_PROVIDERS.md) |
| Hub paiements (pattern) | [AFRISOFT_PAYMENT_HUB_API.md](./AFRISOFT_PAYMENT_HUB_API.md) |
| Env exemple | `config/external-apis.env.example` |

---

## 13. Travail restant (résumé)

| Élément | SENGA `mova-auth` OTP | Hub `/v1` multi-apps |
|---------|----------------------|----------------------|
| Envoi SMS AT / SerdiPay | ✅ via hub (`/v1/sms/send`) une fois Render env posé | Clients shared prêts ; hub `SMS_PROVIDER=serdipay` |
| Verify OTP + sessions JWT | ✅ SENGA | ✅ Verify OTP générique (hub) ; JWT reste par app |
| Auth `app_id` + HMAC | ✅ client `afrisoft-sms-hub.ts` | ✅ hub `sms.afri-soft.com` |
| Endpoints `/v1/otp/*` | ❌ (chemins `/api/auth/otp/*`) | ✅ déployés |
| Service dédié `sms.afri-soft.com` | — | ✅ `/opt/afrisoft-sms` |
| Educongo onboardé | — | HMAC prêt ; SMS réel après Sender ID / clés validées |

---

*Document maintenu dans le dépôt Mova/SENGA pour AfriSoft. Les apps sœurs peuvent le copier ou le lier. L’implémentation peut migrer de `mova-auth` vers un service dédié sans changer le contrat d’auth (`app_id` + HMAC), les chemins `/v1/otp/*`, ni le format de référence.*

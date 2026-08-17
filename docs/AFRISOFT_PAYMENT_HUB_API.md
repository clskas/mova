# AfriSoft Payment Hub — Contrat d’API Mobile Money

**Version :** 1.0 — Août 2026  
**Public :** équipes AfriSoft (SENGA, Educongo, applications futures)  
**Statut :** contrat cible multi-apps + état réel SENGA documenté  
**Langue :** français (en-têtes bilingues FR / EN)  
**Companion SMS/OTP :** même pattern multi-apps (`app_id` + HMAC) — [AFRISOFT_SMS_OTP_HUB_API.md](./AFRISOFT_SMS_OTP_HUB_API.md).

---

## 1. Réponses clés / Key answers

### Les autres apps doivent-elles être hébergées sur le VPS paiements ?

**Non.** Seul le **module paiements** qui dialogue avec SerdiPay a besoin de l’**IP fixe du VPS** (whitelist SerdiPay) et du **callback unique** enregistré chez SerdiPay.

Les applications clientes (Educongo, futures apps…) peuvent tourner **n’importe où** (Vercel, AWS, VPS, on-prem, autre cloud — y compris Render pour le reste de SENGA), à condition de :

1. Appeler l’API HTTPS du hub ;
2. Exposer une **URL de webhook sortant** joignable par le hub (HTTPS public).

| Composant | Hébergement | IP fixe whitelist SerdiPay |
|-----------|-------------|---------------------------|
| Module paiements AfriSoft (`afrisoft-pay` / hub) | **VPS Hetzner** (`pay.afri-soft.com`, IP `178.104.82.66`) | **Oui** pour SerdiPay — CinetPay collect **n’exige pas** d’IP fixe |
| Callback SerdiPay → hub | `https://pay.afri-soft.com/webhooks/serdipay` | N/A (entrant) |
| Callback CinetPay → hub | `https://pay.afri-soft.com/webhooks/cinetpay` | N/A (entrant) |
| SENGA, Educongo, apps futures | Libre (ex. Render pour SENGA API) | **Non** |
| Webhook app ← hub | URL HTTPS publique de l’app | **Non** (doit être joignable depuis le hub) |

### La recharge wallet fonctionnera-t-elle dès que SerdiPay / Mobile Money marche ?

**Oui pour SENGA** — le flux est **déjà câblé** au gateway SerdiPay dans le code (`payment-service` + app Flutter). Dès que les credentials SerdiPay sont actifs et `MOCK_PAYMENTS=false`, les recharges passent par C2B + webhook + crédit portefeuille.

Pour **les autres apps AfriSoft** : elles n’utilisent pas le wallet SENGA ; elles créent un paiement via le hub (`POST /v1/payments`) puis créditent **leur propre** ledger / wallet à réception du webhook sortant. Voir §7.

---

## 2. Architecture / Architecture overview

```
SENGA ──┐
Educongo┼── HTTPS (app_id + API key / HMAC) ──►  Module paiements AfriSoft
Future ─┘                                         (afrisoft-pay sur VPS Hetzner
                                                   derrière pay.afri-soft.com)
                                                    • auth app
                                                    • crée / suit les paiements
                                                    • 1 seul dialogue SerdiPay
                                                    • 1 domaine + 1 callback + IP fixe VPS
                                                              │
                                                              ▼
                                                          SerdiPay
                                                              │
                                                    webhook POST (interne)
                                                              ▼
                                                    Module → route par app_id
                                                              │
                              ┌───────────────────────────────┼────────────────────────┐
                              ▼                               ▼                        ▼
                     webhook SENGA                    webhook Educongo           webhook App N
```

### Règles d’or

1. **Seul le hub** détient les secrets agrégateurs (`SERDIPAY_*`, `CINETPAY_*`) et les appelle.
2. Chaque app a un **`app_id`** stable (`senga`, `educongo`, …).
3. Chaque opération a une **référence unique** : `{app_id}_{purpose}_{uuid}` (voir §5).
4. L’agrégateur envoie **un** webhook au hub ; le hub notifie l’app concernée.
5. Les apps **ne stockent jamais** `SERDIPAY_*` / `CINETPAY_*`.
6. Switch sticky : `MOBILE_MONEY_GATEWAY=serdipay|cinetpay` (comme `SMS_PROVIDER`) — **pas** de failover silencieux.

**État code actuel (août 2026) :** SENGA consomme SerdiPay (`packages/shared/src/serdipay.ts`) et le client **CinetPay** est scaffoldé (`packages/shared/src/cinetpay.ts`). Callbacks publics hub : `POST https://pay.afri-soft.com/webhooks/serdipay` et `…/webhooks/cinetpay`. Les endpoints **`/v1/*` multi-apps** ci-dessous restent le **contrat** pour Educongo et suivantes.

---

## 3. Authentification / Auth (`app_id` + clé + HMAC)

Chaque application reçoit à l’onboarding :

| Élément | Description |
|---------|-------------|
| `app_id` | Identifiant public (`senga`, `educongo`) |
| `api_key` | Clé secrète (header) — ne jamais committer |
| `webhook_secret` | Secret HMAC pour **vérifier** les webhooks sortants du hub |
| `webhook_url` | URL HTTPS de l’app où le hub POST les événements |

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
- `path` : chemin exact sans host, ex. `/v1/payments`.
- `raw_body` : corps JSON brut (chaîne vide si GET).

Exemple (Node) :

```js
const crypto = require('crypto');
const ts = Math.floor(Date.now() / 1000).toString();
const method = 'POST';
const path = '/v1/payments';
const body = JSON.stringify(payload);
const sig = crypto
  .createHmac('sha256', apiKey)
  .update(`${ts}.${method}.${path}.${body}`)
  .digest('hex');
```

> **Note SENGA interne :** les apps mobiles SENGA utilisent aujourd’hui un **JWT utilisateur** vers `/api/wallet/*` et `/api/payments/*`. Le schéma `app_id` + HMAC s’applique aux **backends d’apps sœurs** (server-to-server), pas aux telephones finaux.

---

## 4. Endpoints / Endpoints

Base URL cible : `https://pay.afri-soft.com` (hub paiements VPS).  
Préfixe contrat multi-apps : `/v1`.

### 4.1 Créer un paiement Mobile Money — `POST /v1/payments`

**Body :**

```json
{
  "app_id": "educongo",
  "amount_cdf": 15000,
  "currency": "CDF",
  "phone": "243970000001",
  "telecom": "OM",
  "reference": "educongo_tuition_550e8400-e29b-41d4-a716-446655440000",
  "purpose": "tuition",
  "metadata": {
    "student_id": "STU-42",
    "invoice_id": "INV-2026-001"
  },
  "idempotency_key": "educongo:INV-2026-001:pay"
}
```

| Champ | Obligatoire | Notes |
|-------|-------------|--------|
| `app_id` | oui | Doit correspondre au header |
| `amount_cdf` | oui | Entier ≥ 500 (aligné SENGA) |
| `currency` | oui | `CDF` uniquement (phase 1) |
| `phone` | oui | Format `243…` sans `+` |
| `telecom` | oui | `OM` \| `MP` \| `AM` \| `AF` |
| `reference` | oui | Voir format §5 — unique par app |
| `purpose` | recommandé | Segment libre (`pay`, `topup`, `tuition`…) |
| `metadata` | non | Renvoyé tel quel dans le webhook |
| `idempotency_key` | recommandé | Évite les doubles encaissements |

**Réponse 201 (async) :**

```json
{
  "payment_id": "pay_01HZX…",
  "status": "PENDING",
  "reference": "educongo_tuition_550e8400-e29b-41d4-a716-446655440000",
  "provider_ref": "sp_987654",
  "message": "Confirmez le paiement sur votre téléphone Mobile Money.",
  "amount_cdf": 15000,
  "telecom": "OM"
}
```

Statuts : `PENDING` → `COMPLETED` \| `FAILED` (via webhook + GET).

### 4.2 Statut — `GET /v1/payments/{payment_id}`

Ou : `GET /v1/payments/by-reference/{reference}`

```json
{
  "payment_id": "pay_01HZX…",
  "status": "COMPLETED",
  "reference": "educongo_tuition_550e8400-e29b-41d4-a716-446655440000",
  "provider_ref": "sp_987654",
  "amount_cdf": 15000,
  "completed_at": "2026-08-12T12:00:00.000Z"
}
```

### 4.3 Webhook entrant SerdiPay (interne hub) — ne pas appeler depuis les apps

```http
POST https://pay.afri-soft.com/webhooks/serdipay
```

- Enregistré **une fois** chez SerdiPay (domaine hub AfriSoft).
- Vérifié avec `SERDIPAY_WEBHOOK_SECRET` (`X-SerdiPay-Signature` / HMAC SHA-256).
- Déployé sur le VPS (`/opt/afrisoft-pay`) ; côté monorepo SENGA, le handler historique est `services/payment-service/src/payments/payments-webhook.controller.ts` (`POST /api/payments/webhooks/serdipay` — le reverse proxy du hub expose le chemin public `/webhooks/serdipay`).
- Les apps clientes **n’utilisent pas** cet endpoint.

### 4.3bis Webhook entrant CinetPay (interne hub)

```http
GET  https://pay.afri-soft.com/webhooks/cinetpay   # ping disponibilité
POST https://pay.afri-soft.com/webhooks/cinetpay   # notify (form-urlencoded)
```

- `notify_url` posé à l’init (`CINETPAY_NOTIFY_URL`) et/ou dans le dashboard CinetPay.
- Header optionnel `x-token` (HMAC-SHA256 avec `CINETPAY_SECRET_KEY`) — voir [docs CinetPay HMAC](https://docs.cinetpay.com/api/1.0-en/checkout/hmac).
- Le hub **rappelle toujours** `POST /v2/payment/check` avant de finaliser (ACCEPTED → COMPLETED, REFUSED → FAILED).
- Handler Nest : `POST /api/payments/webhooks/cinetpay` ; Caddy rewrite public `/webhooks/cinetpay` (snippet `deploy/afrisoft-pay/caddy/Caddyfile.snippet` → `127.0.0.1:3000`).
- `providerRef` stocké : `cp_{transaction_id}`.

### 4.4 Webhook sortant hub → app

Quand le statut devient final, le hub POST vers `webhook_url` de l’app :

```http
POST https://educongo.example.com/webhooks/afrisoft-payments
X-AfriSoft-App-Id: educongo
X-AfriSoft-Event: payment.completed
X-AfriSoft-Timestamp: 1735689700
X-AfriSoft-Signature: <hmac_hex>
Content-Type: application/json
```

**Signature (hub → app) :** même formule, avec `webhook_secret` de l’app :

```
string_to_sign = "{timestamp}.POST.{path}.{raw_body}"
signature      = hex( HMAC_SHA256(webhook_secret, string_to_sign) )
```

**Payload exemple — succès :**

```json
{
  "event": "payment.completed",
  "payment_id": "pay_01HZX…",
  "app_id": "educongo",
  "status": "COMPLETED",
  "reference": "educongo_tuition_550e8400-e29b-41d4-a716-446655440000",
  "provider_ref": "sp_987654",
  "amount_cdf": 15000,
  "currency": "CDF",
  "phone": "243970000001",
  "telecom": "OM",
  "purpose": "tuition",
  "metadata": {
    "student_id": "STU-42",
    "invoice_id": "INV-2026-001"
  },
  "occurred_at": "2026-08-12T12:00:00.000Z"
}
```

**Échec :** `event` = `payment.failed`, `status` = `FAILED`, champ optionnel `failure_reason`.

**Attentes côté app :**

- Répondre `2xx` rapidement (< 5 s) ; traiter ensuite en async si besoin.
- **Idempotence** : un même `payment_id` / `reference` peut être rejoué.
- En cas de `5xx` / timeout, le hub retente (backoff) ; l’app peut aussi poller `GET /v1/payments/...`.

---

## 5. Format de référence / Reference format

```
{app_id}_{purpose}_{uuid}
```

| Segment | Règle | Exemples |
|---------|--------|----------|
| `app_id` | `[a-z0-9]+` | `senga`, `educongo` |
| `purpose` | `[a-z0-9]+` | `pay`, `topup`, `tuition`, `withdraw` |
| `uuid` | UUID v4 (minuscules) | `550e8400-e29b-41d4-a716-446655440000` |

Exemples valides :

- `senga_topup_7c9e6679-7425-40de-944b-e07fc1f90ae7`
- `educongo_tuition_550e8400-e29b-41d4-a716-446655440000`

Le hub préfixe / stocke aussi un `provider_ref` interne SerdiPay (`sp_…`) pour corréler le callback.

> **SENGA aujourd’hui :** les recharges utilisent encore `topup_{PROVIDER}_{timestamp}` en interne. La migration vers `{app_id}_{purpose}_{uuid}` est recommandée pour le hub multi-apps ; le routage webhook se fera sur `app_id` + table d’intentions.

---

## 6. Exemples de requêtes / Example requests

### cURL — créer un paiement (Educongo)

```bash
APP_ID=educongo
API_KEY=***   # ne pas committer
TS=$(date +%s)
BODY='{"app_id":"educongo","amount_cdf":15000,"currency":"CDF","phone":"243970000001","telecom":"OM","reference":"educongo_tuition_550e8400-e29b-41d4-a716-446655440000","purpose":"tuition","idempotency_key":"educongo:INV-2026-001:pay"}'
PATH_ONLY=/v1/payments
SIG=$(node -e "const c=require('crypto');const b=process.argv[1],ts=process.argv[2],k=process.argv[3];process.stdout.write(c.createHmac('sha256',k).update(ts+'.POST./v1/payments.'+b).digest('hex'))" "$BODY" "$TS" "$API_KEY")

curl -sS -X POST "https://pay.afri-soft.com/v1/payments" \
  -H "Content-Type: application/json" \
  -H "X-AfriSoft-App-Id: $APP_ID" \
  -H "X-AfriSoft-Api-Key: $API_KEY" \
  -H "X-AfriSoft-Timestamp: $TS" \
  -H "X-AfriSoft-Signature: $SIG" \
  -d "$BODY"
```

### Polling statut

```bash
curl -sS "https://pay.afri-soft.com/v1/payments/by-reference/educongo_tuition_550e8400-e29b-41d4-a716-446655440000" \
  -H "X-AfriSoft-App-Id: educongo" \
  -H "X-AfriSoft-Api-Key: $API_KEY" \
  -H "X-AfriSoft-Timestamp: $TS" \
  -H "X-AfriSoft-Signature: $SIG_GET"
```

---

## 7. Recharge portefeuille / Wallet top-up

### 7.1 SENGA aujourd’hui (SerdiPay + CinetPay scaffold)

Flux réel dans le dépôt :

1. **App Flutter** : `mobile/lib/features/wallet/wallet_screen.dart` → `POST /wallet/top-up` `{ provider, amountCdf, phone }`.
2. **API** : `WalletController` → `WalletService.topUp` (`services/payment-service/src/wallet/wallet.service.ts`).
3. Selon `MOBILE_MONEY_GATEWAY` + téléphone :
   - `serdipay` → `serdiPayInitiateMobileMoney` (C2B push USSD) → `providerRef` `sp_…`
   - `cinetpay` → `cinetPayInitiateMobileMoney` (checkout + `paymentUrl`) → `providerRef` `cp_…`
4. Transaction `TOPUP_PENDING` ; l’app poll `GET /wallet/top-up/status?providerRef=`.
5. Callback agrégateur → hub webhook → `completeMobileMoneyFromWebhook` → `completePendingTopUp` → crédit (`TOPUP_COMPLETED`).

Fichiers clés :

- `packages/shared/src/serdipay.ts` · `packages/shared/src/cinetpay.ts`
- `services/payment-service/src/wallet/wallet.service.ts` (`topUp`, `completePendingTopUp`)
- `services/payment-service/src/payments/payment-providers.ts`
- `services/payment-service/src/payments/payments-webhook.controller.ts`
- `mobile/lib/features/wallet/wallet_screen.dart` — **à prévoir** : ouvrir `paymentUrl` si renvoyé (CinetPay)

**Implication :** SerdiPay live dès credentials + `MOCK_PAYMENTS=false`. CinetPay : code prêt ; ouvrir compte + env + bascule `MOBILE_MONEY_GATEWAY=cinetpay`. Mode mock reste pour le dev.

### 7.2 Autres apps (Educongo, etc.)

- Elles **ne partagent pas** le ledger wallet SENGA.
- Pattern recommandé : `POST /v1/payments` avec `purpose=topup` (ou métier), puis à `payment.completed` créditer **leur** portefeuille interne.
- Pas besoin d’héberger sur le VPS paiements ni d’IP fixe ; besoin uniquement d’appeler le hub + recevoir le webhook.

### 7.3 Travail restant (hub multi-apps)

| Élément | SENGA wallet | Hub `/v1` multi-apps |
|---------|--------------|----------------------|
| Init MM SerdiPay | ✅ fait | À exposer comme API app-to-hub |
| Init MM CinetPay | ✅ scaffold (switch sticky) | Même gateway côté hub |
| Webhook SerdiPay / CinetPay | ✅ handlers | ✅ (interne hub) |
| Crédit wallet | ✅ SENGA DB | ❌ chaque app gère son ledger |
| Auth `app_id` + HMAC | ❌ (JWT user) | À implémenter |
| Webhooks sortants vers apps | ❌ | À implémenter |

---

## 8. Hébergement / Hosting requirements

### 8.1 Hub paiements (prod actuelle)

| Élément | Valeur |
|---------|--------|
| Hébergeur | **VPS Hetzner** (dédié SerdiPay / hub) |
| Domaine public | `https://pay.afri-soft.com` |
| IP fixe (whitelist SerdiPay) | `178.104.82.66` |
| Chemin déploiement | `/opt/afrisoft-pay` |
| Callback SerdiPay | `https://pay.afri-soft.com/webhooks/serdipay` |
| Callback CinetPay | `https://pay.afri-soft.com/webhooks/cinetpay` |
| DNS | **Cloudflare uniquement** (pas d’autre registrar DNS pour ce hostname) |

> **Render vs VPS :** le reste de SENGA (API métier, apps) peut rester sur Render ou ailleurs. **Seul** le hub qui parle à SerdiPay doit sortir depuis l’IP VPS ci-dessus. Ne pas replacer le callback SerdiPay sur un service Render à IP dynamique.
>
> Poser `SERDIPAY_*` dans GitHub Actions ou Render (`mova-payment` / groupe `mova-external-apis`) **ne suffit pas**. SerdiPay n’accepte que l’IP `178.104.82.66`. Les clés marchand vont dans `/opt/afrisoft-pay/.env` (voir `deploy/afrisoft-pay/README.md`).

| Exigence SerdiPay | Qui doit la satisfaire |
|-------------------|------------------------|
| IP sortantes whitelistées (`178.104.82.66`) | **Module paiements uniquement** (VPS) |
| 1 domaine / 1 URL de callback | **Module paiements uniquement** (`pay.afri-soft.com`) |
| Credentials marchand | **Module paiements uniquement** (env sur le VPS) |

### 8.2 Split SENGA aujourd’hui (Render ≠ hub)

```
App Flutter / web
        │  JWT  POST /api/wallet/top-up  (via gateway)
        ▼
mova-payment  (Render)     — ledger wallet SENGA, Postgres Render
        │  cible : appeler le hub  (contrat /v1 encore à câbler)
        ▼
Hub afrisoft-pay           — VPS /opt/afrisoft-pay · pay.afri-soft.com
        │  SERDIPAY_* ici, sortie IP 178.104.82.66
        ▼
SerdiPay  ──webhook──►  https://pay.afri-soft.com/webhooks/serdipay
```

| Process | Où | Rôle |
|---------|----|------|
| Hub `afrisoft-pay-payment` | **VPS** `pay.afri-soft.com` · `/opt/afrisoft-pay` · conteneur port `127.0.0.1:3000` | **Seul** processus autorisé à appeler SerdiPay (IP whitelist) + recevoir `/webhooks/serdipay` |
| `mova-payment` | **Render** (`render.yaml`) | Wallet / courses SENGA. **Ne doit pas** détenir les secrets agrégateurs. |
| Apps sœurs (Educongo…) | n’importe où | `POST https://pay.afri-soft.com/v1/payments` (contrat §4 ; `/v1` encore à implémenter) |

**Les apps clientes n’ont pas besoin d’IP fixe ni d’hébergement sur ce VPS.**  
Elles doivent seulement :

- Pouvoir joindre `https://pay.afri-soft.com` (HTTPS sortant) ;
- Exposer un webhook HTTPS que le hub peut joindre (firewall / auth HMAC).

---

## 9. Variables d’environnement & checklist onboarding

### 9.1 Côté hub (VPS `/opt/afrisoft-pay` — secrets, ne pas committer)

| Variable | Rôle |
|----------|------|
| `SERDIPAY_EMAIL` / `SERDIPAY_PASSWORD` | Auth `get-token` (Username + Password de la fiche marchand) |
| `SERDIPAY_API_ID` | Corps paiement (`api_id`) |
| `SERDIPAY_API_PASSWORD` | Corps (`api_password`) — **optionnel** ; défaut = `SERDIPAY_PASSWORD` (pas de champ « API Password » chez SerdiPay) |
| `SERDIPAY_MERCHANT_CODE` / `SERDIPAY_MERCHANT_PIN` | Marchand |
| `SERDIPAY_WEBHOOK_SECRET` | Vérif callback SerdiPay |
| `CINETPAY_API_KEY` / `CINETPAY_SITE_ID` | Auth Checkout CinetPay |
| `CINETPAY_SECRET_KEY` | HMAC `x-token` notify |
| `CINETPAY_NOTIFY_URL` | `https://pay.afri-soft.com/webhooks/cinetpay` |
| `CINETPAY_RETURN_URL` | Redirect après guichet |
| `CINETPAY_ENV` / `CINETPAY_CURRENCY` | `PROD`\|`TEST` · `CDF`\|`USD` |
| `MOBILE_MONEY_GATEWAY` | `serdipay` \| `cinetpay` (sticky) |
| `MOCK_PAYMENTS=false` | Prod réelle — **ne pas** activer sans credentials validés |
| Table / config apps | `app_id`, `api_key_hash`, `webhook_url`, `webhook_secret` |

Voir aussi `deploy/afrisoft-pay/.env.example`, `config/external-apis.env.example`, [MOBILE_MONEY_PROVIDER_ALTERNATIVES.md](./MOBILE_MONEY_PROVIDER_ALTERNATIVES.md) et `docs/PRODUCTION_DEPLOYMENT.md` §3.3.

**Bascule ops :** une seule variable `MOBILE_MONEY_GATEWAY=serdipay|cinetpay` + recreate conteneur. Les deux jeux de secrets peuvent coexister sur le VPS.

**Checklist VPS (copier-coller) — ne pas committer les valeurs :**

```bash
ssh -i ~/.ssh/afrisoft_pay root@178.104.82.66
cd /opt/afrisoft-pay
chmod 600 .env
nano .env
# MOCK_PAYMENTS=false
# SERDIPAY_EMAIL=…          SERDIPAY_PASSWORD=…
# SERDIPAY_API_ID=…
# SERDIPAY_API_PASSWORD=…   # optionnel : défaut = SERDIPAY_PASSWORD
# SERDIPAY_MERCHANT_CODE=…  SERDIPAY_MERCHANT_PIN=…
# SERDIPAY_WEBHOOK_SECRET=… (si fourni)
docker compose --profile hub up -d --force-recreate payment
docker exec afrisoft-pay-payment printenv MOCK_PAYMENTS
curl -sS https://pay.afri-soft.com/health
```

### 9.2 Côté nouvelle app (checklist)

1. Demander à AfriSoft un **`app_id`** + **`api_key`** + **`webhook_secret`**.
2. Fournir **`webhook_url`** HTTPS (staging puis prod).
3. Implémenter vérification HMAC des webhooks entrants.
4. Générer des `reference` au format `{app_id}_{purpose}_{uuid}`.
5. Appeler `POST /v1/payments` sur `https://pay.afri-soft.com` puis gérer `PENDING` (UI + poll optionnel).
6. Sur `payment.completed` : idempotence + crédit métier.
7. Tester en staging avec petits montants CDF (OM / MP / AM).
8. **Ne pas** demander de nouveau compte SerdiPay ni d’IP whitelist pour l’app (sauf volume / KYC commercial).

### 9.3 Côté SENGA (déjà en place pour MM)

- [x] Client SerdiPay Public API  
- [x] Client CinetPay Checkout (scaffold + tests)  
- [x] Webhook public hub SerdiPay `https://pay.afri-soft.com/webhooks/serdipay`  
- [x] Webhook public hub CinetPay `https://pay.afri-soft.com/webhooks/cinetpay`  
- [x] Wallet top-up async + poll Flutter  
- [ ] Credentials marchand SerdiPay / CinetPay réels sur le VPS hub  
- [ ] Flutter : ouvrir `paymentUrl` CinetPay  
- [ ] Endpoints `/v1/*` + registre multi-apps + webhooks sortants  

---

## 10. Sécurité

- Jamais de secrets SerdiPay / CinetPay dans Educongo / apps clientes.
- Rotation des `api_key` / `webhook_secret` sans redeploy agrégateur.
- TLS obligatoire ; pas de webhook HTTP clair.
- Idempotence obligatoire côté app.
- Logs : masquer `phone` partiel, ne jamais logger `api_key` / PIN / `CINETPAY_SECRET_KEY`.

---

## 11. Références code SENGA

| Sujet | Emplacement |
|-------|-------------|
| Client SerdiPay | `packages/shared/src/serdipay.ts` |
| Client CinetPay | `packages/shared/src/cinetpay.ts` |
| Providers MM | `services/payment-service/src/payments/payment-providers.ts` |
| Webhooks MM | `services/payment-service/src/payments/payments-webhook.controller.ts` |
| Complétion MM | `PaymentsService.completeMobileMoneyFromWebhook` |
| Top-up wallet | `services/payment-service/src/wallet/wallet.service.ts` |
| UI recharge | `mobile/lib/features/wallet/wallet_screen.dart` |
| Env exemple | `config/external-apis.env.example` |
| Scaffold VPS | `deploy/afrisoft-pay/` (README, compose, `.env.example`) |
| Caddy rewrite | `deploy/afrisoft-pay/caddy/Caddyfile.snippet` (live : `127.0.0.1:3000`) |

---

*Document maintenu dans le dépôt Mova/SENGA pour AfriSoft. Les apps sœurs peuvent le copier ou le lier ; l’implémentation `/v1` évoluera sans changer le contrat d’auth (`app_id` + HMAC) ni le format de référence.*

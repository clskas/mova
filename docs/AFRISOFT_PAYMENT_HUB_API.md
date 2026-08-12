# AfriSoft Payment Hub — Contrat d’API Mobile Money

**Version :** 1.0 — Août 2026  
**Public :** équipes AfriSoft (SENGA, Educongo, applications futures)  
**Statut :** contrat cible multi-apps + état réel SENGA documenté  
**Langue :** français (en-têtes bilingues FR / EN)

---

## 1. Réponses clés / Key answers

### Les autres apps doivent-elles être hébergées sur le VPS paiements ?

**Non.** Seul le **module paiements** qui dialogue avec SerdiPay a besoin de l’**IP fixe du VPS** (whitelist SerdiPay) et du **callback unique** enregistré chez SerdiPay.

Les applications clientes (Educongo, futures apps…) peuvent tourner **n’importe où** (Vercel, AWS, VPS, on-prem, autre cloud — y compris Render pour le reste de SENGA), à condition de :

1. Appeler l’API HTTPS du hub ;
2. Exposer une **URL de webhook sortant** joignable par le hub (HTTPS public).

| Composant | Hébergement | IP fixe whitelist SerdiPay |
|-----------|-------------|---------------------------|
| Module paiements AfriSoft (`afrisoft-pay` / hub) | **VPS Hetzner** (`pay.afri-soft.com`, IP `178.104.82.66`) | **Oui** — seuls sortants vers SerdiPay |
| Callback SerdiPay → hub | Même domaine (`https://pay.afri-soft.com/webhooks/serdipay`) | N/A (entrant) |
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

1. **Seul le hub** détient les secrets SerdiPay et appelle SerdiPay.
2. Chaque app a un **`app_id`** stable (`senga`, `educongo`, …).
3. Chaque opération a une **référence unique** : `{app_id}_{purpose}_{uuid}` (voir §5).
4. SerdiPay envoie **un** webhook au hub ; le hub notifie l’app concernée.
5. Les apps **ne stockent jamais** `SERDIPAY_*`.

**État code actuel (août 2026) :** SENGA consomme déjà SerdiPay en interne (`packages/shared/src/serdipay.ts`). Le callback public enregistré chez SerdiPay est `POST https://pay.afri-soft.com/webhooks/serdipay` (hub VPS). Les endpoints **`/v1/*` multi-apps** ci-dessous sont le **contrat d’intégration** à exposer / stabiliser pour Educongo et les suivantes (SENGA peut rester le premier client, éventuellement via adapters internes).

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

### 7.1 SENGA aujourd’hui (déjà câblé SerdiPay)

Flux réel dans le dépôt :

1. **App Flutter** : `mobile/lib/features/wallet/wallet_screen.dart` → `POST /wallet/top-up` `{ provider, amountCdf, phone }`.
2. **API** : `WalletController` → `WalletService.topUp` (`services/payment-service/src/wallet/wallet.service.ts`).
3. Si `useSerdiPayMobileMoney` + téléphone : appel `serdiPayInitiateMobileMoney` (C2B `payment-client`).
4. Transaction `TOPUP_PENDING` + `providerRef` (`sp_…`) ; l’app poll `GET /wallet/top-up/status?providerRef=`.
5. Callback SerdiPay → `POST https://pay.afri-soft.com/webhooks/serdipay` → `completeMobileMoneyFromWebhook` → `completePendingTopUp` → crédit solde (`TOPUP_COMPLETED`).

Fichiers clés :

- `packages/shared/src/serdipay.ts`
- `services/payment-service/src/wallet/wallet.service.ts` (`topUp`, `completePendingTopUp`)
- `services/payment-service/src/payments/payments-webhook.controller.ts`
- `mobile/lib/features/wallet/wallet_screen.dart`

**Implication :** dès que SerdiPay est opérationnel (env VPS hub + callback), **la recharge wallet SENGA fonctionne sans développement supplémentaire** sur ce flux (hors tuning / tests terrain). Mode mock (`MOCK` / `MOCK_PAYMENTS`) reste pour le dev.

### 7.2 Autres apps (Educongo, etc.)

- Elles **ne partagent pas** le ledger wallet SENGA.
- Pattern recommandé : `POST /v1/payments` avec `purpose=topup` (ou métier), puis à `payment.completed` créditer **leur** portefeuille interne.
- Pas besoin d’héberger sur le VPS paiements ni d’IP fixe ; besoin uniquement d’appeler le hub + recevoir le webhook.

### 7.3 Travail restant (hub multi-apps)

| Élément | SENGA wallet | Hub `/v1` multi-apps |
|---------|--------------|----------------------|
| Init MM SerdiPay | ✅ fait | À exposer comme API app-to-hub |
| Webhook SerdiPay | ✅ fait | ✅ (interne) |
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
| DNS | **Cloudflare uniquement** (pas d’autre registrar DNS pour ce hostname) |

> **Render vs VPS :** le reste de SENGA (API métier, apps) peut rester sur Render ou ailleurs. **Seul** le hub qui parle à SerdiPay doit sortir depuis l’IP VPS ci-dessus. Ne pas replacer le callback SerdiPay sur un service Render à IP dynamique.

| Exigence SerdiPay | Qui doit la satisfaire |
|-------------------|------------------------|
| IP sortantes whitelistées (`178.104.82.66`) | **Module paiements uniquement** (VPS) |
| 1 domaine / 1 URL de callback | **Module paiements uniquement** (`pay.afri-soft.com`) |
| Credentials marchand | **Module paiements uniquement** (env sur le VPS) |

**Les apps clientes n’ont pas besoin d’IP fixe ni d’hébergement sur ce VPS.**  
Elles doivent seulement :

- Pouvoir joindre `https://pay.afri-soft.com` (HTTPS sortant) ;
- Exposer un webhook HTTPS que le hub peut joindre (firewall / auth HMAC).

---

## 9. Variables d’environnement & checklist onboarding

### 9.1 Côté hub (VPS `/opt/afrisoft-pay` — secrets, ne pas committer)

| Variable | Rôle |
|----------|------|
| `SERDIPAY_EMAIL` / `SERDIPAY_PASSWORD` | Auth `get-token` |
| `SERDIPAY_API_ID` / `SERDIPAY_API_PASSWORD` | Corps paiement |
| `SERDIPAY_MERCHANT_CODE` / `SERDIPAY_MERCHANT_PIN` | Marchand |
| `SERDIPAY_WEBHOOK_SECRET` | Vérif callback SerdiPay |
| `MOBILE_MONEY_GATEWAY=serdipay` | Activer la passerelle |
| `MOCK_PAYMENTS=false` | Prod réelle |
| Table / config apps | `app_id`, `api_key_hash`, `webhook_url`, `webhook_secret` |

Voir aussi `config/external-apis.env.example` et `docs/PRODUCTION_DEPLOYMENT.md` §3.3.

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
- [x] Webhook public hub `https://pay.afri-soft.com/webhooks/serdipay`  
- [x] Wallet top-up async + poll Flutter  
- [ ] Credentials marchand réels sur le VPS hub  
- [ ] Endpoints `/v1/*` + registre multi-apps + webhooks sortants  

---

## 10. Sécurité

- Jamais de secrets SerdiPay dans Educongo / apps clientes.
- Rotation des `api_key` / `webhook_secret` sans redeploy SerdiPay.
- TLS obligatoire ; pas de webhook HTTP clair.
- Idempotence obligatoire côté app.
- Logs : masquer `phone` partiel, ne jamais logger `api_key` / PIN marchand.

---

## 11. Références code SENGA

| Sujet | Emplacement |
|-------|-------------|
| Client SerdiPay | `packages/shared/src/serdipay.ts` |
| Providers MM | `services/payment-service/src/payments/payment-providers.ts` |
| Webhook SerdiPay | `services/payment-service/src/payments/payments-webhook.controller.ts` |
| Complétion MM | `PaymentsService.completeMobileMoneyFromWebhook` |
| Top-up wallet | `services/payment-service/src/wallet/wallet.service.ts` |
| UI recharge | `mobile/lib/features/wallet/wallet_screen.dart` |
| Env exemple | `config/external-apis.env.example` |

---

*Document maintenu dans le dépôt Mova/SENGA pour AfriSoft. Les apps sœurs peuvent le copier ou le lier ; l’implémentation `/v1` évoluera sans changer le contrat d’auth (`app_id` + HMAC) ni le format de référence.*

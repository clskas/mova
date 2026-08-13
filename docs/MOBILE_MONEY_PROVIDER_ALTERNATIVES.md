# Alternatives Mobile Money (RDC) — failover SerdiPay

**Version :** 1.0 — Août 2026  
**Public :** direction / ops AfriSoft (SENGA, Educongo, hub `pay.afri-soft.com`)  
**Objectif :** choisir **un second agrégateur** pour basculer quand SerdiPay est en panne — même logique que l’OTP (`SMS_PROVIDER=africastalking|serdipay`).  
**Statut :** CinetPay **scaffoldé** (client shared + webhook + switch) — credentials marchand à remplir ; pas encore live.  
**Companion :** [AFRISOFT_PAYMENT_HUB_API.md](./AFRISOFT_PAYMENT_HUB_API.md) · [SMS_OTP_PROVIDERS.md](./SMS_OTP_PROVIDERS.md)

---

## 1. En une phrase

**Garder SerdiPay en primaire** ; ouvrir un compte marchand **CinetPay** (failover recommandé) ou **FlexPay** (alternative 100 % congolaise) ; brancher le switch `MOBILE_MONEY_GATEWAY=serdipay|cinetpay` au niveau du hub uniquement.

---

## 2. Ce que SENGA / le hub a besoin

| Critère | Requis |
|---------|--------|
| Opérateurs RDC | Orange Money CD, M-Pesa Vodacom CD, Airtel Money CD (idéalement les 3) |
| Cas d’usage | Collecte marchand / cash-in (recharge wallet, paiement course) |
| Async | Webhooks / callbacks + vérif statut |
| Auth | Clé API / token (IP fixe SerdiPay déjà sur le VPS — avantage si le 2ᵉ n’en a **pas** besoin pour le collect) |
| Hébergement | Seul le hub (`pay.afri-soft.com`) parle au fournisseur ; les apps restent inchangées |

---

## 3. État du code aujourd’hui

Le switch Mobile Money est **explicite** (comme `SMS_PROVIDER`) — **pas de failover silencieux** :

| Variable | Rôle | Valeurs |
|----------|------|---------|
| `SMS_PROVIDER` | Canal OTP SMS | `serdipay` \| `africastalking` \| `twilio` \| `mock` |
| `MOBILE_MONEY_GATEWAY` | Canal collect MM | `serdipay` (défaut) \| `cinetpay` \| `africastalking` \| `legacy` \| `mock` |

**Flux (payment-service) :**

1. Les providers `ORANGE_MONEY` / `MPESA` / `AIRTEL_MONEY` appellent `initiateViaGateway()`.
2. `MOBILE_MONEY_GATEWAY=serdipay` → `serdiPayInitiateMobileMoney` (`packages/shared/src/serdipay.ts`) — erreur claire si credentials absents.
3. `MOBILE_MONEY_GATEWAY=cinetpay` → `cinetPayInitiateMobileMoney` (`packages/shared/src/cinetpay.ts`) — erreur claire si credentials absents.
4. `africastalking` / `legacy` / `mock` — chemins secondaires / dev.
5. **Pas** de bascule auto SerdiPay → CinetPay (évite doubles débits). Option future documentée : `MOBILE_MONEY_FAILOVER` (non implémenté).

```text
MOBILE_MONEY_GATEWAY=serdipay|cinetpay
```

- Webhooks hub : `/webhooks/serdipay`, `/webhooks/cinetpay`.
- Les apps sœurs ne voient **jamais** le fournisseur sous-jacent.
- Credentials uniquement sur le VPS hub / secrets Render.

---

## 4. Tableau comparatif (viable / non viable)

Légende DRC : **Oui** = documenté actif 2025–2026 · **Non** = hors périmètre · **Incertain** = à valider avec le commercial.

### 4.1 Options viables ou intéressantes

| Fournisseur | DRC | Opérateurs CD | Collect / callback | Auth | Prix public (indicatif) | Difficulté | IP fixe | Failover SerdiPay |
|-------------|-----|---------------|--------------------|------|-------------------------|------------|---------|-------------------|
| **SerdiPay** *(actuel)* | Oui | OM, M-Pesa, Airtel (+ AF) | Oui (C2B + webhook) | Token marchand + API id/pwd | Sur devis | Déjà intégré | **Oui** (whitelist VPS) | Primaire |
| **CinetPay** | **Oui** | OM (`OMCD`), M-Pesa (`MPESACD`), Airtel (`AIRTELCD`) ; USD partiel | Oui (notif + check API + HMAC `x-token`) | `apikey` + `site_id` | Collect RDC affiché **~3,5 %** (volume 1,5–3,5 %) — [cinetpay.com/pricing](https://cinetpay.com/pricing) | Moyenne (REST FR, docs riches) | Non pour collect ; whitelist surtout **payout** | **★★★ Fortement recommandé** |
| **FlexPay** (INFOSET, Kinshasa) | **Oui** | M-Pesa, Airtel, Orange, Afrimoney | Oui (`callbackUrl` POST) ; check statut | Bearer + `merchant` code | Sur devis (pas public) | Moyenne (docs souvent privées / PDF) | Non documenté (probable non) | **★★★ Très bon (local BCC)** |
| **LigdiCash** | **Oui** | Orange, Vodacom, Airtel, Africell | Oui (callback + `confirm`) | `Apikey` + Bearer | Sur devis | Moyenne ; **Orange = redirect page**, autres = USSD Push | Non documenté | **★★ Bon** — ⚠ API en **XOF** (conversion interne, pas CDF natif) |
| **PawaPay** | **Oui** | `ORANGE_COD`, `VODACOM_MPESA_COD`, `AIRTEL_COD` (CDF + USD) | Oui (dépôts + signatures optionnelles) | Bearer token dashboard | Sur devis | Moyenne (docs EN solides) | Non (token) | **★★ Bon** (plus « international ») |
| **Nomba** (DRC Collection) | **Oui** (API + licence BCC citée) | M-Pesa, Airtel, Orange | Oui (initiate + webhook + fetch) | Bearer + `accountId` | Non public | Moyenne | Non documenté | **★ À explorer** — positionnement fort remises / corridors ; confirmer contrat **marchand wallet** |
| **Africa’s Talking Payments** | **Incertain** pour collect MM RDC live | Code SENGA prêt (`MOBILE_MONEY_GATEWAY=africastalking`) | Checkout + `notifyUrl` | username + apiKey | Sur devis | Faible *si* produit RDC activé | Non | **★ Déjà stubbé** — valider avec AT avant d’en dépendre |
| **MaxiCash** | Oui (plateforme CD) | MM via gateway ; API souvent centrée wallet MaxiCash | Gateway / async | MerchantID + password | Sur devis | Moyenne–élevée (UX différente) | Incertain | ★ Secondaire (moins « push USSD » pur) |
| **M-Pesa Open API Vodacom CD** | Oui (1 opérateur) | M-Pesa seulement | C2B / callbacks | Portail business + shortcode | Sur devis opérateur | Élevée (KYC business lourd) | Souvent IP / URLs enregistrées | ★ Couverture partielle seulement |
| **Orange Money Web Payment** | Oui (liste Orange Developer inclut RD Congo) | Orange seulement | Web pay / M-Payment | Marchand Orange + API | Sur devis | Élevée (onboarding magasin Orange) | Selon contrat | ★ Couverture partielle seulement |

### 4.2 Non retenus pour le failover MM RDC

| Fournisseur | DRC MM collect | Motif |
|-------------|----------------|-------|
| **Flutterwave** | **Non** (docs publiques : pas de CD / CDF MM) | XAF/XOF, KE, GH, UG… — pas RDC |
| **Paystack** | **Non** | Pas de couverture MM RDC publique |
| **PayDunya** | **Non** | UEMOA (SN, CI, BJ, BF, TG, ML) |
| **FedaPay** | **Non** | UEMOA (+ NG) |
| **Stripe** | **Non** | Pas de Mobile Money CD |
| **Pelecard** | **Non** | Hors sujet MM Afrique centrale (pas un agrégateur CD) |
| **AT Airtime seul** | N/A | Airtime ≠ collect wallet ; ne pas confondre avec Payments |

---

## 5. Détail des 3 meilleurs failover

### 5.1 CinetPay (recommandé #1)

- **Pays :** 10+ pays francophones dont **RDC**.
- **Opérateurs CD :** Orange Money, M-Pesa, Airtel Money (codes doc officiels).
- **Flux :** init checkout → push / code secret client → **notification webhook** → **toujours** rappeler l’API de vérification (bonne pratique déjà proche SerdiPay).
- **Auth :** clé API + site ID — pas de dépendance connue à l’IP pour le **collect**.
- **Prix :** page publique ~**3,5 %** collect RDC (peut baisser avec volume) — à confirmer au contrat.
- **Pourquoi failover :** docs FR, 3 opérateurs, auth simple, pas besoin d’une 2ᵉ whitelist IP sur le VPS pour encaisser.

### 5.2 FlexPay (recommandé #1 bis — local)

- Agrégateur **congolais** (INFOSET), souvent cité comme autorisé BCC.
- Même trio OM / M-Pesa / Airtel (+ Afrimoney), **CDF et USD**.
- Auth Bearer + code marchand ; callback URL par transaction (clients open-source PHP/TS existent).
- **Inconvénient :** documentation publique moins complète → onboarding commercial indispensable avant estimation effort code.

### 5.3 PawaPay / LigdiCash (recommandé #2)

- **PawaPay :** API pan-africaine mature, 3 opérateurs COD, CDF/USD, token Bearer + signatures callbacks.
- **LigdiCash :** 3–4 opérateurs CD documentés ; attention **devise API = XOF** (conversion) et flux Orange en **redirect** — moins idéal pour une app mobile « push-only » type SENGA.

---

## 6. Recommandation AfriSoft

| Rôle | Choix | Pourquoi |
|------|-------|----------|
| **Primaire** | **SerdiPay** | Déjà câblé, IP VPS whitelistée, 3 opérateurs, callback hub |
| **Failover** | **CinetPay** | Même couverture opérateurs, docs FR, prix public, auth clé API, pas d’IP pour collect |
| **Plan B commercial** | **FlexPay** | Si CinetPay KYC / délais / devis trop lents — partenaire local Kinshasa |
| **Ne pas prioriser** | Flutterwave, Paystack, PayDunya, FedaPay, Stripe | Pas de MM RDC exploitable aujourd’hui |
| **À clarifier en parallèle** | Africa’s Talking MM RDC | Connecteur déjà dans le repo — une confirmation commerciale peut donner un failover « gratuit » côté code |

### Paire recommandée

```text
Primaire  : SerdiPay
Failover  : CinetPay
Switch    : MOBILE_MONEY_GATEWAY=serdipay|cinetpay
```

Même esprit que :

```text
SMS_PROVIDER=africastalking|serdipay
```

---

## 7. Comment basculer SerdiPay ↔ CinetPay (ops)

```
Apps (SENGA / Educongo)
        │  POST /v1/payments  (app_id + HMAC)  ou wallet SENGA
        ▼
Hub pay.afri-soft.com
        │  lit MOBILE_MONEY_GATEWAY
        ├─ serdipay  → SerdiPay C2B  →  /webhooks/serdipay
        └─ cinetpay  → CinetPay init →  /webhooks/cinetpay
        │
        ▼
Webhook sortant unifié vers l’app (inchangé)
```

**Bascule manuelle (sticky) :**

1. Garder **les deux** jeux de secrets sur le VPS (`SERDIPAY_*` + `CINETPAY_*`).
2. Sur `/opt/afrisoft-pay` (et Render si applicable) :
   - Primaire : `MOBILE_MONEY_GATEWAY=serdipay`
   - Failover : `MOBILE_MONEY_GATEWAY=cinetpay`
3. Recreate / redeploy le conteneur hub **seulement** après smoke test avec `MOCK_PAYMENTS` encore cohérent (ne pas passer `MOCK_PAYMENTS=false` sans credentials live validés).
4. Pas de redeploy apps clientes.
5. Webhook CinetPay à enregistrer : `https://pay.afri-soft.com/webhooks/cinetpay`
6. Caddy : rewrite `/webhooks/cinetpay` → `/api/payments/webhooks/cinetpay` (voir `deploy/afrisoft-pay/caddy/Caddyfile.snippet`).

**Env CinetPay (à remplir après signup) :**

| Variable | Obligatoire | Rôle |
|----------|-------------|------|
| `CINETPAY_API_KEY` | oui | Integrations → apikey |
| `CINETPAY_SITE_ID` | oui | Integrations → site_id |
| `CINETPAY_SECRET_KEY` | fortement reco. | HMAC header `x-token` |
| `CINETPAY_NOTIFY_URL` | oui | `https://pay.afri-soft.com/webhooks/cinetpay` |
| `CINETPAY_RETURN_URL` | reco. | page / deep link après checkout |
| `CINETPAY_ENV` | non | `PROD` \| `TEST` |
| `CINETPAY_CURRENCY` | non | `CDF` (défaut) \| `USD` |

**Blocage UX API :** CinetPay init renvoie un **`payment_url`** (guichet hébergé). Avec `lock_phone_number` + téléphone, les opérateurs RDC confirment ensuite par **code secret / push SMS** — ce n’est pas un USSD push serveur pur comme SerdiPay C2B. L’app doit ouvrir `paymentUrl` (WebView) quand présent.

---

## 8. Blocages / prérequis (avant code)

| Blocage | Action |
|---------|--------|
| **KYC / KYB marchand RDC** | RCCM, NIF, pièces dirigeants, compte bancaire / wallet règlement — pour CinetPay **et** FlexPay |
| **Contrat + devis** | Obtenir grille réelle (collect CDF, délais settlement, chargebacks) |
| **Activation opérateurs** | Vérifier que OM + M-Pesa + Airtel sont **tous** ouverts sur le compte (parfois activés un par un) |
| **Sandbox** | Compte test + 2–3 numéros réels par opérateur |
| **Webhook HTTPS** | Enregistrer `https://pay.afri-soft.com/webhooks/<provider>` |
| **Devises** | SENGA est surtout **CDF** — écarter ou adapter LigdiCash (XOF) si trop risqué |
| **IP SerdiPay** | Garder le VPS ; le 2ᵉ fournisseur ne doit pas imposer une IP différente pour le collect |
| **AT MM** | Demander à Africa’s Talking : « Mobile Checkout RDC OM/M-Pesa/Airtel live ? » |

---

## 9. Prochaines étapes (après ce scaffold)

**Tech déjà en place :** `packages/shared/src/cinetpay.ts` · webhook `POST/GET …/webhooks/cinetpay` · switch sticky · env example · tests unitaires HMAC / payload.

1. **Commercial :** créer le compte CinetPay → récupérer `apikey`, `site_id`, `secret_key` (menu Integrations).
2. KYC / activation opérateurs OM + M-Pesa + Airtel (CDF).
3. Poser les env sur le VPS hub (garder `MOCK_PAYMENTS=true` jusqu’au smoke test).
4. Enregistrer `notify_url` = `https://pay.afri-soft.com/webhooks/cinetpay` ; vérifier rewrite Caddy.
5. Sandbox / petits montants : `MOBILE_MONEY_GATEWAY=cinetpay`, ouvrir `paymentUrl`, confirmer webhook → crédit.
6. Runbook ops : bascule `serdipay` ↔ `cinetpay` sans toucher aux apps.
7. **Ne pas** intégrer FlexPay/PawaPay en parallèle tant que CinetPay n’est pas validé.

---

## 10. Sources (consultation août 2026)

- CinetPay opérateurs / limites : [docs.cinetpay.com — tableau](https://docs.cinetpay.com/api/1.0-en/checkout/tableau)  
- CinetPay prix RDC : [cinetpay.com/pricing](https://cinetpay.com/pricing)  
- CinetPay notif HMAC : [docs.cinetpay.com — notification / HMAC](https://docs.cinetpay.com/api/1.0-en/checkout/notification)  
- LigdiCash opérateurs RDC : [developers.ligdicash.com — supported operators](https://developers.ligdicash.com/en/reference/supported-operators)  
- PawaPay providers COD : [docs.pawapay.io — providers](https://docs.pawapay.io/v2/docs/providers)  
- Nomba DRC Collection : [developer.nomba.com — global collections](https://developer.nomba.com/docs/products/global-collections/introduction)  
- Vodacom M-Pesa Open API RDC : [business.m-pesa.com](https://business.m-pesa.com/) / [vodacom.cd APIs](https://www.vodacom.cd/particulier/m-pesa/service-financier/les-apis-mpesa)  
- Orange Web Payment (liste pays incl. RD Congo) : [developer.orange.com/apis/om-webpay](https://developer.orange.com/apis/om-webpay)  
- Flutterwave méthodes / pays : [developer.flutterwave.com](https://developer.flutterwave.com/v3.0/docs/payment-methods)  
- PayDunya pays : FAQ officielle (6 pays UEMOA, sans RDC)

*Les mentions « Incertain » doivent être validées par devis / sandbox avant engagement technique.*

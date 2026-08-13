# Plan de migration VPS — AfriSoft / SENGA (Mova)

**Public :** direction & ops  
**Horizon :** mois prochain (ordre à faible risque)  
**Statut :** plan concret à exécuter — **pas encore de changement production**  
**Date :** août 2026  

---

## Résumé direction (1 minute)

| Aujourd’hui | Cible |
|-------------|--------|
| Render Starter (~**7 USD**/service) pour presque tout SENGA + 1 VPS hubs | **3 VPS Hetzner** : hubs (existant) + web + API |
| Coût Render estimé **~77–112 USD/mois** (+ VPS hubs ~7 USD) | Coût VPS total estimé **~37–53 USD/mois** |
| IP fixe SerdiPay déjà sur `178.104.82.66` | **On ne touche pas** à ce VPS (pay + sms) |

**Recommandation :** **3 boîtes** (pas tout sur le CX23 actuel). Migrer d’abord les sites web, puis l’API, puis couper Render.

---

## 1. Architecture cible — 3 boîtes

```
                    Cloudflare DNS (afri-soft.com)
         ┌──────────────┬──────────────┬──────────────┐
         │              │              │              │
   senga / admin /   api.afri-soft   pay.afri-soft  sms.afri-soft
   restaurant / rental
         │              │              │              │
         ▼              ▼              ▼              ▼
   ┌───────────┐  ┌───────────┐  ┌─────────────────────────┐
   │  VPS-web  │  │  VPS-api  │  │  VPS-pay (EXISTANT)     │
   │  (NOUVEAU)│  │  (NOUVEAU)│  │  CX23 · 178.104.82.66   │
   │  Next.js  │  │  NestJS   │  │  pay hub + sms hub      │
   │  ×4       │  │  + PG×5   │  │  (ne pas surcharger)    │
   │  + Caddy  │  │  + Redis  │  └─────────────────────────┘
   └───────────┘  │  + Caddy  │
                  └───────────┘
```

### Pourquoi 3 VPS (et pas 1 ni 2) ?

| Option | Verdict |
|--------|---------|
| **1 VPS** (tout sur le CX23 actuel) | **Non.** Le CX23 (2 vCPU / 4 Go) héberge déjà pay + sms ; y ajouter API + Postgres + 4 frontends = saturation, panne unique, et risque SerdiPay (IP whitelist). |
| **2 VPS** (pay existant + un gros « tout SENGA ») | Possible pour économiser ~8–12 USD/mois, mais frontends et base de données se disputent CPU/RAM ; un pic web peut ralentir les courses. |
| **3 VPS** (pay / web / api) | **Recommandé.** Isolation hubs (IP SerdiPay), cutover DNS indépendant, scaling séparé, rollback simple. |

**Variante 2 VPS (si budget ultra-serré) :** garder VPS-pay, et un seul **CX43/CX53** pour web + API + Postgres. Acceptable en démarrage, avec monitoring strict — documenté en §3 comme plan B.

---

## 2. Quoi va où

Inventaire aligné sur `render.yaml` + domaines Cloudflare `*.afri-soft.com`.

### 2.1 Tableau complet

| Composant | Aujourd’hui (Render / VPS) | Cible | Domaine public |
|-----------|----------------------------|-------|----------------|
| **Payment hub AfriSoft** | VPS-pay | **VPS-pay** (inchangé) | `pay.afri-soft.com` |
| **SMS / OTP hub AfriSoft** | VPS-pay | **VPS-pay** (inchangé) | `sms.afri-soft.com` |
| `mova-web` (PWA / site passager) | Render Starter | **VPS-web** | `senga.afri-soft.com` |
| `mova-admin-web` | Render Starter | **VPS-web** | `admin.afri-soft.com` |
| `mova-restaurant` | Render Starter | **VPS-web** | `restaurant.afri-soft.com` |
| `mova-rental-partner` | Render Starter | **VPS-web** | `rental.afri-soft.com` |
| `mova-gateway` | Render Starter | **VPS-api** | `api.afri-soft.com` |
| `mova-auth` | Render Starter | **VPS-api** | (interne Docker) |
| `mova-ride` | Render Starter | **VPS-api** | (interne) |
| `mova-payment` *(service SENGA wallet / orchestration)* | Render Starter | **VPS-api** | (interne ; appelle le hub `pay.*`) |
| `mova-driver` | Render Starter | **VPS-api** | (interne) |
| `mova-notification` | Render Starter | **VPS-api** | (interne) |
| `mova-admin` *(API admin Nest)* | Render Starter | **VPS-api** | (interne via gateway) |
| `mova-db-auth` | Render Postgres | **VPS-api** (Postgres Docker) *ou Neon* | — |
| `mova-db-rides` | Render Postgres | **VPS-api** / Neon | — |
| `mova-db-payments` | Render Postgres | **VPS-api** / Neon | — |
| `mova-db-drivers` | Render Postgres | **VPS-api** / Neon | — |
| `mova-db-notifications` | Render Postgres | **VPS-api** / Neon | — |
| `mova-redis` | Render Key Value | **VPS-api** (Redis Docker) | — |
| Apps mobiles Flutter | Stores | **Inchangé** (pointent vers `api.*`) | — |
| Supabase Storage (KYC / uploads) | Supabase | **Reste hors VPS** | — |

### 2.2 Rôle de chaque boîte

| Boîte | Contenu Docker (cible) | Rôle métier |
|-------|------------------------|-------------|
| **VPS-pay** | Hub pay + hub sms + Redis local hubs + Caddy | Mobile money (IP SerdiPay) + OTP multi-apps |
| **VPS-web** | 4× Next.js + Caddy (TLS) | Sites partenaires / admin / SENGA web |
| **VPS-api** | gateway + 6 microservices + Postgres (5 DB) + Redis + Caddy | Cœur métier SENGA + WebSocket |

---

## 3. Tailles Hetzner recommandées (prix actuels)

Sources : [ajustement tarifaire Hetzner 15 juin 2026](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/) — région **Allemagne / Finlande**, **hors TVA**, **hors IPv4** (~0,50 € / ~0,50–0,60 USD / mois par serveur).  
Les serveurs **déjà créés avant le 15/06/2026** peuvent encore être au **tarif ancien** tant qu’on ne les redimensionne pas — le CX23 hubs est probablement dans ce cas (~7 USD facturés aujourd’hui).

### 3.1 Specs & prix (nouvelles commandes)

| Plan | vCPU | RAM | Disque | €/mois | USD/mois | Usage conseillé |
|------|------|-----|--------|--------|----------|-----------------|
| **CX23** | 2 | 4 Go | 40 Go | **5,49 €** | **~6,49 $** | VPS-pay (existant) — hubs seulement |
| **CX33** | 4 | 8 Go | 80 Go | **8,49 €** | **~9,99 $** | **VPS-web** |
| **CX43** | 8 | 16 Go | 160 Go | **15,99 €** | **~18,49 $** | **VPS-api** (démarrage) |
| **CX53** | 16 | 32 Go | 320 Go | **29,49 €** | **~34,99 $** | VPS-api si trafic / marge confort |
| CPX22 | 2 | 4 Go | 80 Go | 19,49 € | ~22,99 $ | À éviter pour ce budget (trop cher vs CX) |
| CPX32 | 4 | 8 Go | 160 Go | 35,49 € | ~41,99 $ | Uniquement si besoin perf AMD dédiée « regular » |

> Après la hausse juin 2026, la gamme **CX (cost-optimized)** est nettement plus rentable que **CPX** pour SENGA.

### 3.2 Panier recommandé (Plan A — 3 VPS)

| Serveur | Plan | Estimation mensuelle* |
|---------|------|------------------------|
| VPS-pay (existant) | CX23 | **~6–7 USD** (garder tel quel) |
| VPS-web (nouveau) | **CX33** + IPv4 | **~10–11 USD** (~9–10 €) |
| VPS-api (nouveau) | **CX43** + IPv4 | **~19–20 USD** (~16–17 €) |
| **Total VPS** | | **≈ 35–38 USD / ≈ 31–34 €** |

\*IPv4 inclus dans l’estimation haute. TVA DE 19 % si facturation allemande entreprise — à vérifier avec le compte Hetzner.

**Plan A+ (plus de marge API) :** VPS-api en **CX53** → total **≈ 50–53 USD / ≈ 45–48 €**.

### 3.3 Plan B — 2 VPS (économie)

| Serveur | Plan | Estimation |
|---------|------|------------|
| VPS-pay | CX23 | ~7 USD |
| VPS-senga (web+api+db) | **CX53** | ~35–36 USD |
| **Total** | | **≈ 42–43 USD** |

Économie faible vs Plan A CX43 ; complexité ops plus élevée. **Préférer Plan A.**

---

## 4. Comparatif de coûts mensuels

### 4.1 Render actuel (estimation)

Après passage de nombreux services en **Starter (~7 USD)** :

| Poste | Calcul | Estimation |
|-------|--------|------------|
| Web services Docker / Next | **11 × 7 USD** (gateway, auth, ride, payment, driver, notification, admin, web, admin-web, restaurant, rental) | **77 USD** |
| PostgreSQL ×5 | **5 × 7 USD** (si toujours Starter) | **35 USD** |
| Redis | Free Blueprint (ou Starter ~10 USD si upgradé) | **0–10 USD** |
| **Sous-total Render** | | **≈ 77–122 USD** |
| VPS hubs (déjà là) | CX23 | **~7 USD** |
| **Total aujourd’hui** | | **≈ 84–129 USD/mois** |

Si seules les APIs + fronts sont en Starter et que les DB sont encore Free/anciennes : prendre la **fourchette basse (~84 USD)**. Si tout le Blueprint Starter tourne : viser **~112–120 USD**.

### 4.2 Cible VPS (Plan A)

| Poste | Estimation |
|-------|------------|
| 3× Hetzner (pay + web CX33 + api CX43) | **≈ 35–38 USD** |
| Neon Postgres (optionnel, §7) | +19–69 USD |
| Supabase / SMS / Mapbox / etc. | inchangé (hors sujet migration) |

### 4.3 Économie attendue

| Scénario | Render+VPS | VPS seul (Plan A) | Économie / mois |
|----------|------------|-------------------|-----------------|
| Render « beaucoup de Starters » | ~110 USD | ~37 USD | **≈ 70 USD** |
| Render bas (DB cheap) | ~84 USD | ~37 USD | **≈ 45 USD** |
| Plan A+ (CX53 API) | ~110 USD | ~52 USD | **≈ 58 USD** |

**Message clair :** quitter Render pour 2 nouveaux VPS + garder le hubs **divise typiquement la facture d’hébergement SENGA par 2 à 3**, sans toucher à l’IP SerdiPay.

---

## 5. Calendrier phasé (4 semaines — mois prochain)

Ordre à **faible risque** : frontends d’abord (reversible en 5 min via DNS) → API → coupure Render.

### Semaine 1 — Préparation (zéro impact users)

- [ ] Inventaire Render : liste exacte des services Starter + DB + variables (`mova-external-apis`)
- [ ] Backup Postgres obligatoire (`scripts/backup-db.sh` / `pg_dump` des 5 `DATABASE_URL_*`)
- [ ] Commander **VPS-web (CX33)** et **VPS-api (CX43)** — région EU (FSN/NBG/HEL), Ubuntu LTS
- [ ] Firewall Hetzner : SSH + 80/443 seulement ; fail2ban
- [ ] Installer Docker + Docker Compose + Caddy sur les 2 nouveaux VPS
- [ ] Préparer `deploy/` : compose web, compose api (miroirs du `docker-compose` repo)
- [ ] Snapshot / export secrets (JWT, INTERNAL_API_KEY, SerdiPay côté apps = URLs hub, FCM, etc.) — **pas dans git**
- [ ] Documenter IPs nouvelles ; créer enregistrements DNS Cloudflare en **DNS only** (gris) prêts mais non basculés (ou sous-domaines `staging-`)

### Semaine 2 — Frontends (VPS-web)

- [ ] Déployer les 4 Next.js derrière Caddy : `senga`, `admin`, `restaurant`, `rental`
- [ ] `NEXT_PUBLIC_API_URL=https://api.afri-soft.com` (ou URL Render encore active pendant la transition)
- [ ] Tests manuels HTTPS + login admin + pages partenaires
- [ ] **Cutover DNS Cloudflare** un domaine à la fois (TTL bas 60–300 s la veille)
- [ ] Rollback = remettre CNAME vers `*.onrender.com` si besoin
- [ ] Laisser Render fronts allumés 48 h en secours

### Semaine 3 — API + données (VPS-api)

- [ ] Monter Postgres (5 bases) + Redis + microservices + gateway
- [ ] Restaurer dumps ; lancer migrations Prisma si besoin
- [ ] Smoke interne : `/health` gateway, OTP (via hub sms), course test, wallet
- [ ] Mettre à jour CORS (`CORS_ORIGIN` = domaines afri-soft.com)
- [ ] **Cutover DNS** `api.afri-soft.com` → IP VPS-api
- [ ] Apps mobiles : vérifier builds CI (`PROD_API_URL` / `PROD_WS_URL`) pointent déjà vers `https://api.afri-soft.com` (sinon rebuild / config)
- [ ] Webhooks hub pay → URL SENGA : confirmer callback app joignable sur la nouvelle API

### Semaine 4 — Stabilisation & sortie Render

- [ ] Monitoring 72 h (CPU/RAM, logs Caddy, erreurs 5xx, latence WS)
- [ ] Backups automatisés quotidiens (cron `pg_dump` → volume ou Object Storage Hetzner)
- [ ] Baisser / suspendre services Render un par un (fronts d’abord, puis APIs, puis DB en dernier après double backup)
- [ ] Mettre à jour docs ops (`PRODUCTION_DEPLOYMENT.md`, CI deploy) pour cibler VPS au lieu de Render
- [ ] Revue coûts Hetzner vs facture Render du mois

**Jours « gel » suggérés :** éviter cutover API un vendredi soir ou jour de pic marketing.

---

## 6. Risques & rollback

| Risque | Impact | Mitigation | Rollback |
|--------|--------|------------|----------|
| DNS mal configuré / proxy orange Cloudflare | TLS cassé, WS Socket.IO cassé | API & hubs en **DNS only** (comme `pay` / `sms`) ; tester WS après cutover | Remettre ancien enregistrement DNS |
| Perte / corruption Postgres au restore | Indisponibilité métier | Double backup avant cutover ; restore test sur VPS avant bascule | Remonter `DATABASE_URL` vers Render PG tant que non détruites |
| Saturation RAM sur CX43 (7 conteneurs + PG) | Lenteur / OOM | Limites mémoire Compose ; swap léger ; upgrade CX53 prêt | Resize Hetzner (attention : resize peut basculer au **nouveau** tarif) |
| Secrets oubliés / CORS | Login / apps cassés | Checklist env = groupe `mova-external-apis` + services.env | Redeploy Render inchangé |
| Couper Render trop tôt | Pas de filet | Garder Render **suspendu** (pas delete) 7–14 jours | Unsuspend + DNS arrière |
| Incident SerdiPay | Paiements | **Ne jamais** migrer pay/sms hors `178.104.82.66` sans accord SerdiPay | N/A — boîte isolée |
| Mobile encore sur `*.onrender.com` | Users anciens APK | Forcer domaines afri-soft ; communication store | Temporary CNAME api → Render |

**Règle d’or rollback :** tant que les DB Render existent et que les images tournent, un **changement DNS Cloudflare** ramène le trafic en quelques minutes.

---

## 7. Ce qui reste hors VPS (volontairement)

| Service | Pourquoi le laisser dehors |
|---------|----------------------------|
| **Supabase Storage** | Buckets KYC / uploads déjà en place (Frankfurt) — pas de gain à self-host MinIO maintenant |
| **Cloudflare DNS** | Gratuit, proxy optionnel, cutover rapide |
| **GitHub Actions** | CI/CD builds — inchangé |
| **Stores Apple / Google** | Distribution mobile |
| **Providers SMS / Mapbox / FCM** | SaaS métier, pas d’hébergement app |
| **Neon PostgreSQL (option)** | Alternative aux 5 Postgres Docker : moins d’ops, backups managés, ~**19–69 USD**/projet ; VPS-api alors plus petit (CX33 possible). **Recommandé si l’équipe ops est seule / junior.** |

**Option hybride conseillée si prudence max :**

1. VPS-web + VPS-api (apps seulement)  
2. **Neon** pour les 5 bases  
3. Redis sur VPS-api  
→ Un peu plus cher que Postgres Docker, nettement plus sûr pour le sommeil du propriétaire.

---

## 8. Prérequis (checklist avant Semaine 1)

### Backups

- [ ] `DATABASE_URL_AUTH` … `DATABASE_URL_NOTIFICATIONS` exportés
- [ ] `pg_dump` des 5 bases + copie hors Render (machine locale chiffrée ou Object Storage)
- [ ] Snapshot des `.env` production (gestionnaire de secrets / coffre), jamais commit

### Docker Compose

- [ ] Compose **web** : 4 services Next, réseau interne, restart unless-stopped  
- [ ] Compose **api** : gateway + 6 services + postgres + redis (profils optionnels)  
- [ ] Images build depuis le monorepo (même Dockerfiles que Render)  
- [ ] Healthchecks + `docker compose ps` documentés

### Caddy

- [ ] Un Caddyfile par VPS (TLS Let’s Encrypt automatique)  
- [ ] VPS-web : 4 hostnames → ports locaux  
- [ ] VPS-api : `api.afri-soft.com` → gateway :3000  
- [ ] VPS-pay : **ne pas modifier** sauf besoin sms/pay déjà documenté

### DNS cutover (Cloudflare)

| Nom | Type | Cible cible | Proxy |
|-----|------|-------------|-------|
| `pay` | A | `178.104.82.66` | DNS only (déjà) |
| `sms` | A | `178.104.82.66` | DNS only (déjà) |
| `senga` | A | IP VPS-web | DNS only ou proxied (OK pour HTML) |
| `admin` | A | IP VPS-web | idem |
| `restaurant` | A | IP VPS-web | idem |
| `rental` | A | IP VPS-web | idem |
| `api` | A | IP VPS-api | **DNS only** (WebSocket / cookies) |

Procédure cutover : TTL bas → déployer → tester via `/etc/hosts` ou preview → bascule A → smoke → TTL normal.

### Accès & sécurité

- [ ] Clés SSH ed25519, pas de root password SSH  
- [ ] UFW / firewall Hetzner Cloud  
- [ ] Accès sudo limité 1–2 personnes  
- [ ] Journal des changements DNS + déploiements

---

## 9. Décision demandée (case à cocher)

| Choix | Décision |
|-------|----------|
| □ Plan A — 3 VPS (CX23 existant + CX33 web + CX43 api) | **Recommandé** |
| □ Plan A+ — idem avec CX53 api | Si budget OK / trafic anticipé |
| □ Plan B — 2 VPS (pay + CX53 tout-en-un SENGA) | Économie faible, plus de risque |
| □ Hybride Neon | Postgres managé + VPS apps |

Une fois le choix validé : provisionner les VPS en Semaine 1 du mois de migration — **sans éteindre Render** avant la fin de Semaine 4.

---

## 10. Références internes

- Blueprint actuel : `render.yaml`  
- Déploiement prod (Render) : [PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md)  
- Coûts direction : [DIRECTION_SERVICES_EXTERNES_ET_COUTS.md](./DIRECTION_SERVICES_EXTERNES_ET_COUTS.md)  
- Hub pay : [AFRISOFT_PAYMENT_HUB_API.md](./AFRISOFT_PAYMENT_HUB_API.md)  
- Hub sms : [AFRISOFT_SMS_OTP_HUB_API.md](./AFRISOFT_SMS_OTP_HUB_API.md) · scaffold `deploy/afrisoft-sms/`  
- Tarifs Hetzner (post 15/06/2026) : https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/

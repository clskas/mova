# SENGA RDC — Services externes, coûts et choix stratégiques

**Document à l’attention de la Direction**  
**Version :** 1.1 — Juillet 2026  
**Objet :** Liste exhaustive des dépendances externes pour une mise en production réelle, comparaison des options et recommandation budgétaire.

---

## 1. Résumé exécutif

SENGA est une plateforme **techniquement prête** (applications passager, chauffeur, admin, portails partenaire/restaurant, API microservices). En environnement de développement, plusieurs fonctions critiques fonctionnent en **mode simulation** (`MOCK_OTP`, `MOCK_PAYMENTS`, stockage photo local).

Pour être **pleinement opérationnelle en République Démocratique du Congo**, l’entreprise doit contracter des services externes dans **6 familles** :

| Famille | Criticité | Sans ce service |
|---------|-----------|-----------------|
| Hébergement cloud (API, bases, cache) | **Bloquante** | Aucun accès utilisateur en production |
| SMS / OTP connexion | **Bloquante** | Impossible de se connecter (sauf code test) |
| Mobile Money (paiements réels) | **Bloquante** | Courses gratuites ou portefeuille fictif |
| Cartographie & adresses | **Haute** | Estimations imprécises, mauvaise UX |
| Notifications push (chauffeur) | **Haute** | Offres de course manquées |
| Stores mobile + domaine | **Bloquante** (distribution) | Pas d’app installable par le grand public |

**Recommandation optimale (coût / risque / time-to-market RDC) :**

- **Hébergement :** Render (Blueprint `render.yaml` déjà prêt) — phase pilote Kinshasa, puis montée en charge.
- **SMS + Mobile Money :** **Africa’s Talking** (un seul contrat, déjà intégré dans le code).
- **Cartographie :** Nominatim + OSRM **auto-hébergés** sur un petit serveur + **Mapbox** en secours autocomplete.
- **Photos :** Cloudinary (plan gratuit puis Plus selon volume).
- **Push :** Firebase Cloud Messaging (gratuit) + comptes développeur Apple / Google.

**Budget récurrent indicatif (pilote Kinshasa, ~500–2 000 courses/mois) :** **150 – 400 USD / mois** hors frais de transaction Mobile Money et hors masse salariale technique.

**Investissement initial unique :** **~125 – 200 USD** (stores + domaine + mise en service).

---

## 2. Cartographie des besoins par fonction métier

| Fonction SENGA | Service externe | Variable(s) technique | Mode actuel dev |
|---------------|-----------------|----------------------|-----------------|
| Connexion OTP (+243) | SMS provider | `SMS_PROVIDER`, `AFRICAS_TALKING_*` ou `TWILIO_*` | `MOCK_OTP=true` → code `123456` |
| Paiement course / wallet | Mobile Money | `MOBILE_MONEY_GATEWAY`, clés AT ou opérateurs | `MOCK_PAYMENTS=true` |
| Retrait chauffeur | Mobile Money (payout) | Même passerelle | Simulé |
| Autocomplétion adresse | Mapbox ou Nominatim | `MAPBOX_ACCESS_TOKEN`, `NOMINATIM_*` | Nominatim public (limité) |
| Distance / ETA | OSRM | `OSRM_BASE_URL` | Serveur public OSRM (limité) |
| Carte trajet (mobile/web) | Tuiles carte (optionnel) | Mapbox / OpenStreetMap | OSM libre |
| Photos KYC, colis, véhicules | Stockage CDN | `CLOUDINARY_*` ou disque serveur | Stockage local `/uploads` |
| Offres course chauffeur | Push FCM | Projet Firebase + `google-services.json` | Alertes locales uniquement |
| SMS statut course | SMS | Même provider OTP | Mock / désactivé |
| API & temps réel | Cloud + Redis | `REDIS_URL`, URLs services | Docker local |
| Données métier | PostgreSQL ×5 | `DATABASE_URL_*` | Postgres local |
| Distribution apps | Apple App Store + Google Play | Comptes développeur | APK debug uniquement |
| Nom de domaine | Registrar `.cd` | DNS → Render | `localhost` |

Référence technique complète : `config/external-apis.env.example`

---

## 3. Comparatif détaillé par catégorie

> **Note :** Les montants sont **indicatifs** (USD, hors taxes, juillet 2026). Les tarifs opérateurs RDC et Africa’s Talking doivent être **confirmés par devis commercial** avant engagement.

### 3.1 Hébergement backend, bases de données et cache

L’architecture SENGA repose sur **7 services web Docker** + **5 bases PostgreSQL** + **Redis** (voir `render.yaml`).

| Option | Description | Coût mensuel estimé | Avantages | Inconvénients |
|--------|-------------|---------------------|-----------|---------------|
| **A — Render (recommandé pilote)** | Blueprint existant, Francfort | **90 – 180 USD** (plans Starter) | Déploiement rapide, peu d’ops, CI déjà câblée | Cold starts plan Starter ; latence RDC à tester |
| **B — Render Standard** | Gateway + ride-service renforcés | **200 – 350 USD** | Meilleure dispo, moins de cold start | Coût ×2 à ×3 |
| **C — Neon PostgreSQL + Render compute** | BDD serverless Neon, apps sur Render | **120 – 250 USD** | BDD scalable, branches dev | Deux fournisseurs à gérer |
| **D — AWS (ECS/RDS/ElastiCache)** | Cloud enterprise | **250 – 800+ USD** + ops | Scalabilité mondiale, SLA | Complexité, profil DevOps requis |
| **E — VPS unique (Hetzner/OVH)** | Tout sur 1–2 serveurs | **20 – 80 USD** | Coût serveur bas | **Non recommandé** sans équipe ops 24/7 ; single point of failure |
| **F — Hébergeur local RDC** | Datacenter Kinshasa | **Sur devis** | Latence locale, souveraineté | Maturité variable, support limité |

**Comparaison annuelle (pilote) :**

| Option | An 1 (infra seule) |
|--------|-------------------|
| A Render Starter | ~1 100 – 2 200 USD |
| B Render Standard | ~2 400 – 4 200 USD |
| D AWS managé | ~3 000 – 10 000 USD |

**Choix optimal phase 1 :** **Option A** avec montée vers **B** dès > 1 000 courses/jour ou SLA client exigé.

---

### 3.2 SMS et OTP (connexion utilisateur)

Chaque connexion envoie **1 SMS** (code 6 chiffres). Volume pilote : 3 000–10 000 SMS/mois.

| Fournisseur | Coût unitaire indicatif (SMS → RDC) | Contrat | Intégration SENGA |
|-------------|--------------------------------------|---------|------------------|
| **Africa’s Talking** ⭐ | **0,02 – 0,05 USD** / SMS (devis volume) | 1 contrat pan-africain | **Native** (`SMS_PROVIDER=africastalking`) |
| **Twilio** | **0,06 – 0,15+ USD** / SMS | International | Legacy (`SMS_PROVIDER=twilio`) |
| **Opérateur direct (Orange, etc.)** | Variable | 3 contrats possibles | Non implémenté ; délais 3–12 mois |

**Coût mensuel SMS (10 000 OTP/mois) :**

| Fournisseur | Estimation |
|-------------|------------|
| Africa’s Talking | **200 – 500 USD** |
| Twilio | **600 – 1 500 USD** |

**Choix optimal :** **Africa’s Talking** — coût inférieur, un seul interlocuteur, déjà câblé pour OTP **et** Mobile Money.

**Actions direction :** ouvrir compte sur [account.africastalking.com](https://account.africastalking.com), demander short code ou expéditeur alphanumérique **« SENGA »** (validation ARPTC / opérateurs).

---

### 3.3 Mobile Money (paiements réels)

SENGA supporte **Orange Money**, **M-Pesa (Vodacom)**, **Airtel Money** via portefeuille intégré.

| Approche | Frais typiques | Contrats | Intégration |
|----------|----------------|----------|-------------|
| **A — Africa’s Talking (agrégateur)** ⭐ | % transaction + fixe (négociable) | **1 contrat** | `MOBILE_MONEY_GATEWAY=africastalking` |
| **B — APIs directes opérateurs** | Souvent 1–3 % / tx | **3 contrats** séparés | `MOBILE_MONEY_GATEWAY=legacy` + clés `ORANGE_*`, `MPESA_*`, `AIRTEL_*` |
| **C — Mock (interdit prod)** | 0 | — | Dev uniquement |

**Comparaison qualitative :**

| Critère | Africa’s Talking | Direct opérateurs |
|---------|------------------|-------------------|
| Délai mise en service | **2 – 6 semaines** | **3 – 6 mois** |
| Coût d’intégration technique | **Déjà fait** | Élevé (3 flux, 3 KYC) |
| Couverture utilisateurs RDC | Bonne (via agrégation) | Maximale si 3 actifs |
| Support & réconciliation | Centralisé | 3 interlocuteurs |

**Coût variable (non budget fixe) :** si GMV pilote = **50 000 USD/mois** et frais agrégateur = **2 %**, coût ≈ **1 000 USD/mois** — **refacturable** en commission plateforme.

**Choix optimal :** **Africa’s Talking** pour le lancement ; renégocier en direct avec Orange/Vodacom/Airtel **après** preuve de volume (> 500 k USD GMV/an).

---

### 3.4 Cartographie, géocodage et calcul d’itinéraire

| Option | Coût fixe/mois | Coût variable | Fiabilité prod RDC |
|--------|----------------|---------------|-------------------|
| **Serveurs publics OSM/Nominatim** | 0 | 0 | **Faible** (limites d’usage, latence) |
| **Auto-hébergé OSRM + Nominatim** ⭐ | **30 – 80 USD** (petit VPS) | 0 | **Bonne** si données OSM Kinshasa à jour |
| **Mapbox Geocoding API** | 0 (50 k req/mois gratuites) | ~0,50 USD / 1 000 req au-delà | **Très bonne** |
| **Google Maps Platform** | Crédit 200 USD/mois | Cher au-delà | Très bonne |

**Scénarios mensuels (estimation 50 000 requêtes géo/mois) :**

| Stack | Coût estimé |
|-------|-------------|
| Public gratuit seul | 0 USD — **risque rupture** |
| OSRM/Nominatim dédié | **50 USD** |
| Mapbox seul | **0 – 25 USD** (souvent dans le gratuit) |
| Hybride ⭐ (OSRM dédié + Mapbox secours) | **50 – 75 USD** |

**Choix optimal :** **Hybride** — OSRM + Nominatim sur VPS ; `MAPBOX_ACCESS_TOKEN` pour autocomplete premium.

---

### 3.5 Stockage photos (KYC, colis, véhicules location)

| Option | Coût mensuel | Limites |
|--------|--------------|---------|
| **Disque serveur (actuel)** | Inclus hébergement | Pas de CDN ; perte si crash disque |
| **Cloudinary Free** | 0 | ~25 crédits/mois — pilote seulement |
| **Cloudinary Plus** ⭐ | **~89 USD** | CDN, transformations, SLA |
| **AWS S3 + CloudFront** | **5 – 30 USD** (faible volume) | Nécessite config IAM |

**Choix optimal pilote :** Cloudinary **Free** puis **Plus** dès > 5 000 photos/mois.

---

### 3.6 Notifications push (chauffeur / passager)

| Service | Coût | Remarque |
|---------|------|----------|
| **Firebase Cloud Messaging (FCM)** ⭐ | **Gratuit** | Déjà intégré (`driver_push_service.dart`) |
| OneSignal / Pusher | 0 – 50 USD+ | Doublon inutile |

**Prérequis :** projet [Firebase Console](https://console.firebase.google.com), fichier `google-services.json` (modèle : `mobile/android/app/google-services.json.example`), compte Apple pour push iOS (certificat APNs).

**Choix optimal :** **FCM uniquement**.

---

### 3.7 Frontends web (passager, admin, portails)

| Hébergement | Coût/mois | Note |
|-------------|-----------|------|
| **Render** (mova-web, admin, partenaires) | **7 – 21 USD** / service | Déjà dans Blueprint |
| **Vercel** (Next.js admin seul) | 0 – 20 USD | Alternative admin |
| **Cloudflare Pages** | 0 – 5 USD | Static / edge |

**Choix optimal :** tout sur **Render** au départ (simplicité, un seul facturier).

---

### 3.8 Nom de domaine, DNS et certificats SSL

| Élément | Fournisseur type | Coût annuel |
|---------|------------------|-------------|
| Domaine `.cd` | Registrar agréé CDNIC | **30 – 80 USD** |
| Sous-domaines (`api.`, `admin.`, `app.`, `location.`) | DNS Cloudflare (gratuit) | **0** |
| Certificats HTTPS | Let’s Encrypt via Render | **0** |

**Noms recommandés :** `mova.cd`, `api.mova.cd`, `admin.mova.cd`, `app.mova.cd`, `location.mova.cd`, `resto.mova.cd`

---

### 3.9 Distribution applications mobiles

| Store | Frais | Délai typique |
|-------|-------|---------------|
| **Google Play Console** | **25 USD** (unique) | 1 – 7 jours review |
| **Apple Developer Program** | **99 USD / an** | 1 – 14 jours review |

**Obligatoire** pour diffusion grand public. Prévoir aussi :

- Politique de confidentialité hébergée (URL publique)
- Compte D-U-N-S / identité légale entreprise
- Captures d’écran, fiche store FR + EN

---

### 3.10 Outils optionnels (post-lancement)

| Service | Usage | Coût indicatif |
|---------|-------|----------------|
| **Sentry** | Erreurs apps & API | 0 – 26 USD/mois |
| **UptimeRobot / Better Stack** | Monitoring disponibilité | 0 – 20 USD/mois |
| **GitHub Actions** | CI/CD (déjà utilisé) | 0 – 50 USD/mois selon minutes |
| **Email transactionnel** (SendGrid) | Reçus, marketing | 0 – 20 USD/mois |

Non bloquants pour le jour J ; recommandés dès **mois 2**.

---

### 3.11 Grille de budgétisation — tarifs officiels par plateforme

> **Lecture direction :** tableau de référence pour arbitrer les contrats. Montants en **USD/mois** sauf mention « unique » ou « /an ». Taux indicatif **1 USD ≈ 2 800 CDF** (juillet 2026 — à actualiser en comptabilité).

#### 3.11.1 Hébergement cloud — détail ligne par ligne (Blueprint SENGA)

Inventaire exact du fichier `render.yaml` :

| Ressource Render | Plan Blueprint | Prix unitaire Render | Qté | Sous-total/mois |
|------------------|----------------|----------------------|-----|-----------------|
| Web Service (Docker) — Starter | Starter | **7 USD** | 8 (gateway, auth, ride, payment, driver, notification, admin, mova-web) | **56 USD** |
| PostgreSQL managé | Starter | **7 USD** | 5 (auth, rides, payments, drivers, notifications) | **35 USD** |
| Redis (Key Value) | Free | **0 USD** | 1 | **0 USD** |
| **Total Render Starter (Blueprint actuel)** | | | | **≈ 91 USD/mois** |

Montée en charge recommandée (services critiques uniquement) :

| Ressource | Plan | Prix unitaire | Qté | Sous-total/mois |
|-----------|------|---------------|-----|-----------------|
| gateway + ride-service | Standard | **25 USD** | 2 | **50 USD** |
| Autres web services | Starter | **7 USD** | 6 | **42 USD** |
| PostgreSQL | Starter → Standard | **7 → 20 USD** | 5 | **35 – 100 USD** |
| Redis | Starter (prod) | **10 USD** | 1 | **10 USD** |
| **Total Render mixte Standard** | | | | **≈ 137 – 202 USD/mois** |

| Plateforme alternative | Entrée de gamme | Milieu de gamme | Enterprise | Intégration SENGA |
|------------------------|-----------------|-----------------|------------|------------------|
| **Render** ⭐ | 91 USD (Blueprint) | 200 USD | 500+ USD | **Prête** (`render.yaml`) |
| **Railway** | 5 USD crédit + usage | 50 – 150 USD | Sur devis | Manuelle (pas de Blueprint) |
| **Fly.io** | ~30 USD | 80 – 200 USD | Sur devis | Docker compatible |
| **DigitalOcean App Platform** | 50 – 120 USD | 150 – 300 USD | Sur devis | Docker compatible |
| **AWS ECS Fargate + RDS** | 250 USD | 400 – 600 USD | 1 000+ USD | Terraform à créer |
| **Google Cloud Run + Cloud SQL** | 200 USD | 350 – 550 USD | 900+ USD | Terraform à créer |
| **Hetzner VPS CPX31** | **15 USD** (1 serveur) | 30 – 60 USD (2 VPS) | N/A | Compose manuel, ops interne |
| **OVH VPS** | 12 – 25 USD | 40 – 80 USD | Sur devis | Compose manuel |
| **Neon PostgreSQL** (BDD seule) | 0 (free tier) | 19 – 69 USD/projet | 100+ USD | Remplace 5 Postgres Render |

**Frontends Next.js (admin, web, restaurant, location)** — hors Blueprint Render actuel :

| Plateforme | Plan | Prix/mois | Services SENGA couverts |
|------------|------|-----------|------------------------|
| **Render Web** (Starter) | Starter | **7 USD** × N | mova-web inclus ; +7 USD/admin si hébergé |
| **Vercel** | Hobby / Pro | **0 / 20 USD** | Admin ou web seul |
| **Netlify** | Free / Pro | **0 / 19 USD** | PWA passager |
| **Cloudflare Pages** | Free / Pro | **0 / 20 USD** | Static + edge |
| **Dev local (pilote interne)** | — | **0 USD** | Admin :3002, Web :3001, Resto :3007, Location :3008 |

---

#### 3.11.2 SMS / OTP — comparatif tarifaire

| Plateforme | Abonnement fixe | Prix SMS → RDC (indicatif) | 3 000 SMS/mois | 10 000 SMS/mois | 30 000 SMS/mois |
|------------|-----------------|----------------------------|----------------|-----------------|-----------------|
| **Africa's Talking** ⭐ | 0 USD | 0,02 – 0,05 USD | **60 – 150 USD** | **200 – 500 USD** | **600 – 1 500 USD** |
| **Twilio** | 0 USD | 0,06 – 0,15 USD | **180 – 450 USD** | **600 – 1 500 USD** | **1 800 – 4 500 USD** |
| **Infobip** | Sur devis | 0,04 – 0,08 USD | **120 – 240 USD** | **400 – 800 USD** | **1 200 – 2 400 USD** |
| **MessageBird** | 0 USD | 0,05 – 0,12 USD | **150 – 360 USD** | **500 – 1 200 USD** | **1 500 – 3 600 USD** |
| **Orange API directe** | Sur devis | Variable | Sur devis | Sur devis | Sur devis |

---

#### 3.11.3 Mobile Money & paiements — frais variables

| Plateforme / canal | Frais setup | Frais par transaction | Contrats | Délai go-live |
|--------------------|-------------|----------------------|----------|---------------|
| **Africa's Talking (agrégateur)** ⭐ | 0 – 500 USD (KYC) | **1,5 – 3 %** + fixe | **1** | **2 – 6 semaines** |
| **Orange Money API directe** | 500 – 2 000 USD | **1 – 2,5 %** | 1 | **2 – 4 mois** |
| **M-Pesa Vodacom direct** | 500 – 2 000 USD | **1 – 2,5 %** | 1 | **3 – 6 mois** |
| **Airtel Money direct** | 500 – 2 000 USD | **1 – 2,5 %** | 1 | **2 – 5 mois** |
| **Stripe** (cartes internationales) | 0 USD | **2,9 % + 0,30 USD** | 1 | Non prioritaire RDC |
| **PayPal** | 0 USD | **3 – 5 %** | 1 | Peu utilisé en RDC |

**Simulation GMV (frais agrégateur 2 %) :**

| GMV mensuel (USD) | Frais MM (~2 %) | En CDF (×2 800) |
|-------------------|-----------------|-----------------|
| 15 000 | **300 USD** | ~840 000 CDF |
| 50 000 | **1 000 USD** | ~2 800 000 CDF |
| 150 000 | **3 000 USD** | ~8 400 000 CDF |
| 500 000 | **10 000 USD** | ~28 000 000 CDF |

---

#### 3.11.4 Cartographie & géolocalisation

| Plateforme | Plan | Prix fixe/mois | Prix variable | 50 k req géo/mois |
|------------|------|----------------|---------------|-------------------|
| **OSRM + Nominatim auto-hébergés** ⭐ | VPS Hetzner CPX21 | **8 – 15 USD** | 0 | **~15 USD** |
| **Mapbox** | Free puis pay-as-you-go | 0 | Geocoding ~0,50 USD/1k req | **0 – 25 USD** |
| **Google Maps Platform** | Crédit 200 USD/mois | 0* | Directions ~5 USD/1k | **0 – 50 USD** |
| **HERE Maps** | Freemium | 0 | ~1 USD/1k transactions | **30 – 80 USD** |
| **OpenCage** (géocodage) | Free / Dev | 0 / 50 USD | Au-delà du quota | **0 – 50 USD** |
| **Serveurs publics OSM** | — | **0 USD** | 0 | **0 USD** (risque SLA) |

\* Le crédit Google couvre souvent un pilote ; au-delà, facturation rapide.

---

#### 3.11.5 Stockage médias & CDN

| Plateforme | Plan | Prix/mois | Stockage | Bande passante |
|------------|------|-----------|----------|----------------|
| **Cloudinary Free** | Free | **0 USD** | ~25 crédits | Limité |
| **Cloudinary Plus** ⭐ | Plus | **89 USD** | 225 crédits | 225 GB |
| **Cloudinary Advanced** | Advanced | **224 USD** | 600 crédits | 600 GB |
| **AWS S3 + CloudFront** | Pay-as-you-go | **5 – 40 USD** | 0,023 USD/GB | 0,085 USD/GB |
| **Backblaze B2 + CDN** | Pay-as-you-go | **3 – 20 USD** | 0,006 USD/GB | Variable |
| **Disque Render** | Inclus | **0 USD** | Limité au plan | Pas de CDN |

---

#### 3.11.6 Notifications push & temps réel

| Plateforme | Plan | Prix/mois | Volume | Remarque SENGA |
|------------|------|-----------|--------|---------------|
| **Firebase FCM** ⭐ | Spark (gratuit) | **0 USD** | Illimité* | Déjà intégré |
| **OneSignal** | Free / Growth | **0 / 9 USD** | 10k+ abonnés | Doublon |
| **Pusher Channels** | Sandbox / Startup | **0 / 49 USD** | Websocket | Redis suffit côté API |
| **Ably** | Free / Standard | **0 / 29 USD** | Messages | Optionnel |

\* Fair use Google ; largement suffisant pour SENGA pilote.

---

#### 3.11.7 Monitoring, CI/CD, email

| Plateforme | Plan | Prix/mois | Usage SENGA |
|------------|------|-----------|------------|
| **GitHub** (dépôt + Actions) | Free / Team | **0 / 4 USD/user** | CI actuelle |
| **GitHub Actions** (minutes) | Inclus / payant | **0 – 50 USD** | Builds Docker + e2e |
| **Sentry** | Developer / Team | **0 / 26 USD** | Erreurs API + mobile |
| **Datadog** | Free / Pro | **0 / 15 USD/host** | APM avancé (phase 2) |
| **UptimeRobot** | Free / Pro | **0 / 7 USD** | Ping gateway / health |
| **Better Stack** | Free / Basic | **0 / 20 USD** | Logs + uptime |
| **SendGrid** | Free / Essentials | **0 / 20 USD** | Emails transactionnels |
| **Mailgun** | Trial / Foundation | **0 / 35 USD** | Alternative email |

---

#### 3.11.8 Domaine, DNS, sécurité

| Fournisseur | Service | Prix | Période |
|-------------|---------|------|---------|
| **CDNIC / registrar .cd** | Domaine `mova.cd` | **30 – 80 USD** | /an |
| **Namecheap / Gandi** | `.com` secours | **12 – 20 USD** | /an |
| **Cloudflare DNS** | DNS + proxy | **0 USD** | Free |
| **Cloudflare Pro** | WAF, cache | **20 USD** | /mois (optionnel) |
| **Let's Encrypt** | SSL | **0 USD** | — |

---

#### 3.11.9 Stores & distribution mobile

| Plateforme | Frais | Période | Renouvellement |
|------------|-------|---------|----------------|
| **Google Play Console** | **25 USD** | Unique (à vie compte) | — |
| **Apple Developer Program** | **99 USD** | /an | Obligatoire |
| **Huawei AppGallery** | 0 USD | — | Optionnel Afrique |
| **Samsung Galaxy Store** | 0 USD | — | Optionnel |

---

#### 3.11.10 Tableau synthèse — coût total par stack (mensuel fixe)

| Stack | Infra | SMS (10k) | Carto | Photos | Monitoring | **Total fixe** | MM variable (2 % GMV 50k) | **Total estimé** |
|-------|-------|-----------|-------|--------|------------|----------------|---------------------------|------------------|
| **A — SENGA recommandée** ⭐ | Render 91 + VPS carto 15 | 300 | 15 | 0 (Cloudinary free) | 0 | **~421 USD** | 1 000 USD | **~1 421 USD** |
| **B — Confort** | Render Standard 200 | 300 | 75 | 89 | 30 | **~694 USD** | 1 000 USD | **~1 694 USD** |
| **C — AWS enterprise** | 450 | 300 | 50 | 30 | 50 | **~880 USD** | 1 000 USD | **~1 880 USD** |
| **D — Économie VPS** | 60 | 300 | 0 | 0 | 0 | **~360 USD** | 1 000 USD | **~1 360 USD** |
| **E — Twilio + Render** | 91 | 900 | 15 | 0 | 0 | **~1 006 USD** | 1 000 USD | **~2 006 USD** |

Conversion direction (stack A, GMV 50k USD) : **~1 421 USD ≈ 3 980 000 CDF/mois** (hors masse salariale).

---

## 4. Synthèse budgétaire — trois scénarios

### Scénario 1 — Pilote Kinshasa (3 mois)

**Hypothèses :** 500–1 500 courses/mois, 3 000 SMS OTP, GMV 15 000 USD/mois.

| Poste | Mensuel (USD) |
|-------|---------------|
| Render Starter (détail §3.11.1 : 8 web + 5 DB + Redis free) | **91** |
| VPS carto OSRM/Nominatim | **15** |
| Africa’s Talking SMS (3 000 OTP) | **60 – 150** |
| Cloudinary Free | 0 |
| FCM | 0 |
| **Sous-total fixe** | **~166 – 256** |
| Frais Mobile Money (~2 % GMV 15k) | ~300 (variable) |

| Investissement initial | Montant |
|---------------------|---------|
| Google Play + Apple (an 1) | 124 |
| Domaine .cd | 50 |
| **Total initial** | **~175 USD** |

---

### Scénario 2 — Lancement national (12 mois)

**Hypothèses :** 5 000–15 000 courses/mois, 30 000 SMS, GMV 150 000 USD/mois.

| Poste | Mensuel (USD) |
|-------|---------------|
| Render Standard (services critiques) | 280 |
| Africa’s Talking SMS | 400 – 800 |
| Carto hybride | 75 |
| Cloudinary Plus | 89 |
| Monitoring (Sentry + uptime) | 30 |
| **Sous-total fixe** | **~870 – 1 270** |
| Frais Mobile Money (~2 % GMV) | ~3 000 (variable) |

---

### Scénario 3 — Économie maximale (risque élevé — non recommandé direction)

| Poste | Économie | Risque |
|-------|----------|--------|
| VPS unique au lieu de Render | −80 USD/mois | Pannes, pas de SLA |
| SMS mock / code fixe | −100 % SMS | **Fraude, illégalité** |
| Paiements mock | −frais MM | **Aucun revenu réel** |
| Carto publique seule | −50 USD | Ruptures fréquentes |

**Verdict :** scénario 3 **inacceptable** pour une exploitation commerciale.

---

## 5. Recommandation officielle SENGA (solution optimale)

```
┌─────────────────────────────────────────────────────────────┐
│  STACK RECOMMANDÉE — PRODUCTION RDC                         │
├─────────────────────────────────────────────────────────────┤
│  Hébergement     │ Render (Blueprint render.yaml)           │
│  Bases / cache   │ PostgreSQL Render ×5 + Redis Render      │
│  SMS + OTP       │ Africa's Talking                         │
│  Mobile Money    │ Africa's Talking (agrégateur)            │
│  Géocodage       │ Nominatim dédié + Mapbox (secours)       │
│  Routage         │ OSRM dédié (données OSM RDC)             │
│  Photos          │ Cloudinary                               │
│  Push            │ Firebase FCM (gratuit)                   │
│  Domaine         │ mova.cd + Cloudflare DNS                 │
│  Stores          │ Google Play + Apple Developer            │
└─────────────────────────────────────────────────────────────┘
```

**Pourquoi ce choix :**

1. **Time-to-market** — 80 % des intégrations sont déjà dans le code ; il manque surtout les **contrats et clés API**.
2. **Un seul interlocuteur paiements/SMS** en RDC (Africa’s Talking) vs trois négociations opérateurs.
3. **Coût fixe maîtrisé** (~250–350 USD/mois en pilote) avant commissions variables.
4. **Évolutivité** — migration possible vers AWS ou opérateurs directs sans réécrire l’application.

---

## 6. Plan d’action et planning de contractualisation

| Semaine | Action | Responsable | Livrable |
|---------|--------|-------------|----------|
| S1 | Ouvrir compte Africa’s Talking (sandbox → prod) | Direction / Finance | Clés API |
| S1 | Ouvrir compte Render + lier GitHub | Technique | Environnement staging |
| S2 | Commander domaine `.cd` + DNS | Direction | `api.mova.cd` actif |
| S2 | Créer projet Firebase + `google-services.json` | Technique | Push Android fonctionnel |
| S3 | Contrat Mobile Money AT + URL callback HTTPS | Direction / Finance | `MOCK_PAYMENTS=false` |
| S3 | Valider expéditeur SMS « SENGA » | Direction / Juridique | `MOCK_OTP=false` |
| S4 | Déployer OSRM/Nominatim (VPS ou Render) | Technique | ETA fiables Kinshasa |
| S4 | Comptes Google Play + Apple Developer | Direction | Soumission apps |
| S5–6 | Tests bout-en-bout production | QA + Métier | PV de recette |
| S6 | **Go-live pilote Kinshasa** | Direction | Exploitation réelle |

Guide opérationnel détaillé : `docs/PRODUCTION_DEPLOYMENT.md`  
Guide test location PIN : `docs/GUIDE_LOCATION_PIN_TEST_PRODUCTION.md`

---

## 7. Checklist décision Direction

Cocher avant signature des contrats :

- [ ] **Budget fixe mensuel** approuvé (scénario 1 ou 2)
- [ ] **Budget variable** Mobile Money compris (% sur GMV)
- [ ] **Entité juridique** identifiée pour contrats AT, stores, domaine
- [ ] **Compte bancaire / Mobile Money entreprise** pour reversements
- [ ] **Politique de confidentialité** et CGU publiées
- [ ] **Contact ARPTC / conformité** SMS si requis
- [ ] **Désactivation mocks** validée : `MOCK_OTP=false`, `MOCK_PAYMENTS=false`, `MOCK_SMS=false`
- [ ] **Personne responsable** secrets API (rotation `JWT_SECRET`, `INTERNAL_API_KEY`)

---

## 8. Annexe — Variables d’environnement à provisionner

Fichier source : `config/external-apis.env.example`

### Obligatoires production

| Variable | Fournisseur |
|----------|-------------|
| `JWT_SECRET`, `INTERNAL_API_KEY` | Interne (généré) |
| `DATABASE_URL_*` (×5) | Render PostgreSQL |
| `REDIS_URL` | Render Redis |
| `AFRICAS_TALKING_USERNAME`, `AFRICAS_TALKING_API_KEY` | Africa’s Talking |
| `AFRICAS_TALKING_SMS_SENDER` | Africa’s Talking |
| `AFRICAS_TALKING_MM_CALLBACK_URL` | Africa’s Talking |
| `MOBILE_MONEY_GATEWAY=africastalking` | — |
| `SMS_PROVIDER=africastalking` | — |
| `MOCK_OTP=false`, `MOCK_PAYMENTS=false` | — |

### Fortement recommandées

| Variable | Fournisseur |
|----------|-------------|
| `OSRM_BASE_URL`, `NOMINATIM_BASE_URL` | VPS dédié ou partenaire |
| `MAPBOX_ACCESS_TOKEN` | Mapbox |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Cloudinary |
| Projet Firebase + `google-services.json` | Google |

### Optionnelles / phase 2

| Variable | Fournisseur |
|----------|-------------|
| `TWILIO_*` | Twilio (secours SMS) |
| `ORANGE_MONEY_*`, `MPESA_*`, `AIRTEL_MONEY_*` | Opérateurs (direct) |
| `GOOGLE_OAUTH_CLIENT_ID` | Connexion Google |
| `SENTRY_DSN` | Sentry |

---

## 9. Contacts utiles (à compléter par la Direction)

| Fournisseur | URL | Contact interne SENGA |
|-------------|-----|-------------------|
| Africa’s Talking | https://africastalking.com | _________________ |
| Render | https://render.com | _________________ |
| Mapbox | https://mapbox.com | _________________ |
| Cloudinary | https://cloudinary.com | _________________ |
| Firebase / Google Cloud | https://firebase.google.com | _________________ |
| Apple Developer | https://developer.apple.com | _________________ |
| Google Play Console | https://play.google.com/console | _________________ |
| Registrar .cd (CDNIC) | https://www.cdnic.cd | _________________ |

---

*Document préparé à partir de l’état réel du dépôt SENGA (`config/external-apis.env.example`, `render.yaml`, intégrations payment-service / auth-service / ride-service). Les tarifs externes doivent être confirmés par devis avant engagement contractuel.*

# Budget production MOVA RDC — présentation Direction

**Document :** demande d'abonnement et validation budgétaire  
**Version :** 1.0 — Juillet 2026  
**Périmètre :** lancement national (26 provinces), stack **Render + Supabase**  
**Taux indicatif :** 1 USD ≈ 2 800 CDF (à actualiser en comptabilité)

---

## 1. Synthèse pour décision

| | Montant |
|---|---------|
| **Investissement initial (unique)** | **~200 – 350 USD** |
| **Coût fixe mensuel — phase lancement (mois 1–3)** | **~450 – 750 USD / mois** |
| **Coût fixe mensuel — croissance (mois 4–12)** | **~650 – 1 200 USD / mois** |
| **Coûts variables Mobile Money** | **1,5 – 3 % du GMV** (refacturable en commission) |

**Stack retenue (2 plateformes uniquement) :**

| Plateforme | Rôle |
|------------|------|
| **Render** | API (7 microservices), bases PostgreSQL ×5, Redis, frontends web |
| **Supabase** | Stockage documents (KYC, photos colis, menu, véhicules) |

**Économie SMS :** le **PIN local** (déjà développé) réduit les SMS OTP de **70 à 90 %** après les premières semaines.

---

## 2. Investissement initial unique

| Poste | Fournisseur | Coût (USD) | Fréquence | Obligatoire |
|-------|-------------|------------|-----------|-------------|
| Compte développeur Google Play | Google | **25** | Unique | Oui |
| Compte développeur Apple App Store | Apple | **99 / an** | Annuel | Oui (iOS) |
| Nom de domaine `.cd` (ex. `mova.cd`) | Registrar | **40 – 80** | Annuel | Oui |
| Configuration DNS + SSL | Render | **0** | — | Inclus |
| KYC Africa's Talking (Mobile Money) | Africa's Talking | **0 – 500** | Unique | Oui |
| Expéditeur SMS « MOVA » (validation) | Africa's Talking / ARPTC | **0 – 200** | Unique | Oui |
| Projet Firebase (push notifications) | Google | **0** | — | Oui |
| Mise en service technique (1ère prod) | Interne / prestataire | **0 – 500** | Unique | Recommandé |

**Total initial estimé : 200 – 350 USD** (hors prestation externe)

---

## 3. Coûts récurrents fixes — infrastructure

### 3.1 Render — backend & bases de données

Inventaire `render.yaml` (région Francfort, à valider latence RDC) :

| Ressource | Plan lancement | Qté | USD/mois |
|-----------|----------------|-----|----------|
| Web Services Docker (gateway, auth, ride, payment, driver, notification, admin) | Starter | 7 | **49** |
| Web Service `mova-web` (site passager) | Starter | 1 | **7** |
| PostgreSQL managé | Starter | 5 | **35** |
| Redis | Starter (prod) | 1 | **10** |
| **Sous-total Render backend** | | | **101** |

**Montée en charge nationale (recommandée dès trafic > 500 courses/jour) :**

| Ressource | Plan | Qté | USD/mois |
|-----------|------|-----|----------|
| gateway + ride-service | Standard | 2 | **50** |
| Autres services web | Starter | 6 | **42** |
| PostgreSQL | Starter | 5 | **35** |
| Redis | Starter | 1 | **10** |
| **Sous-total Render renforcé** | | | **137** |

### 3.2 Render — frontends partenaires & admin

| Application | Port local | Plan Render | USD/mois |
|-------------|------------|-------------|----------|
| Console admin | 3002 | Starter | **7** |
| Portail restaurant | 3007 | Starter | **7** |
| Portail location | 3008 | Starter | **7** |
| **Sous-total frontends** | | | **21** |

> Alternative phase test interne : héberger admin + portails en local (**0 USD**) et ne payer Render que pour l'API publique.

### 3.3 Supabase — stockage documents

| Plan | Inclus | USD/mois |
|------|--------|----------|
| **Pro** | 100 Go stockage, 250 Go bande passante | **~30** |
| Dépassement (si fort volume photos) | +0,02 USD/Go stockage | variable |

**Pourquoi Supabase plutôt que Cloudinary :** ~**60 USD/mois d'économie** (Cloudinary Plus ≈ 89 USD vs Supabase ≈ 30 USD).

### 3.4 Cartographie (national)

| Composant | Solution | USD/mois |
|-----------|----------|----------|
| OSRM + Nominatim (distances, ETA) | VPS dédié Hetzner/OVH | **15 – 30** |
| Mapbox (autocomplétion adresses, secours) | Free → pay-as-you-go | **0 – 25** |
| **Sous-total carto** | | **15 – 55** |

### 3.5 Notifications push

| Service | Coût |
|---------|------|
| Firebase Cloud Messaging (FCM) | **0 USD** |

---

## 4. Coûts récurrents — communication & paiements

### 4.1 SMS / OTP (Africa's Talking — recommandé)

**Avec PIN local MOVA** (1 SMS à la 1ère connexion ou nouvel appareil, puis PIN) :

| Phase | Utilisateurs actifs/mois | SMS estimés/mois | Coût (0,03 USD/SMS) |
|-------|--------------------------|------------------|---------------------|
| Lancement (mois 1–2) | 5 000 – 15 000 | 8 000 – 20 000 | **240 – 600 USD** |
| Stabilisation (mois 3–6) | 20 000 – 50 000 | 6 000 – 15 000 | **180 – 450 USD** |
| Croissance (mois 7–12) | 50 000 – 150 000 | 10 000 – 30 000 | **300 – 900 USD** |

> Sans PIN local, multiplier ces montants par **3 à 5**.

SMS transactionnels (statut course, optionnel) : **+50 – 200 USD/mois** selon volume.

### 4.2 Mobile Money (frais variables — non budget fixe)

| GMV mensuel (USD) | Frais agrégateur (~2 %) | En CDF (×2 800) |
|-------------------|-------------------------|------------------|
| 25 000 | **500 USD** | ~1 400 000 CDF |
| 100 000 | **2 000 USD** | ~5 600 000 CDF |
| 300 000 | **6 000 USD** | ~16 800 000 CDF |

Ces frais sont en principe **refacturés** via la commission plateforme MOVA.

---

## 5. Scénarios budgétaires annuels

### Scénario A — Lancement national prudent (recommandé Direction)

**Hypothèses :** 5 000 – 15 000 utilisateurs actifs, 500 – 2 000 courses/jour, 26 provinces, PIN local actif.

| Poste | USD/mois | USD/an |
|-------|----------|--------|
| Render (backend + frontends) | 120 – 160 | 1 440 – 1 920 |
| Supabase Storage | 30 – 40 | 360 – 480 |
| Cartographie | 20 – 40 | 240 – 480 |
| SMS (Africa's Talking + PIN) | 200 – 500 | 2 400 – 6 000 |
| Domaine + stores (amortis) | ~15 | 180 |
| Monitoring / divers | 0 – 30 | 0 – 360 |
| **Total fixe** | **~385 – 785** | **~4 620 – 9 420** |
| Mobile Money (2 % GMV 50 k USD/mois) | ~1 000 | ~12 000 (variable) |

**Budget fixe annuel Direction : ~5 000 – 10 000 USD**  
**+ frais transactionnels Mobile Money** (selon activité réelle)

---

### Scénario B — Croissance nationale (6–12 mois)

**Hypothèses :** 50 000 – 150 000 utilisateurs actifs, 3 000 – 8 000 courses/jour.

| Poste | USD/mois | USD/an |
|-------|----------|--------|
| Render renforcé (Standard gateway/ride) | 160 – 220 | 1 920 – 2 640 |
| Supabase Storage | 35 – 60 | 420 – 720 |
| Cartographie | 30 – 55 | 360 – 660 |
| SMS (avec PIN) | 300 – 900 | 3 600 – 10 800 |
| Divers | 30 – 80 | 360 – 960 |
| **Total fixe** | **~555 – 1 315** | **~6 660 – 15 780** |
| Mobile Money (2 % GMV 150 k USD/mois) | ~3 000 | ~36 000 (variable) |

---

## 6. Tableau de synthèse — demande d'abonnement

### Abonnements mensuels à souscrire (validation Direction)

| # | Service | Usage MOVA | Plan | USD/mois | Priorité |
|---|---------|------------|------|----------|----------|
| 1 | **Render** | API + BDD + Redis + web | Starter → Standard | **120 – 180** | P0 |
| 2 | **Supabase** | Photos KYC, colis, menu, véhicules | Pro | **30** | P0 |
| 3 | **Africa's Talking** | SMS OTP + Mobile Money | Pay-as-you-go | **200 – 500** | P0 |
| 4 | **Hetzner/OVH** | Serveur OSRM/Nominatim | VPS CPX21 | **15 – 30** | P1 |
| 5 | **Mapbox** | Autocomplétion adresses | Free/usage | **0 – 25** | P1 |
| 6 | **Firebase** | Push chauffeur/passager | Gratuit | **0** | P0 |
| 7 | **Domaine `.cd`** | `mova.cd` + sous-domaines | Annuel | **~5** (amorti) | P0 |

**Total abonnements mensuels à approuver : ~370 – 740 USD / mois**

### Paiements uniques à approuver

| # | Poste | USD |
|---|-------|-----|
| 1 | Google Play Developer | 25 |
| 2 | Apple Developer Program | 99 |
| 3 | Domaine `.cd` (1 an) | 40 – 80 |
| 4 | KYC Africa's Talking (si applicable) | 0 – 500 |

**Total initial : 165 – 705 USD**

---

## 7. Calendrier de mise en service

| Semaine | Action | Coût |
|---------|--------|------|
| S1 | Ouvrir comptes Render + Supabase + Africa's Talking | 0 – 500 USD |
| S1 | Acheter domaine `.cd`, configurer DNS | 40 – 80 USD |
| S2 | Déployer Blueprint Render (`render.yaml`) | ~120 USD/mois |
| S2 | Brancher Supabase Storage (photos) | ~30 USD/mois |
| S2 | `MOCK_OTP=false`, `MOCK_PAYMENTS=false` | — |
| S3 | Soumettre apps Play Store + App Store | 124 USD |
| S3 | Tests pilote Kinshasa + 2–3 provinces | Inclus infra |
| S4 | Lancement national progressif | Montée SMS/infra selon trafic |

---

## 8. Risques & réserves budgétaires

| Risque | Impact | Mitigation | Réserve conseillée |
|--------|--------|------------|-------------------|
| Pic SMS (sans adoption PIN) | +300 – 1 000 USD/mois | PIN local déjà intégré | 15 % budget SMS |
| Latence Render → RDC | UX dégradée | Standard plan + monitoring | +50 USD/mois |
| Stockage photos (KYC massif) | +10 – 30 USD/mois | Supabase alertes quota | 10 % budget storage |
| Rejet expéditeur SMS « MOVA » | Blocage OTP | Démarrer validation ARPTC tôt | — |
| GMV Mobile Money élevé | Frais % importants | Commission plateforme | Refacturation |

**Réserve opérationnelle recommandée : 15 – 20 % du budget fixe annuel (~1 000 – 2 000 USD).**

---

## 9. Décision sollicitée

La Direction est invitée à valider :

- [ ] **Budget initial** : 200 – 350 USD (stores, domaine, KYC)
- [ ] **Abonnements mensuels** : 370 – 740 USD / mois (phase lancement)
- [ ] **Stack technique** : Render (compute + BDD) + Supabase (storage)
- [ ] **Contrat unique** Africa's Talking (SMS + Mobile Money)
- [ ] **Réserve annuelle** : 1 000 – 2 000 USD

---

*Références techniques : `render.yaml`, `docs/PRODUCTION_DEPLOYMENT.md`, `docs/DIRECTION_SERVICES_EXTERNES_ET_COUTS.md`, `config/external-apis.env.example`*

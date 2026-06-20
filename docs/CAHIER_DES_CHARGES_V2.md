# Cahier des charges — MOVA v2 (SOS, ERRAND v2, Cash/SMS)

**Version :** 1.0 — Juin 2026  
**Statut :** Implémenté (branche `main`)  
**Marché :** Kinshasa, RDC — extension nationale

---

## Contexte

MOVA dispose déjà d’une super-app mobilité (courses, livraisons, ERRAND, location, covoiturage, wallet, KYC/OCR, traces GPS). Ce cahier définit trois ajouts différenciants pour le marché congolais.

---

## 1. MOVA Sécurité — SOS + partage de trajet

### Objectif

Renforcer la confiance passager avec une alerte urgence et un lien de suivi partageable sans compte MOVA.

### Périmètre fonctionnel

| ID | Exigence | Priorité |
|----|----------|----------|
| SOS-01 | Bouton SOS sur écran suivi course (passager) | P0 |
| SOS-02 | Création incident type `SOS` avec position GPS et `rideId` | P0 |
| SOS-03 | Notification in-app support + événement Redis `INCIDENT_CREATED` | P0 |
| SOS-04 | Admin litiges : badge SOS, coordonnées, lien course | P0 |
| SHARE-01 | `POST /rides/:id/share-link` → token + URL publique | P0 |
| SHARE-02 | `GET /public/trips/:token` — statut, carte anonymisée, dernier point GPS | P0 |
| SHARE-03 | Mobile : partage via lien tokenisé (presse-papiers) | P0 |

### Modèle de données (driver-service)

```
Incident + SOS enum
+ lat, lng, referenceType, referenceId, isEmergency
```

### Modèle de données (ride-service)

```
TripShareLink { rideId, token, expiresAt, createdBy }
```

### Critères d’acceptation

- Passager en course active peut déclencher SOS → incident `OPEN` visible admin.
- Lien partagé fonctionne sans JWT pendant 24 h.
- Aucune donnée PII (téléphone, nom) sur la page publique.

---

## 2. MOVA Courses — ERRAND v2

### Objectif

Structurer les « courses & commissions » (achats marché, pharmacie) avec budget, articles et suivi carte.

### Périmètre fonctionnel

| ID | Exigence | Priorité |
|----|----------|----------|
| ERR-01 | Champs `items` (JSON), `budgetCdf`, `finalPriceCdf`, `purchaseTotalCdf` | P0 |
| ERR-02 | Estimation inclut frais articles + respect plafond budget | P0 |
| ERR-03 | `completionPin` (4 chiffres) pour preuve livraison | P1 |
| ERR-04 | `proofPhotoUrl` optionnel (reçu marché) | P1 |
| ERR-05 | Notifications Redis sur acceptation et changement statut chauffeur | P0 |
| ERR-06 | Écran suivi passager : carte + trace GPS (comme colis) | P0 |
| ERR-07 | Admin : affichage budget, articles, total achats | P1 |

### Structure `items` JSON

```json
[
  { "label": "Riz 1kg", "qty": 2, "estimatedCdf": 3000 },
  { "label": "Huile", "qty": 1, "estimatedCdf": 5000 }
]
```

### Statuts (inchangés)

`PENDING` → `ASSIGNED` → `IN_PROGRESS` → `COMPLETED` | `CANCELLED`

### Critères d’acceptation

- Création mobile avec liste d’articles et budget max persistés en base.
- Passager voit polyline sur `errand_tracking_screen`.
- Chauffeur accepte → passager notifié in-app.

---

## 3. MOVA Cash + SMS

### Objectif

Supporter le paiement espèces dominant en RDC avec anti-fraude PIN et notifications SMS de statut.

### Périmètre fonctionnel

| ID | Exigence | Priorité |
|----|----------|----------|
| CASH-01 | `completionPin` sur course (généré à l’acceptation) | P0 |
| CASH-02 | Paiement CASH → statut `PENDING` jusqu’à confirmation chauffeur | P0 |
| CASH-03 | `POST /payments/rides/:id/cash/confirm` (JWT chauffeur + PIN) | P0 |
| CASH-04 | Passager voit le PIN à la fin de course (écran suivi / paiement) | P0 |
| SMS-01 | Service SMS notification-service (Twilio + `MOCK_SMS`) | P0 |
| SMS-02 | SMS statut course : acceptée, en route, terminée | P0 |
| SMS-03 | SMS confirmation paiement espèces | P1 |
| SMS-04 | `payService` publie `PAYMENT_COMPLETED` (ERRAND, livraisons) | P0 |

### Flux cash course

```
1. Course COMPLETED
2. Passager choisit CASH → Payment PENDING
3. Passager communique PIN au chauffeur (affiché app)
4. Chauffeur saisit PIN → Payment COMPLETED + crédit chauffeur
```

### Variables d’environnement

| Variable | Usage |
|----------|--------|
| `MOCK_SMS=true` | Log console, pas d’envoi Twilio |
| `MOCK_OTP` | Inchangé (OTP auth) |
| `TWILIO_*` | SMS transactionnels |

### Critères d’acceptation

- Paiement cash sans PIN chauffeur reste `PENDING`.
- SMS mock visible dans logs notification-service en dev.
- ERRAND payé en cash déclenche notification in-app passager.

---

## Matrice RBAC (inchangée)

| Fonction | SUPER_ADMIN | ADMIN | SUPPORT | FINANCE | CONTENT |
|----------|:-----------:|:-----:|:-------:|:-------:|:-------:|
| SOS / litiges | ✓ | ✓ | ✓ | — | — |
| ERRAND admin | ✓ | ✓ | ✓ | — | — |
| Cash / SMS logs | ✓ | ✓ | — | ✓ | — |

---

## Dépendances techniques

| Service | Rôle |
|---------|------|
| driver-service | Incidents SOS |
| ride-service | Share links, ERRAND v2, completionPin, events SMS trigger |
| payment-service | Cash PENDING + confirm PIN |
| notification-service | In-app + SMS |
| mobile | SOS, share, ERRAND map, cash PIN UI |
| admin | Litiges SOS, ERRAND budget |

---

## Tests (voir GUIDE_TEST_APPS.md § C4)

1. SOS : course active → SOS → admin litiges
2. Share : copier lien → ouvrir `/api/public/trips/:token`
3. ERRAND : articles + budget → carte suivi
4. Cash : payer CASH → chauffeur confirme PIN → COMPLETED
5. SMS : vérifier logs `MOCK_SMS` sur changement statut course

---

## Références

- [GUIDE_TEST_APPS.md](./GUIDE_TEST_APPS.md)
- [RBAC_TESTING.md](./RBAC_TESTING.md)
- [AI_INTEGRATION.md](./AI_INTEGRATION.md)
- [DONNEES_REELLES.md](./DONNEES_REELLES.md)

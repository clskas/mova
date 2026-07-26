# Audit métier SENGA — anomalies & plan de test

Document de référence pour tester l'ensemble du projet (juin 2026).  
Inspiré des pratiques Uber/Bolt (courses), Deliveroo (livraisons), AnyVan/Lugg (déménagement).

---

## Matrice paiement (passager)

| Service | API backend | App mobile passager | Quand payer | Statut |
|---------|-------------|---------------------|-------------|--------|
| Course taxi/moto | ✅ | ✅ | Après `COMPLETED` | OK |
| Colis / food / express | ✅ | ✅ | Après `DELIVERED` | OK |
| Course & commission (errand) | ✅ | ✅ | Après `COMPLETED` | ⚠️ montant = estimation seule |
| **Déménagement** | ✅ | ✅ (corrigé) | Après `COMPLETED` | Corrigé |
| Location véhicule | ✅ | ❌ | Trop tôt côté API | À faire |
| Covoiturage | ✅ | ❌ | Après trajet | À faire |
| Course planifiée | ❌ | ❌ | — | À faire |

**Méthodes :** portefeuille SENGA, Orange/M-Pesa/Airtel, espèces (+ PIN chauffeur pour courses).

---

## Matrice assignation chauffeur

| Contexte | Filtre véhicule | Statut |
|----------|-----------------|--------|
| Course on-demand (matching auto) | ✅ par `vehicleType` | OK |
| **Déménagement (admin)** | ✅ moto exclue (corrigé) | Corrigé |
| **Planifiée (admin)** | ✅ par `vehicleType` (corrigé) | Corrigé |
| Colis / food / express (auto) | ❌ moto + voiture sans filtre poids | À faire |
| Errand (admin + accept) | ❌ prix moto, tout véhicule | À faire |
| Location SENGA driver | ❌ KYC seulement | À faire |

---

## Anomalies critiques (P0) — corrigées récemment

- [x] Déménagement : paiement mobile branché (`PaymentScreen` type `MOVING`)
- [x] Déménagement : passager ne peut plus marquer `COMPLETED` via API
- [x] Déménagement : admin ne peut plus assigner un chauffeur moto-only
- [x] Déménagement : onglets séparés + adresses GPS réelles + volume/pièces cohérents
- [x] Planifiées : liste chauffeurs filtrée par type de course

---

## Anomalies corrigées (P1 + P2 — commit audit + P2)

### Paiement
- [x] Location, covoiturage, planifiées : écrans paiement mobile
- [x] Location : `paymentReady` uniquement à `RETURNED`
- [x] Errand : `purchaseTotalCdf` saisi chauffeur + total passager (service + achats)
- [x] Espèces : `confirmCashService()` sur livraisons, errands, moving, planifiées (app chauffeur)
- [x] Revenus chauffeur : crédit sur tout `payService()`

### Assignation & missions
- [x] Colis MEDIUM/LARGE : filtre véhicule (voiture/utilitaire/camion)
- [x] Admin livraisons : assignation colis/food + filtre poids
- [x] acceptRide / acceptDelivery : re-validation véhicule API
- [x] Types **UTILITAIRE / CAMION** (driver + ride DB, onboarding, admin)
- [x] Location SENGA driver : assign filtre engin cargo

### Sécurité / statuts
- [x] Errand / delivery / moving : passager annulation seule
- [x] `itemsNotes` déménagement persisté

---

## Plan de test global (checklist)

### Prérequis local
```powershell
docker compose up -d --build
npm run migrate:all
npm run seed:admin-demo
```
OTP : `123456` | Admin : `+243900000001` | Passagers : `+243900000010`–`019` | Chauffeurs KYC OK : `023`,`024`,`025`,`027`,`029`

### 1. Courses (référence — doit être OK)
- [ ] Estimation moto vs standard (prix différent)
- [ ] Chauffeur moto ne voit pas offre VIP
- [ ] Paiement wallet / espèces après course
- [ ] Revenus chauffeur crédités

### 2. Déménagement
- [ ] Onglet « Mes demandes » séparé
- [ ] Estimation affiche distance km
- [ ] Admin assigne chauffeur **voiture** (pas moto-only)
- [ ] Admin marque `COMPLETED` → passager redirigé vers **paiement**
- [ ] Chauffeur voit mission dans app chauffeur

### 3. Livraisons
- [ ] Colis : création → accept chauffeur → livraison → paiement
- [ ] Food : restaurant → ready → courier → paiement
- [ ] Tester colis LARGE : moto refusée, voiture acceptée

### 4. Errands
- [ ] Création → assign/accept → chauffeur saisit montant achats → complete → paiement total
- [ ] Vérifier montant facturé vs achats réels

### 5. Planifiées
- [ ] Admin : liste chauffeurs filtrée si course VIP/COMFORT
- [ ] Chauffeur mission planifiée dans app

### 6. Location & covoiturage
- [ ] Réservation location (pas de paiement mobile — anomalie connue)
- [ ] Covoiturage join + fin trajet (pas de paiement mobile — anomalie connue)

### 7. Admin
- [ ] KYC chauffeur : moto vs voiture
- [ ] Déménagements / planifiées / livraisons : assignation cohérente
- [ ] Métriques dashboard vs paiements réels

### 8. Production Render (optionnel)
- [ ] `/health` gateway après cold start (attendre 1–2 min)
- [ ] APK release → `mova-gateway.onrender.com`

---

## Formule prix déménagement (référence)

```
Prix ≈ (tarif course × distance × 1,5) + 15 000 CDF + (volume m³ × 8 000 CDF) × coef camion
```

Coef camion : camionnette 0,85 | 15 m³ 1,0 | 30 m³ 1,45 | 50 m³ 1,9

---

## Prochaines évolutions recommandées

1. Chauffeur seed démo **+243900000023** : type **UTILITAIRE** (déménagement / logistique)
2. Migration BDD : `npm run migrate:all` après pull (enum `UTILITAIRE`, `CAMION`)
3. Tests production Render (cold start gateway)

Voir aussi : [GUIDE_TEST_APPS.md](./GUIDE_TEST_APPS.md)

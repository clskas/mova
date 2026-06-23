# Audit métier MOVA — anomalies & plan de test

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

**Méthodes :** portefeuille MOVA, Orange/M-Pesa/Airtel, espèces (+ PIN chauffeur pour courses).

---

## Matrice assignation chauffeur

| Contexte | Filtre véhicule | Statut |
|----------|-----------------|--------|
| Course on-demand (matching auto) | ✅ par `vehicleType` | OK |
| **Déménagement (admin)** | ✅ moto exclue (corrigé) | Corrigé |
| **Planifiée (admin)** | ✅ par `vehicleType` (corrigé) | Corrigé |
| Colis / food / express (auto) | ❌ moto + voiture sans filtre poids | À faire |
| Errand (admin + accept) | ❌ prix moto, tout véhicule | À faire |
| Location MOVA driver | ❌ KYC seulement | À faire |

---

## Anomalies critiques (P0) — corrigées récemment

- [x] Déménagement : paiement mobile branché (`PaymentScreen` type `MOVING`)
- [x] Déménagement : passager ne peut plus marquer `COMPLETED` via API
- [x] Déménagement : admin ne peut plus assigner un chauffeur moto-only
- [x] Déménagement : onglets séparés + adresses GPS réelles + volume/pièces cohérents
- [x] Planifiées : liste chauffeurs filtrée par type de course

---

## Anomalies restantes (P1 — à vérifier en test)

### Paiement
1. **Location** — pas d'écran paiement mobile ; `paymentReady` avant fin de location
2. **Covoiturage** — pas de paiement in-app après `completeTrip`
3. **Planifiée** — type `SCHEDULED` absent du service paiement
4. **Errand** — montant ne inclut pas achats réels (`purchaseTotalCdf`)
5. **Espèces livraisons/errands/moving** — pas de confirmation PIN chauffeur (courses seulement)
6. **Revenus chauffeur** — crédit immédiat : courses uniquement ; autres services via sync batch

### Assignation & missions
7. **Colis LARGE** — moto peut accepter (devrait exiger voiture)
8. **Admin livraisons** — assignation colis/food route vers errand (bug API interne)
9. **acceptRide / acceptDelivery** — pas de re-validation véhicule côté API
10. **Flotte déménagement** — pas de type camion dans driver-service (STANDARD utilisé comme proxy)

### Sécurité / statuts
11. **Errand** — passager peut self-compléter via `PATCH status`
12. **Delivery** — passager peut passer `PENDING → PICKED_UP`
13. **Inventaire déménagement** — `itemsNotes` envoyé par mobile mais non persisté en BDD

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
- [ ] Tester colis LARGE avec chauffeur moto (anomalie attendue si non corrigé)

### 4. Errands
- [ ] Création → assign/accept → complete → paiement
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

1. Types véhicules **CAMION / UTILITAIRE** dans driver-service
2. Paiement mobile location + covoiturage + planifiées
3. `confirmCashService()` unifié pour tous les services
4. Crédit chauffeur automatique sur tout `payService()`
5. Filtre poids colis → type véhicule minimum

Voir aussi : [GUIDE_TEST_APPS.md](./GUIDE_TEST_APPS.md)

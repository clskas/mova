# SENGA Driver

## Connexion

1. Ouvrez l'app **SENGA Driver** (flavor `driver`).
2. **Écran d'accueil animé** (**4 s par service**, ~32 s au total) : courses, livraisons, missions, revenus, KYC, etc. Touchez l'écran pour accéder directement à l'OTP.
3. Saisissez un numéro **+243** valide (démo : `+243900000020`).
4. Recevez le code OTP (en dev : **`123456`** si `MOCK_OTP=true`).
5. Si le message **« Compte suspendu »** s'affiche, demandez à l'admin de réactiver le compte dans **Utilisateurs → statut ACTIVE**.

La **ville SENGA** sur l'accueil est détectée via GPS à l'ouverture (modifiable).

## Mise en route

1. Complétez votre **KYC** (permis, carte rose, photo). Les pièces sont **optionnelles** tant que l’admin n’a pas activé « exiger des documents pour les jobs ».
2. Attendez l’**approbation KYC** par l’équipe SENGA.
3. Vous recevez un **PIN d’activation à 6 chiffres** (SMS / e-mail). À la première connexion app, saisissez ce PIN — il n’est **pas** lié au dépôt des pièces.
4. Si votre véhicule est **VIP** ou **Confort**, l’admin doit aussi **valider le type d’engin** avant que vous puissiez travailler.
5. Activez **En ligne** depuis l’écran principal.
6. Acceptez ou refusez courses, livraisons colis/repas et réservations planifiées.
7. Utilisez la **navigation** vers le passager ou le point de livraison.
8. Consultez **Revenus** et demandez un retrait (minimum **2 300 FC** — solde retirable uniquement).

## Wallet virtuel et paiements espèces

- **Solde retirable** = portefeuille SENGA (crédits Mobile Money / wallet passager après commission) **moins** les fonds bloqués. C’est **uniquement** ce montant que vous pouvez retirer.
- Les courses / livraisons payées en **espèces** : vous gardez l’argent en main. Ces gains s’affichent comme **gains espèces (non retirables)** et **ne** s’ajoutent **pas** au solde retirable.
- Les commissions sur courses **espèces** créent une **dette** plateforme (pas un débit forcé du wallet).
- Si la dette dépasse le seuil, ou si un solde positif est exigé, les **offres sont bloquées** jusqu’à recharge ou règlement au guichet.
- Après une **livraison COD**, le client paie en espèces à la remise ; vous confirmez **Cash reçu** dans l’app (sans code PIN).

## Position GPS pendant les missions

Pendant une course ou une livraison active, l'application envoie automatiquement votre position :

- **Courses** : via WebSocket et sauvegarde de secours REST
- **Livraisons / ERRAND** : envoi régulier (~12 s) + WebSocket

Ces points permettent au **passager** de vous suivre et à l'**équipe SENGA** de consulter la trace sur la console admin.

Gardez le **GPS activé** et l'application au premier plan pendant la mission.

## Types de missions

| Type | Description |
|------|-------------|
| Course immédiate | Taxi / moto-taxi depuis une demande passager |
| Course Pool | Course partagée à la demande — plusieurs passagers, arrêts successifs |
| Colis & express | Enlèvement et livraison avec suivi statut |
| Repas | Récupération restaurant → livraison client |
| Planifiée | Trajet confirmé à l'avance (J+7 max) — rappels, auto-assignation, course GPS au démarrage |
| Courses & commissions | Achats pour le compte du passager — **photo preuve** obligatoire avant clôture |
| Covoiturage | Publier un trajet partagé planifié (KYC approuvé) depuis **Publier un covoiturage** |
| Déménagement | Mission assignée — mise à jour des statuts depuis l'app |

## Blocages fréquents

| Message / comportement | Cause | Action |
|------------------------|-------|--------|
| KYC en attente | Dossier non approuvé | Compléter documents ; contacter support |
| Type d'engin en attente | Véhicule VIP/Confort non validé | Attendre validation admin |
| Compte suspendu | Statut utilisateur | Admin → Utilisateurs → ACTIVE |
| Pas d'offres | Hors ligne, indisponible, **dette cash** / wallet bloqué, ou documents exigés manquants | En ligne ; régler dette ; compléter docs si règle activée |

## Courses & commissions (ERRAND)

1. Une **alerte** vous signale les nouvelles demandes à proximité.
2. Acceptez la mission depuis **Livraisons / offres**.
3. Communiquez avec le passager via le **chat** si un article est indisponible.
4. Avant de marquer la course **terminée**, prenez une **photo preuve d'achat** (ticket ou reçu).
5. Saisissez le **montant total des achats** en CDF à la clôture.

## Réservation planifiée

1. Les missions à venir apparaissent dans **Missions assignées** ou via les offres planifiées.
2. Vous pouvez vous porter **volontaire** sur un créneau non encore assigné (**Me porter volontaire**).
3. Vous recevrez des rappels la veille et une heure avant le départ.
4. Au **démarrage**, une course GPS est ouverte pour le suivi en direct (comme une course taxi classique).

## Course Pool (partagée)

1. Une offre **Course Pool** arrive comme une course taxi ; le titre indique Pool.
2. Utilisez **Navigation prochain arrêt** pour le prochain point de prise ou de dépose.
3. Pour chaque passager : **Prendre ce passager** puis **Déposer ce passager** (ne pas « terminer » la course globalement tant qu’il reste des passagers).
4. Chaque passager paie **sa place** ; les gains prepaid vont au **solde retirable**, les espèces restent **non retirables**.

> Distinct du **Covoiturage** (trajet planifié publié à l’avance).

## Covoiturage (conducteur)

1. Depuis l'accueil, appuyez sur **Publier un covoiturage**.
2. Renseignez date/heure, villes, places (1–6), prix par place, point de rendez-vous et notes.
3. Publiez le trajet — les passagers le réservent depuis l'app Passager.
4. Gérez le trajet dans **Mes trajets** (démarrer, terminer, annuler).

## Support

WhatsApp +243 900 000 000 — support@mova.cd

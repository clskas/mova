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
4. À l'étape **Véhicule**, renseignez :
   - le **type** (Moto-taxi, Standard, Confort, VIP, **Familiale 6 à 8 places**, Utilitaire, Camion, **Tricycle passagers**, **Tripoteur marchandises**), la plaque, la marque et le modèle ;
     - **Tricycle passagers** (« kéké ») : 1 à 3 places, courses de la gamme Tricycle et petits colis ;
     - **Tripoteur marchandises** : colis, courses & commissions et petits déménagements (camionnette), avec un volume utile de 1 à 4 m³ ;
   - jusqu'à **5 photos de l'engin** (avant, arrière, côté, intérieur…). La première est la **photo principale** : menu ⋮ sur une photo → *Mettre en premier* ou *Retirer* ;
   - le nombre de **places passagers** (sans compter le chauffeur) : vous ne recevez pas les groupes plus grands que vos places ;
   - pour un **utilitaire** (1 à 25 m³), un **camion** (5 à 100 m³) ou un **tripoteur** (1 à 4 m³), le **volume utile** de chargement : vous ne recevez que les déménagements qui y tiennent.
   L’admin doit **valider le type d’engin** (photos à l'appui) avant que vous puissiez travailler.
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
- **Cash reçu** : confirmez dès que vous avez encaissé. Sans action de votre part, un paiement espèces **sous 150 000 FC** peut être **clôturé automatiquement après 24 h** (considéré payé).
- **Cash non reçu** : utilisez ce bouton si le client n’a pas remis l’argent. Cela ouvre un **litige**, bloque le passager pour de nouvelles courses, et **annule** l’auto-clôture.
- Si le passager a déclaré **« J’ai payé en espèces »** (écran de suivi, reçu, ou fenêtre de litige), vérifiez et confirmez **J’ai reçu les espèces** ou maintenez le litige.

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
| Déménagement | Utilitaire ou camion uniquement — proposé automatiquement si votre volume suffit, ou assigné par SENGA |

## Déménagements (utilitaire et camion)

1. Quand un client demande un déménagement dans votre ville, vous recevez une notification **« Nouveau déménagement »** si votre véhicule convient :
   - camionnette : **utilitaire, camion ou tripoteur** ;
   - camion 15 m³ : **utilitaire ou camion** ;
   - camion 30 ou 50 m³ : **camion** ;
   - et votre **volume utile** déclaré doit être au moins égal au volume du déménagement.
2. Sur l'accueil, la carte **« Déménagements proposés »** montre le trajet, le volume, les objets et votre **gain net**.
3. Appuyez sur **Accepter** : le **premier chauffeur** qui accepte obtient la mission. Si un autre a été plus rapide, l'app vous l'indique.
4. Ouvrez la mission, appuyez sur **Démarrer** sur place (le client ne peut plus annuler), puis **Terminer** à l'arrivée.
5. SENGA peut aussi vous **assigner** un déménagement directement depuis l'administration.

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

## Mes missions (historique)

Menu ⋮ → **Historique missions** : toutes vos missions — courses taxi, livraisons colis / repas / express, courses & commissions, déménagements, courses planifiées, location (logistique) et covoiturage.

- Filtres **Aujourd'hui**, **7 jours**, **Ce mois**, **Tout** avec le nombre de missions terminées et votre **gain net** sur la période.
- Date et heure locales sur chaque ligne ; **Charger plus** pour les plus anciennes.
- Touchez une mission : départ, arrivée, montant, **commission SENGA** et **gain net**. Pour une course payée en espèces pas encore confirmée : **Confirmer le paiement espèces**.

## SOS et contacts d'urgence

- Le bouton **SOS** (accueil et missions en cours) : **toucher** = confirmation, **maintenir 3 secondes** = envoi immédiat.
- L'app montre si un agent a **pris en charge** l'alerte et partage votre position pendant 30 minutes. Sans Internet, elle propose un **SMS** à la permanence SENGA ou un **appel** aux secours.
- Profil → **Contacts d'urgence** : jusqu'à 3 proches prévenus par SMS lors d'un SOS.

## Support

- **Assistant SENGA (IA)** : dans **Aide**, posez votre question (en ligne, dossier, PIN, revenus…) dans votre langue et recevez une réponse immédiate tirée de ce manuel. Pour un litige, un paiement ou une urgence, contactez le support humain.

WhatsApp +243 971163574 — dev@afri-soft.com

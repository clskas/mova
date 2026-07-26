# SENGA Driver

## Connexion

1. Ouvrez l'app **SENGA Driver** (flavor `driver`).
2. **Écran d'accueil animé** (**4 s par service**, ~32 s au total) : courses, livraisons, missions, revenus, KYC, etc. Touchez l'écran pour accéder directement à l'OTP.
3. Saisissez un numéro **+243** valide (démo : `+243900000020`).
4. Recevez le code OTP (en dev : **`123456`** si `MOCK_OTP=true`).
5. Si le message **« Compte suspendu »** s'affiche, demandez à l'admin de réactiver le compte dans **Utilisateurs → statut ACTIVE**.

La **ville SENGA** sur l'accueil est détectée via GPS à l'ouverture (modifiable).

## Mise en route

1. Complétez votre **KYC** (permis, carte grise, photo). L'admin peut voir des informations extraites par OCR après upload.
2. Attendez l'**approbation KYC** par l'équipe SENGA.
3. Si votre véhicule est **VIP** ou **Confort**, l'admin doit aussi **valider le type d'engin** avant que vous puissiez travailler.
4. Activez **En ligne** depuis l'écran principal.
5. Acceptez ou refusez courses, livraisons colis/repas et réservations planifiées.
6. Utilisez la **navigation** vers le passager ou le point de livraison.
7. Consultez **Revenus** et demandez un retrait (minimum 500 FC).

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
| Colis & express | Enlèvement et livraison avec suivi statut |
| Repas | Récupération restaurant → livraison client |
| Planifiée | Trajet confirmé à l'avance (J+7 max) — rappels, auto-assignation, course GPS au démarrage |
| Courses & commissions | Achats pour le compte du passager — **photo preuve** obligatoire avant clôture |
| Covoiturage | Publier un trajet partagé (KYC approuvé) depuis **Publier un covoiturage** |
| Déménagement | Mission assignée — mise à jour des statuts depuis l'app |

## Blocages fréquents

| Message / comportement | Cause | Action |
|------------------------|-------|--------|
| KYC en attente | Dossier non approuvé | Compléter documents ; contacter support |
| Type d'engin en attente | Véhicule VIP/Confort non validé | Attendre validation admin |
| Compte suspendu | Statut utilisateur | Admin → Utilisateurs → ACTIVE |
| Pas d'offres | Hors ligne ou indisponible | Activer **En ligne** |

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

## Covoiturage (conducteur)

1. Depuis l'accueil, appuyez sur **Publier un covoiturage**.
2. Renseignez date/heure, villes, places (1–6), prix par place, point de rendez-vous et notes.
3. Publiez le trajet — les passagers le réservent depuis l'app Passager.
4. Gérez le trajet dans **Mes trajets** (démarrer, terminer, annuler).

## Support

WhatsApp +243 900 000 000 — support@mova.cd

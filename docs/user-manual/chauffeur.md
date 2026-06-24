# MOVA Chauffeur

## Connexion

1. Ouvrez l'app **MOVA Chauffeur** (flavor `driver`).
2. **Écran d'accueil animé** (**4 s par service**, ~32 s au total) : courses, livraisons, missions, revenus, KYC, etc. Appuyez sur **Passer** ou touchez l'écran pour accéder directement à l'OTP.
3. Saisissez un numéro **+243** valide (démo : `+243900000020`).
4. Recevez le code OTP (en dev : **`123456`** si `MOCK_OTP=true`).
5. Si le message **« Compte suspendu »** s'affiche, demandez à l'admin de réactiver le compte dans **Utilisateurs → statut ACTIVE**.

La **ville MOVA** sur l'accueil est détectée via GPS à l'ouverture (modifiable).

## Mise en route

1. Complétez votre **KYC** (permis, carte grise, photo). L'admin peut voir des informations extraites par OCR après upload.
2. Attendez l'**approbation KYC** par l'équipe MOVA.
3. Si votre véhicule est **VIP** ou **Confort**, l'admin doit aussi **valider le type d'engin** avant que vous puissiez travailler.
4. Activez **En ligne** depuis l'écran principal.
5. Acceptez ou refusez courses, livraisons colis/repas et réservations planifiées.
6. Utilisez la **navigation** vers le passager ou le point de livraison.
7. Consultez **Revenus** et demandez un retrait (minimum 500 FC).

## Position GPS pendant les missions

Pendant une course ou une livraison active, l'application envoie automatiquement votre position :

- **Courses** : via WebSocket et sauvegarde de secours REST
- **Livraisons / ERRAND** : envoi régulier (~12 s) + WebSocket

Ces points permettent au **passager** de vous suivre et à l'**équipe MOVA** de consulter la trace sur la console admin.

Gardez le **GPS activé** et l'application au premier plan pendant la mission.

## Types de missions

| Type | Description |
|------|-------------|
| Course immédiate | Taxi / moto-taxi depuis une demande passager |
| Colis & express | Enlèvement et livraison avec suivi statut |
| Repas | Récupération restaurant → livraison client |
| Planifiée | Trajet confirmé à l'avance (J+7 max) |
| Courses & commissions | Achats pour le compte du passager (ERRAND) |
| Covoiturage | Publier un trajet partagé (KYC approuvé) depuis **Publier un covoiturage** |
| Déménagement | Mission assignée — mise à jour des statuts depuis l'app |

## Blocages fréquents

| Message / comportement | Cause | Action |
|------------------------|-------|--------|
| KYC en attente | Dossier non approuvé | Compléter documents ; contacter support |
| Type d'engin en attente | Véhicule VIP/Confort non validé | Attendre validation admin |
| Compte suspendu | Statut utilisateur | Admin → Utilisateurs → ACTIVE |
| Pas d'offres | Hors ligne ou indisponible | Activer **En ligne** |

## Covoiturage (conducteur)

1. Depuis l'accueil, appuyez sur **Publier un covoiturage**.
2. Renseignez date/heure, villes, places (1–6), prix par place, point de rendez-vous et notes.
3. Publiez le trajet — les passagers le réservent depuis l'app Passager.
4. Gérez le trajet dans **Mes trajets** (démarrer, terminer, annuler).

## Support

WhatsApp +243 900 000 000 — support@mova.cd

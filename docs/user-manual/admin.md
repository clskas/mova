# SENGA Admin (équipe interne)

Console web sur http://localhost:3002 en développement.

## Connexion

1. Saisissez votre numéro staff au format **+243**.
2. Entrez le code OTP reçu par SMS (en dev : **`123456`**).
3. Le badge en haut à droite indique votre rôle (Super admin, Support, Finance…).

Seuls les comptes avec un rôle staff (SUPER_ADMIN, ADMIN, SUPPORT, FINANCE, CONTENT) peuvent accéder à la console. Les passagers et chauffeurs utilisent les applications mobiles.

## Niveaux d'accès par rôle

La console adapte le **menu latéral** et les **boutons d'action** selon votre rôle.

| Rôle | Profil type | Sections visibles | Peut modifier |
|------|-------------|-----------------|---------------|
| **SUPER_ADMIN** | Direction technique | Toutes | Toutes |
| **ADMIN** | Responsable opérations | Toutes | Toutes |
| **SUPPORT** | Agent support / KYC | Utilisateurs, Chauffeurs, KYC, Courses, Livraisons, Litiges, Planifiées, Locations, Déménagements, Covoiturage | KYC, litiges, statuts opérationnels (livraisons, planifiées, locations…) |
| **FINANCE** | Comptabilité | Tableau de bord, Portefeuille, Tarifs, Abonnements | Tarifs, abonnements, portefeuille |
| **CONTENT** | Contenu & partenaires | Restaurants, Tarifs, Communes, Locations, Catalogue location | Restaurants, communes, catalogue location, tarifs |

### Lecture seule

Sur certaines pages, votre rôle permet de **consulter** mais pas d'**enregistrer** (ex. SUPPORT sur Utilisateurs). Un message *« Accès lecture seule pour votre rôle »* s'affiche et le bouton **Enregistrer** est masqué.

### Redirection automatique

Si vous ouvrez une URL non autorisée (ex. FINANCE sur `/courses`), vous êtes redirigé vers la première page accessible pour votre rôle.

Source technique : `admin/src/lib/rbac.ts`.

## Modules

| Module | Usage |
|--------|-------|
| **Métriques** | Utilisateurs, chauffeurs, courses, revenus, litiges |
| **Utilisateurs** | Comptes de connexion (rôle Passager, Chauffeur, Restaurant, Location, staff). Les robots Test Lab sont masqués. |
| **Chauffeurs** | Profils véhicule / KYC uniquement. Un chauffeur réel a aussi le rôle Chauffeur dans Utilisateurs. Les profils sans compte (fantômes) sont masqués. |
| **KYC** | Approbation dossiers chauffeur / resto / location. Après validation partenaire : PIN affiché + renvoyer SMS/e-mail. |
| **Restaurants** | Partenaires SENGA Business (type : restaurant, supermarché, pharmacie, boutique) |
| **Courses** | Trajets en cours ; **trace GPS** dans le détail |
| **Livraisons** | Colis, repas, courses & commissions (ERRAND) ; trace GPS ; assignation chauffeur |
| **Planifiées** | Réservations à venir |
| **Locations** | Demandes de location véhicule |
| **Catalogue location** | Véhicules proposés à la location (photos, tarifs journaliers) |
| **Déménagements** | Demandes passagers — statut et annulation |
| **Covoiturage** | Trajets publiés — statut et annulation |
| **Litiges** | Gestion des incidents |
| **Tarifs** | Grilles, majorations, commissions plateforme, codes promo |
| **Abonnements** | Offres abonnement passagers |
| **Portefeuille** | Soldes et opérations wallet |
| **Communes** | Zones de service par ville |

## Suivi GPS (traces de route)

Pour les courses et livraisons **en cours** ou **terminées** :

1. Ouvrez **Courses** ou **Livraisons**.
2. Cliquez **Détail** sur une ligne.
3. La section **Trace GPS** affiche une carte avec :
   - **D** : point de départ (premier enregistrement)
   - **A** : dernière position connue
   - **Ligne** : trajet parcouru par le chauffeur ou coursier

La carte se rafraîchit automatiquement toutes les 10 secondes tant que la mission est active.

**Qui y a accès :** rôles avec les sections Courses / Livraisons (SUPER_ADMIN, ADMIN, SUPPORT).

## Chauffeurs — KYC et type d'engin

### Validation KYC

1. **KYC** ou **Chauffeurs → Détail** → **Approuver KYC**.
2. Un **PIN d’activation à 6 chiffres** s’affiche (et part en SMS / e-mail). Le chauffeur le saisit à la **première connexion** app. Ce PIN n’est **pas** lié au dépôt des pièces (les docs restent optionnels tant que la règle ci-dessous est inactive).
3. Pour un **restaurant** ou **loueur**, le même écran affiche le PIN de connexion et permet de le renvoyer si le SMS échoue.
4. Le chauffeur peut alors passer **En ligne** (sous réserve du type d’engin).

Des champs OCR (nom, numéro permis…) peuvent apparaître si le service d’analyse de documents est activé.

### Exiger des documents pour les jobs

Dans **Règles plateforme** (SUPER_ADMIN, ADMIN, **CITY_ADMIN** — section documents uniquement pour l’admin ville) :

- Option **« Exiger des documents valides pour recevoir les notifications »** (`requireDocumentsForJobs`).
- Inactive par défaut : le PIN est émis à l’approbation KYC même sans pièces.
- Active : le chauffeur doit avoir des justificatifs non expirés pour recevoir des offres (éligibilité jobs).

### Wallet chauffeur et cash

- **Retrait** = uniquement le **solde retirable** (wallet − holds). Les montants encaissés **cash** chez le client **ne** sont **pas** retirables via l’app.
- Commission sur course **espèces** → **dette** plateforme (le wallet peut rester à 0).
- Dette au-delà du seuil / règle solde positif → offres bloquées jusqu’à recharge ou règlement guichet.
- Les courses **Pool** apparaissent dans **Courses** (badge / type partagé) ; le covoiturage planifié reste dans **Covoiturage**.

### Validation du type d'engin

Pour les véhicules **VIP**, **Confort** ou autres catégories réglementées :

1. **Chauffeurs → Détail** → section véhicule.
2. **Approuver** ou **Rejeter** le type d'engin.
3. Tant que le type n'est pas **APPROVED**, le chauffeur ne peut pas recevoir de missions (`canOperate` bloqué).

## Opérations (lecture + mise à jour)

Les modules **Locations**, **Déménagements**, **Covoiturage** et **Livraisons** affichent des demandes créées par les apps mobiles. L'admin peut :

- **Consulter** la liste et ouvrir le **Détail**
- **Modifier le statut** (ex. PENDING → ASSIGNED → COMPLETED)
- **Assigner un chauffeur** (livraisons ERRAND)
- **Annuler** une demande en cours

Il n'est pas nécessaire de **créer** ces enregistrements depuis l'admin : ils proviennent des passagers/chauffeurs.

## Comptes suspendus

Si un chauffeur ou passager ne peut plus se connecter (« Compte suspendu »), allez dans **Utilisateurs** → modifier le statut **ACTIVE**.

## Comptes de démonstration (développement)

| Téléphone | Rôle |
|-----------|------|
| `+243900000001` | SUPER_ADMIN |
| `+243900000002` | ADMIN |
| `+243900000003` | SUPPORT |
| `+243900000004` | FINANCE |
| `+243900000005` | CONTENT |

Voir [RBAC_TESTING.md](../RBAC_TESTING.md) pour les scénarios de test par rôle.

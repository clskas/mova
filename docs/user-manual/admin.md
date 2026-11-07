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
| **Analyses IA** | Résumé du jour (actualisé chaque heure) et questions en langage courant sur les chiffres agrégés (lecture seule ; ni téléphones, ni adresses envoyés à l'IA). Le responsable de ville ne voit que sa ville. |
| **Utilisateurs** | Comptes de connexion (rôle Passager, Chauffeur, Restaurant, Location, staff). Les robots Test Lab sont masqués. |
| **Chauffeurs** | Profils véhicule / KYC uniquement. Un chauffeur réel a aussi le rôle Chauffeur dans Utilisateurs. Les profils sans compte (fantômes) sont masqués. |
| **KYC** | Approbation dossiers chauffeur / resto / location. Le **SUPER_ADMIN** et l'**ADMIN** filtrent par ville. Après validation partenaire : PIN affiché + renvoyer SMS/e-mail. |
| **Restaurants** | Partenaires SENGA Business (type : restaurant, supermarché, pharmacie, boutique) |
| **Courses** | Trajets en cours ; **trace GPS** dans le détail |
| **Livraisons** | Colis, repas, courses & commissions (ERRAND) ; trace GPS ; assignation chauffeur ; pour les courses, bloc **Ticket d'achat** avec la lecture IA du ticket (Conforme / À vérifier / Écart, indicatif) |
| **Planifiées** | Réservations à venir |
| **Locations** | Demandes de location véhicule |
| **Catalogue location** | Véhicules proposés à la location (jusqu'à 5 photos, tarifs journaliers, texte d'annonce du loueur) |
| **Déménagements** | Demandes passagers — proposées automatiquement aux chauffeurs utilitaire/camion éligibles ; assignation manuelle, statut et annulation |
| **Covoiturage** | Trajets publiés — statut et annulation |
| **Litiges** | Gestion des incidents ; **Brouillon de réponse (IA)** à relire puis copier (rien n'est envoyé automatiquement) |
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

**Contrôle anti-falsification (IA)** : chaque document envoyé (pièce d'identité, permis, carte grise, assurance, contrôle technique, vignette) est examiné par l'IA. Sous le document, l'admin voit **Aucun signe vu**, **À vérifier de près** ou **Falsification possible**, avec les signes repérés (texte collé, polices différentes, photo d'écran, photocopie…). La fiche signale aussi un **numéro de pièce ou de permis déjà déclaré par un autre chauffeur**. Ce sont des indications : l'IA ne peut pas prouver qu'un document est authentique. En cas de doute, demandez l'original ou un appel vidéo avant de valider.

**Vérification d'identité Smile ID** : dans la fiche chauffeur, le bouton **Créer le lien de vérification** prépare un lien Smile ID. Envoyez-le au chauffeur (**Copier le lien** ou **Envoyer par WhatsApp**). Le chauffeur l'ouvre sur son téléphone, photographie sa carte d'électeur, son passeport ou son permis, puis prend un selfie en direct. Smile ID contrôle l'authenticité du document et compare le visage du selfie à la photo de la pièce. Le résultat s'affiche dans la fiche : **Identité vérifiée**, **À vérifier de près** ou **Refusé par Smile ID**, avec le nom et le numéro lus sur le document et un reçu PDF. Le badge **Test (Sandbox)** signifie que le compte Smile ID est encore en mode test : les résultats ne sont pas réels.

### Exiger des documents pour les jobs

Dans **Règles plateforme** (SUPER_ADMIN, ADMIN, **CITY_ADMIN** — section documents uniquement pour l’admin ville) :

- Option **« Exiger des documents valides pour recevoir les notifications »** (`requireDocumentsForJobs`).
- Inactive par défaut : le PIN est émis à l’approbation KYC même sans pièces.
- Active : le chauffeur doit avoir des justificatifs non expirés pour recevoir des offres (éligibilité jobs).

### Wallet chauffeur et cash

- **Retrait** = uniquement le **solde retirable** (wallet − holds). Les montants encaissés **cash** chez le client **ne** sont **pas** retirables via l’app.
- Commission sur course **espèces** → **dette** plateforme (le wallet peut rester à 0).
- Dette au-delà du seuil / règle solde positif → offres bloquées jusqu’à recharge ou règlement guichet.
- **Timeout cash** : le passager n’est plus bloqué tant que le paiement espèces est PENDING sans litige. Après le délai configuré sans signal « Cash non reçu » (montant sous le plafond), le paiement est auto-confirmé (`autoConfirmedAt`). Un litige chauffeur (`cashDisputedAt`) rebloque le passager et lui envoie une **notification push**.
- Paramétrage : **Règles plateforme → Paiements espèces (timeout)** — activer/désactiver, délai (heures), plafond FC.
- **Litiges** : filtres par type (SOS, espèces non reçues, fraude, accident, harcèlement) et par statut. Sur un SOS ou un incident ouvert : **Je prends en charge** (l'utilisateur est prévenu dans l'app), **notes** de suivi (appel passé, police prévenue…), puis **Résoudre**. Un SOS non pris en charge en **2 minutes** déclenche une **relance** de l'équipe. Pour un SOS, **Voir le trajet** ouvre les positions envoyées pendant 30 minutes.
- **Langues des apps** (SuperAdmin uniquement) : afficher ou masquer chaque bouton de langue (English, Kiswahili, Lingala) ou toute la carte « Langue » dans SENGA et SENGA Driver. Le swahili et le lingala sont traduits automatiquement par l'IA sur le serveur (une seule fois, puis gardés en mémoire) ; une langue masquée n'est plus traduite.
- **Alertes SOS → SMS des alertes** (SuperAdmin uniquement) : activer / couper les SMS — à l'équipe pour chaque SOS, de relance, aux contacts d'urgence de l'utilisateur, à l'équipe pour les incidents non urgents (coupé par défaut) — et le **numéro de permanence** à qui l'app propose d'envoyer un SMS quand Internet ne passe pas. Les notifications dans l'app et l'admin restent toujours envoyées.
- **Litiges (détail)** : Chaque fiche affiche l’identifiant de la personne qui signale et, pour un litige espèces, l’identifiant du chauffeur ou du livreur. Un signal « Cash non reçu » crée un litige **espèces non reçues**, distinct d’une alerte SOS.
- Les courses **Pool** apparaissent dans **Courses** (badge / type partagé) ; le covoiturage planifié reste dans **Covoiturage**.

### Validation du type d'engin

Pour les véhicules **VIP**, **Confort** ou autres catégories réglementées :

1. **Chauffeurs → Détail** → section véhicule.
2. **Approuver** ou **Rejeter** le type d'engin. Le **SUPER_ADMIN**, l'**ADMIN** et l'**admin ville** peuvent aussi corriger la catégorie (Moto-taxi, Standard, Confort, VIP) avant de valider. L'admin ville ne le fait que pour un chauffeur de sa ville.
3. Tant que le type n'est pas **APPROVED**, le chauffeur ne peut pas recevoir de missions (`canOperate` bloqué).
4. La fiche montre **toutes les photos de l'engin** (jusqu'à 5) : vérifiez qu'elles correspondent à la catégorie et au volume déclarés.
5. **Places passagers** : corrigez le nombre si besoin, ou revenez à la valeur par défaut de la catégorie.
6. **Volume utile** (utilitaire 1 à 25 m³, camion 5 à 100 m³) : corrigez-le ou effacez-le. Seuls les déménagements qui tiennent dans ce volume sont proposés au chauffeur ; un volume non déclaré reste accepté mais doit être vérifié à la main.

### Services SENGA — nombre de passagers et gamme Familiale

**Nombre de places par gamme** (Administrateur et Super admin) : maximum de passagers en Standard / Confort / VIP, minimum et maximum de places Familiale, maximum de places Tricycle (ex. 4 ou 5 pour les grands tricycles). Les déclarations des chauffeurs, l'envoi des courses et le choix du nombre de passagers suivent ces valeurs ; les apps les appliquent à leur prochaine ouverture.

- **Activer le choix du nombre de passagers** : le passager indique combien de personnes voyagent ; seules les voitures avec assez de places reçoivent la course. Désactivé, chaque course compte pour 1 passager.
- **Gamme Familiale** (par défaut 5–8 places) : affiche la gamme dans l'app passager ; Standard, Confort et VIP sont alors limités au maximum voiture (4 par défaut). N'activez qu'avec des véhicules Familiale validés. Tarif : **Tarifs → Familiale**.
- **Gamme Tricycle** (par défaut 1–3 places) : affiche la gamme Tricycle (tricycle à passagers) dans l'app passager. Activez-la ville par ville une fois assez de tricycles validés (10 à 20 conseillés). Tarif de départ ≈ Standard − 30 % : **Tarifs → Tricycle**. Les **tripoteurs** (marchandises) n'en dépendent pas : ils reçoivent colis, commissions et déménagements « camionnette » dès la validation de leur type d'engin.

## Opérations (lecture + mise à jour)

Les modules **Locations**, **Déménagements**, **Covoiturage** et **Livraisons** affichent des demandes créées par les apps mobiles. L'admin peut :

- **Consulter** la liste et ouvrir le **Détail**
- **Modifier le statut** (ex. PENDING → ASSIGNED → COMPLETED)
- **Assigner un chauffeur** (livraisons ERRAND, déménagements)
- **Déménagements** : à la création, la demande est proposée aux chauffeurs **en ligne** de la même ville dont l'engin convient (camionnette/15 m³ : utilitaire ou camion ; 30/50 m³ : camion) et dont le volume déclaré suffit. Le premier qui accepte l'obtient. Si personne n'accepte, assignez à la main : la liste ne montre que les chauffeurs éligibles, avec leur volume en m³.
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

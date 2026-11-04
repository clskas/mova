# Pipeline de livraison SENGA

## Règle d'or

`main` est **protégée** : toute modification passe par une Pull Request. La fusion n'est possible
que si les 17 checks sont verts, Playwright compris. Cela vaut aussi pour les administrateurs.

Render construit depuis **afri-soft-com/mova**. Après chaque fusion, le job `mirror` de Deploy
y pousse `main` tout seul, avec la clé de déploiement `AFRI_SOFT_DEPLOY_KEY` (écriture sur ce
seul dépôt). Si afri-soft contient des commits absents de `main`, il s'arrête et le signale.

Sans la clé, il faut pousser à la main :

```bash
git push afri-soft origin/main:refs/heads/main
```

Sans ce push, le déploiement **échoue volontairement**. Avant, il redéployait en silence l'ancien
code d'afri-soft.

## Backend : chaque fusion sur `main`

```
CI → Build and Push → Deploy → Smoke Tests Production → Mobile Release (piste interne)
```

Le job **Deploy** enchaîne :

1. **Préproduction** (`deploy-staging`) : même commit sur la pile `mova-stg-*`, avec SMS et
   paiements simulés et une base dédiée. Il attend que tous les services soient en ligne,
   lance le smoke strict, puis un **parcours passager complet** (`scripts/staging-journey.sh`) :
   connexion OTP, profil, estimation, création et annulation d'une course, portefeuille,
   notifications, historique. **Si une étape échoue, la production n'est pas touchée.**
2. **Production** (`deploy-render`) :
   - sauvegarde des bases, migrations, photo des versions en ligne ;
   - déploiement, attente de **tous** les services ;
   - smoke strict : tous les services `ok`, géo, estimation, authentification.
   - **Si un contrôle échoue, retour automatique** de chaque service à sa version d'avant.
3. **Hub de paiement** (`deploy-hub`, VPS) :
   - sauvegarde de la base, image candidate, bascule, `/health` ;
   - retour automatique en cas d'échec.
   - Actif dès que le secret `HUB_DEPLOY_SSH_KEY` existe (voir `deploy/afrisoft-pay/README.md`).

Les migrations ne sont jamais annulées par un retour arrière. Elles doivent donc rester
**additives** : ajout de colonnes ou de tables, jamais de suppression dans la même livraison
que le code qui cesse de les utiliser.

## Apps mobiles

| Action | Résultat |
|---|---|
| Fusion sur `main` | AAB sur la **piste interne** Play. Aucun utilisateur ne la voit, aucune bannière. |
| Tag `v1.0.43` (= version du `pubspec`, commit présent sur `main`) | Build AAB + IPA, Play **production à 20 %**, TestFlight, soumission à l'examen Apple avec **diffusion progressive sur 7 jours**. |
| Actions → Mobile Release → `complete_rollout` | Play production à **100 %**, puis annonce de la **bannière de mise à jour**. |

Pour publier une version :

1. Monter `version:` dans `mobile/pubspec.yaml` (ex. `1.0.44+209`) via une PR, puis la fusionner.
2. Poser le tag sur le commit fusionné :
   ```bash
   git tag v1.0.44 origin/main && git push origin v1.0.44
   ```
3. Surveiller les plantages dans Play Console (Android vitals) pendant le déploiement à 20 %.
4. Si tout va bien : **Mobile Release → Run workflow → `complete_rollout`**.
   En cas de problème, mettez le déploiement en pause dans Play Console.

### Bannières de mise à jour

- **Android** : la version annoncée ne change qu'au passage à 100 %. Les nouvelles versions de
  l'app masquent aussi la bannière quand Google Play n'a rien à installer.
- **iOS** : l'API lit la version **réellement publiée** sur l'App Store (Apple Lookup). Elle
  n'annonce jamais une version en cours d'examen. La fiche App Store prend la version du `pubspec`.

## Préproduction

- Création ou réparation : **Actions → Render Provision Staging → Run workflow**. Le workflow
  produit `config/render-services.staging.json`, qu'il faut commiter.
- Coût : environ 79 $/mois (9 services Starter + Postgres basic-256mb + Key Value Starter).
- Comptes de test : numéros `+2439000000xx`, code `123456`. Les SMS et paiements sont simulés.
- Données de test : **Actions → Seed Staging → Run workflow**. Crée 15 passagers, 15 chauffeurs
  (dont 8 validés et disponibles à Kinshasa, avec véhicules), un historique de courses et des
  signalements. Relançable sans risque. Le script refuse toute base qui n'est pas la préproduction.

## Être alerté

- **Production Monitor** (toutes les 10 min) : smoke strict de l'API et santé du hub de paiement.
  En cas de panne, un ticket GitHub « 🚨 Production en panne » (label `incident`) est ouvert, et
  vous êtes notifié par mention (e-mail ou app GitHub). Le ticket se ferme tout seul au retour.
- **Sentry** (erreurs détaillées) : inactif tant qu'aucune clé n'est configurée.
  1. Créez un compte sur sentry.io (gratuit), puis deux projets : « senga-backend » (Node) et
     « senga-mobile » (Flutter). Copiez la *DSN* de chacun (Project settings → Client keys).
  2. Créez les secrets GitHub `SENTRY_DSN` (backend) et `SENTRY_DSN_MOBILE` (apps).
  3. Lancez **Actions → Configure Sentry** : la clé est posée sur les 7 services Render, qui
     redémarrent. Les apps l'intègrent à la prochaine release mobile.

  Côté serveur, les erreurs 500 et les plantages sont remontés avec le service, la route et la
  version. Côté apps, ce sont les erreurs Dart (les plantages natifs ne sont pas captés).

## Revenir en arrière

**Actions → Rollback Production → Run workflow**, sans rien remplir : remet en production la
version qui tournait juste avant (Render + hub), sans repasser par la préproduction. Pour une
version précise, indiquez son commit. Les mêmes contrôles et sauvegardes que pour un déploiement
s'appliquent. Rappel : les migrations de base ne sont pas annulées.

Pour s'entraîner sans risque, choisissez `target = staging` : la même logique remet la version
d'avant sur la **préproduction** seulement. La production n'est pas touchée, et la préproduction
revient à jour à la fusion suivante.

## Interrupteurs de fonctionnalité

Une nouveauté risquée arrive **éteinte** et s'allume dans l'admin, sans redéploiement :
Admin → Services SENGA. On l'allume d'abord en préproduction, puis en production.
Si elle pose problème, on l'éteint : l'effet est immédiat, y compris pour les courses en cours de recherche.

| Interrupteur | Effet quand il est éteint |
|---|---|
| Nombre de passagers (`features.passengerCountEnabled`) | Le sélecteur est masqué dans l'app passager ; toute course compte pour 1 passager ; la recherche ignore les places des véhicules. |
| Gamme Familiale (`features.familialeEnabled`) | La gamme Familiale (6–8 places) est masquée et refusée à la commande ; le sélecteur s'arrête à 4 passagers. Les chauffeurs peuvent déjà inscrire un véhicule Familiale. |

Nombre de passagers : le chauffeur déclare les places de sa voiture (sans lui) dans
Enregistrement → Véhicule ; sans déclaration, la valeur de la catégorie s'applique
(moto 1, voiture 4). L'admin peut corriger sur la fiche chauffeur. Le prix ne dépend pas
du nombre de passagers. Le Pool garde 1 place par réservation.

Gamme Familiale : comme UberXL / Bolt XL, on paie le véhicule, pas chaque passager.
Standard, Confort et VIP sont limités à 4 passagers dans l'app ; dès 5, l'app passe en
Familiale (6 à 8 places, 6 par défaut, tarif ≈ Standard + 30 %, réglable dans Admin → Tarifs).
Un véhicule Familiale reçoit aussi les courses Standard. Pas de Familiale en Pool ni en
course planifiée pour l'instant. Avant d'allumer l'interrupteur, validez des véhicules
Familiale (fiche chauffeur → type d'engin).


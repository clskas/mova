# Pipeline de livraison SENGA

## Règle d'or

`main` est **protégée** : toute modification passe par une Pull Request. La fusion n'est possible
que si les 17 checks sont verts, Playwright compris. Cela vaut aussi pour les administrateurs.

Render construit depuis **afri-soft-com/mova** : après chaque fusion, poussez aussi `main` là-bas.

```bash
git push afri-soft origin/main:refs/heads/main
```

Sans ce push, le déploiement **échoue volontairement**. Avant, il redéployait en silence l'ancien
code d'afri-soft. Le secret `AFRI_SOFT_PUSH_TOKEN` (jeton GitHub avec droit d'écriture sur
afri-soft) permettra d'automatiser ce push.

## Backend : chaque fusion sur `main`

```
CI → Build and Push → Deploy → Smoke Tests Production → Mobile Release (piste interne)
```

Le job **Deploy** enchaîne :

1. **Préproduction** (`deploy-staging`) : même commit sur la pile `mova-stg-*`, avec SMS et
   paiements simulés et une base dédiée. Il attend que tous les services soient en ligne,
   puis lance le smoke strict. **Si ça échoue, la production n'est pas touchée.**
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
| Tag `v1.0.43` (= version du `pubspec`, commit présent sur `main`) | Build AAB + IPA, Play **production à 20 %**, TestFlight, soumission à l'examen Apple. |
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

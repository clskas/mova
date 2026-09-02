# Guide Play Store — SENGA (compte déjà créé)

Objectif : passer de **« app créée dans Play Console »** à **« AAB publié via CI sur le track Internal testing »**.

Package IDs (déjà dans le repo Flutter) :

| App | package name |
|-----|----------------|
| Senga (passager) | `cd.mova.mova.passenger` |
| SENGA Driver | `cd.mova.mova.driver` |

Pipeline : workflow GitHub **Mobile Release** (après Deploy + smoke), environnement `production-mobile`.

---

## 1. Créer les applications (si pas déjà fait)

1. Ouvrir [Google Play Console](https://play.google.com/console) avec votre compte.
2. **Créer une app** → nom **Senga** → application → gratuit → déclarations politique / export.
3. Répéter pour **SENGA Driver**.
4. Dans chaque app : **Paramètres** → **Identité de l'application** → vérifier le package :
   - Passager : `cd.mova.mova.passenger`
   - Chauffeur : `cd.mova.mova.driver`
5. Remplir au minimum : fiche store (texte FR), catégorie, coordonnées contact, politique de confidentialité, questionnaire contenu.

---

## 2. Track Internal testing

1. Menu **Tests** → **Tests internes** → **Créer une version**.
2. Ajouter des testeurs (liste e-mail Google) — vous + 2–3 comptes.
3. Ne pas uploader manuellement l’AAB si la CI est configurée : l’étape suivante pousse automatiquement.

---

## 3. Compte de service pour CI (`PLAY_STORE_JSON_KEY`)

1. [Google Cloud Console](https://console.cloud.google.com/) → projet lié à Play (ou en créer un).
2. **IAM & Admin** → **Comptes de service** → **Créer** (ex. `senga-play-ci`).
3. **Clés** → **Ajouter une clé** → JSON → télécharger le fichier.
4. Play Console → **Utilisateurs et autorisations** → **Inviter des utilisateurs** → coller l’e-mail du compte de service.
5. Droits : **Administrateur de versions** (ou au minimum accès aux versions + track Internal) sur **Senga** et **SENGA Driver**.
6. Placer le JSON en local (gitignored) : `mobile/android/play-service-account.json`.
7. Encoder + pousser le secret sur le repo CI **afri-soft-com/mova** (PowerShell) :

```powershell
$b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes("$PWD\mobile\android\play-service-account.json"))
$b64 | gh secret set PLAY_STORE_JSON_KEY -R afri-soft-com/mova
```

Aliases acceptés par la CI : `PLAY_STORE_JSON`, `PLAY_SERVICE_ACCOUNT_JSON`.

---

## 4. Keystore Android (signature release)

Keystore upload local (ne **jamais** committer) :

- Fichier : `mobile/android/keystore/senga-upload.jks`
- Alias : `senga`
- Mots de passe : `mobile/android/key.properties` + backup `mobile/android/.keystore-credentials.local` (tous gitignored)

Si vous devez en générer un nouveau (une seule machine, une seule fois) :

```powershell
keytool -genkey -v -keystore mobile/android/app/upload-keystore.jks -alias mova-upload -keyalg RSA -keysize 2048 -validity 10000
```

Secrets GitHub (repo **afri-soft-com/mova**, niveau Actions — le job build n’utilise pas l’env) :

| Secret | Contenu |
|--------|---------|
| `ANDROID_KEYSTORE_BASE64` | fichier `.jks` encodé base64 |
| `ANDROID_KEYSTORE_PASSWORD` | mot de passe keystore |
| `ANDROID_KEY_PASSWORD` | mot de passe clé |
| `ANDROID_KEY_ALIAS` | ex. `senga` |

```powershell
$b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes("$PWD\mobile\android\keystore\senga-upload.jks"))
$b64 | gh secret set ANDROID_KEYSTORE_BASE64 -R afri-soft-com/mova
```

Autres secrets build prod (déjà attendus par `mobile-release.yml`) :

- `PROD_API_URL` = `https://mova-gateway.onrender.com/api`
- `PROD_WS_URL` = `https://mova-gateway.onrender.com` (https host ; pas `wss://` — le client Socket.IO gère le schéma)

---

## 5. Publier via CI (build AAB → upload Internal automatique)

Dès qu’un AAB est reconstruit avec succès, le job **Upload Play Store (internal)** tourne automatiquement (passager + chauffeur). Pas de case à cocher pour Play : seul le secret Play (et l’approbation éventuelle de l’env `production-mobile`) conditionnent l’upload.

**Déclencheurs :**

| Comment | Effet |
|---------|--------|
| Push sur `main` (pipeline complet) | CI → Build/Push → Deploy → Smoke → **Mobile Release** (AAB + upload Internal) |
| Tag `v*` (ex. `v1.0.0`) | **Mobile Release** direct (AAB + upload) |
| Actions → **Mobile Release** → Run workflow | Rebuild AAB + upload Internal (case TestFlight = iOS seulement) |

1. Configurer les secrets ci-dessus sur **afri-soft-com/mova**.
2. Lancer un des déclencheurs.
3. Si l’env `production-mobile` exige une approbation : **Approuver** le job d’upload dans Actions.
4. Vérifier Play Console → **Tests internes** → nouvelle version pour `cd.mova.mova.passenger` et `cd.mova.mova.driver`.

Si l’upload est **skipped** : aucun secret Play (`PLAY_STORE_JSON_KEY` / alias) — les AAB restent dans les **Artifacts** du run. Si le secret est présent et l’upload échoue, le job **échoue** (pas de skip silencieux).

---

## 6. « Interne » sur SENGA Driver (Play, pas l’app)

Le launcher et `applicationId` s’appellent **SENGA Driver** (`cd.mova.mova.driver`). Il n’y a **pas** de badge « Interne » dans le binaire release.

Le libellé **Interne** vient du track Play **Tests internes** (`fastlane` `track: "internal"`). Sur la fiche Play (FR), les testeurs voient « Interne » / « Tests internes ». Ce n’est pas un flavor Gradle ni un titre store « SENGA Driver (internal) ».

Pour que les chauffeurs ne voient plus « Interne » :

1. Play Console → **SENGA Driver** (`cd.mova.mova.driver`) → **Tests** → **Tests internes**.
2. Ouvrir la version publiée → **Promouvoir la version** → **Production** (ou d’abord **Tests ouverts** si la fiche / le questionnaire contenu n’est pas encore validé).
3. Répéter pour **Senga** (`cd.mova.mova.passenger`) si besoin.

La CI n’auto-promouvait **pas** vers production. Option : Actions → **Mobile Release** → cocher **promote_to_production** (après upload internal). Ne cocher que si la fiche store, la politique et le questionnaire contenu sont complets — sinon Play refusera.

---

## 7. Google Sign-In — SHA-1 (Cloud, pas un rebuild AAB)

`DEVELOPER_ERROR` / ApiException **10** est Play Services (package + empreinte), **pas** l’API SENGA. Reconstruire l’AAB ne change pas le SHA-1.

Google Cloud → APIs et services → Identifiants → **Client OAuth Android** (un SHA-1 par client, même package) :

| Package | SHA-1 | Usage |
|---------|-------|--------|
| `cd.mova.mova.passenger` | `6A:4B:2A:B7:88:F4:1C:41:9D:63:31:06:73:43:67:C8:4E:6D:2E:40` | Debug / sideload |
| `cd.mova.mova.driver` | `6A:4B:2A:B7:88:F4:1C:41:9D:63:31:06:73:43:67:C8:4E:6D:2E:40` | Debug / sideload |
| `cd.mova.mova.passenger` | `D5:7A:0F:7F:3C:A2:99:60:A2:24:C3:28:86:77:F6:89:F6:71:CD:BF` | Keystore upload |
| `cd.mova.mova.driver` | `D5:7A:0F:7F:3C:A2:99:60:A2:24:C3:28:86:77:F6:89:F6:71:CD:BF` | Keystore upload |
| les deux packages | Play Console → **Intégrité de l’app** → **SHA-1 classique** (pas SHA-256, pas PQC) | Install depuis Play |

Les 4 clients Android déjà créés couvrent debug + upload. **Il manque souvent le SHA-1 Play App Signing** (5e / 6e client). Après ajout, attendre quelques minutes. Le client **Web** `58917716638-rbgibno8pdvlud8dd00pdfjdv3q1dh4k` est le `serverClientId` Flutter (ne pas le remplacer par un ID Android).

---

## Checklist rapide

- [ ] Apps Senga + SENGA Driver créées avec les bons package IDs  
- [ ] Track Internal testing + liste testeurs  
- [ ] Compte de service invité dans Play Console  
- [ ] `PLAY_STORE_JSON_KEY` (base64) dans GitHub  
- [ ] Keystore + 4 secrets `ANDROID_*`  
- [ ] `PROD_API_URL` / `PROD_WS_URL`  
- [ ] Approbation env `production-mobile` si activée  

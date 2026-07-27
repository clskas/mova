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
6. Encoder le JSON en base64 (PowerShell) :

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\chemin\play-service-account.json"))
```

7. GitHub repo **afri-soft-com/mova** → **Settings** → **Secrets and variables** → **Actions** (ou env `production-mobile`) :
   - `PLAY_STORE_JSON_KEY` = la chaîne base64 (aliases acceptés : `PLAY_STORE_JSON`, `PLAY_SERVICE_ACCOUNT_JSON`)

---

## 4. Keystore Android (signature release)

Sur une machine sécurisée (une seule fois) :

```powershell
keytool -genkey -v -keystore senga-release.keystore -alias senga -keyalg RSA -keysize 2048 -validity 10000
```

Puis secrets GitHub :

| Secret | Contenu |
|--------|---------|
| `ANDROID_KEYSTORE_BASE64` | fichier `.keystore` encodé base64 |
| `ANDROID_KEYSTORE_PASSWORD` | mot de passe keystore |
| `ANDROID_KEY_PASSWORD` | mot de passe clé |
| `ANDROID_KEY_ALIAS` | ex. `senga` |

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\chemin\senga-release.keystore"))
```

Autres secrets build prod : `PROD_API_URL`, `PROD_WS_URL` (gateway Render, ex. `https://mova-gateway.onrender.com/api`).

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

## Checklist rapide

- [ ] Apps Senga + SENGA Driver créées avec les bons package IDs  
- [ ] Track Internal testing + liste testeurs  
- [ ] Compte de service invité dans Play Console  
- [ ] `PLAY_STORE_JSON_KEY` (base64) dans GitHub  
- [ ] Keystore + 4 secrets `ANDROID_*`  
- [ ] `PROD_API_URL` / `PROD_WS_URL`  
- [ ] Approbation env `production-mobile` si activée  

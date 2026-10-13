# Firebase / FCM pour SENGA (remplacer les SMS d’alerte chauffeur)

Sans `google-services.json` SENGA, l’app **SENGA Driver** ne peut pas enregistrer de token FCM.
Le backend envoie alors un **SMS de secours** pour les nouvelles courses/livraisons → coût SMS.

Objectif : push FCM gratuit quand l’app est fermée, SMS seulement si aucun token.

## 1. Créer le projet Firebase

1. Ouvrir [Firebase Console](https://console.firebase.google.com) avec le compte Google SENGA / AfriSoft.
2. **Ajouter un projet** (ex. `senga-prod`) — activer Google Analytics optionnel.
3. Dans **Paramètres du projet → Vos applications → Android**, ajouter **deux** apps :

| Nom affiché     | Package name            |
|-----------------|-------------------------|
| SENGA           | `cd.mova.mova.passenger` |
| SENGA Driver    | `cd.mova.mova.driver`    |

4. Télécharger **`google-services.json`** (un seul fichier qui contient les deux apps).
5. (iOS) voir section **iOS** ci-dessous.

## 2. Compte de service FCM HTTP v1 (backend)

Sur les **nouveaux** projets Firebase, l’API Legacy (Server key) est **indisponible**.
SENGA utilise **FCM HTTP v1** via un JSON de compte de service.

1. Firebase Console → **Paramètres du projet** → **Cloud Messaging**.
2. Vérifier **Firebase Cloud Messaging API (V1) = Enabled** (déjà le cas sur `senga-6ffda`).
3. Cliquer **Manage Service Accounts** (ou onglet **Service accounts**).
4. **Generate new private key** → télécharger le `.json`.
5. Sur Render, service **notification** :
   - `FCM_SERVICE_ACCOUNT_JSON` = contenu entier du JSON (une ligne), **ou**
   - `FCM_SERVICE_ACCOUNT_JSON_BASE64` = base64 du fichier
   - `FCM_PROJECT_ID` = `senga-6ffda` (déjà dans `render.yaml`)

Ne **pas** chercher une « Server key » Legacy : elle n’existe plus pour ce projet.

### iOS — clé APNs (obligatoire pour push iPhone)

1. [Apple Developer → Keys](https://developer.apple.com/account/resources/authkeys/list) → **+** → cocher **Apple Push Notifications service (APNs)** → Continue → Register → **Download** le `.p8` (une seule fois).
2. Noter **Key ID** et **Team ID**.
3. Firebase → **Cloud Messaging** → apps Apple (`cd.mova.mova` et `cd.mova.mova.driver`) → **APNs Authentication Key** → **Upload** le `.p8` + Key ID + Team ID.
4. **Ignorer** « Web Push certificates » / « Generate key pair » — inutile pour les apps mobiles SENGA.

## 3. Brancher le fichier dans le build mobile

### En local (test)

```text
mobile/android/app/google-services.json   ← fichier téléchargé (ne pas committer)
```

Le plugin Gradle s’applique automatiquement si le fichier est présent.

### En CI (Play / production)

1. Encoder le JSON :

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("google-services.json"))
```

2. Ajouter le secret GitHub `GOOGLE_SERVICES_JSON_BASE64` sur `clskas/mova`.
3. Le workflow **Mobile Release** écrit le fichier avant `flutter build`.

## 4. Vérifier que les SMS baissent

1. Installer SENGA Driver (build avec `google-services.json`).
2. Se connecter en chauffeur → accepter les notifications.
3. Logs notification-service : `driver.job.alert FCM … tokens=N` (plus de SMS si token présent).
4. SMS uniquement pour chauffeurs **sans** token (app désinstallée / refus de permission).

## 5. Portails partenaires (location / restaurant)

Ils n’utilisent **pas** Firebase : Web Push + son dans le navigateur (Paramètres → Son des notifications).
Pas de SMS pour les nouvelles réservations/commandes si le portail / PWA est ouvert ou abonné au push.

## Packages Android déjà prévus

- Passager : `cd.mova.mova.passenger`
- Chauffeur : `cd.mova.mova.driver`

SHA-1 upload / debug : à enregistrer aussi dans Firebase (comme pour Google Sign-In).

## iOS (`GoogleService-Info.plist`)

Bundle IDs SENGA (différents d’Android pour le passager) :

| App            | Bundle ID              |
|----------------|------------------------|
| SENGA (passager) | `cd.mova.mova`       |
| SENGA Driver     | `cd.mova.mova.driver` |

### Dans Firebase Console

1. Projet `senga` → **Add app** → icône **Apple (iOS)**.
2. **iOS bundle ID** : `cd.mova.mova` → Register → **Download `GoogleService-Info.plist`**.
3. **Add app** encore → iOS → bundle ID : `cd.mova.mova.driver` → Download le 2ᵉ plist.
4. **Cloud Messaging** → APNs Auth Key (voir §2 ci-dessus). Sans APNs, le push iOS ne marche pas.

### Fichiers dans le repo / CI

- Placer les plists (ou un secret CI) pour le build IPA — typiquement :
  - `mobile/ios/Runner/GoogleService-Info-passenger.plist`
  - `mobile/ios/Runner/GoogleService-Info-driver.plist`
- Le script `mobile/ios/ci_set_flavor.sh` pourra copier le bon fichier vers `GoogleService-Info.plist` avant `flutter build ipa`.

Tant que les plists + APNs ne sont pas en place, le FCM iOS reste inactif ; Android fonctionne dès que `google-services.json` + `FCM_SERVICE_ACCOUNT_JSON` sont configurés.

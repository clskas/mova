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

## 2. Clé serveur FCM (backend)

1. Firebase Console → **Paramètres du projet** → **Cloud Messaging**.
2. Copier la **clé serveur** (API Cloud Messaging legacy), **ou** migrer plus tard vers HTTP v1.
3. Sur Render, service **notification** : secret `FCM_SERVER_KEY` = cette clé  
   (`render.yaml` a déjà la clé `FCM_SERVER_KEY` en `sync: false`).

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

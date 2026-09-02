# Connexion OTP téléphone — intégration partenaire

**Public :** développeurs externes qui veulent le **même login SMS OTP que SENGA**.  
**Langue :** français (noms d’endpoints inchangés, en anglais).  
**Version :** septembre 2026 — contrat réel de `mova-auth` via la passerelle.

Ce fichier est **autonome**. Vous n’avez pas besoin du dépôt Mova ni d’un compte SMS.

---

## 1. Ce que vous appelez (et ce que vous n’appelez pas)

| À utiliser | Ne pas utiliser |
|------------|-----------------|
| Passerelle **`https://api.afri-soft.com`** | `sms.afri-soft.com` (hub SMS interne AfriSoft) |
| `POST /api/auth/otp/request` puis `POST /api/auth/otp/verify` | `pay.afri-soft.com` (hub paiements) |
| JWT renvoyé par `verify` | Clés SerdiPay, Africa’s Talking, HMAC hub, `DATABASE_URL` |

AfriSoft envoie le SMS **à votre place**. Votre application ne génère pas le code, ne stocke pas de secret SMS, et ne parle pas au fournisseur SMS.

**Pas de clé API aujourd’hui.** `otp/request` et `otp/verify` sont publics (aucun header `X-API-Key`, aucun HMAC). Si AfriSoft ajoute plus tard une clé partenaire, **demandez-la à AfriSoft** — n’inventez pas de secret et n’en copiez pas depuis un autre service.

---

## 2. URL de base et préfixe

**Production**

```
https://api.afri-soft.com
```

Toutes les routes métier passent par le préfixe **`/api`**. Chemins complets :

| Méthode | Chemin | Auth |
|---------|--------|------|
| `POST` | `/api/auth/otp/request` | Public |
| `POST` | `/api/auth/otp/verify` | Public |
| `GET` | `/api/users/me` | `Authorization: Bearer` (après login) |

Équivalent si votre client fixe déjà la base à `https://api.afri-soft.com/api` (comme l’app SENGA) : appeler `POST /auth/otp/request` et `POST /auth/otp/verify`.

Il n’existe **pas** d’endpoint `resend`. Pour renvoyer un SMS, rappeler `POST /api/auth/otp/request` (les codes précédents non utilisés sont invalidés).

`Content-Type: application/json` sur toutes les requêtes POST.

---

## 3. Parcours en 4 étapes

```
1. Votre app  →  POST /api/auth/otp/request  { "phone", "role": "PASSENGER" }
2. L’utilisateur reçoit un SMS  « Votre code SENGA : …… Valide 10 minutes »
3. Votre app  →  POST /api/auth/otp/verify   { "phone", "code", "role": "PASSENGER" }
4. Réponse    →  accessToken (JWT)  —  stockez-le, envoyez-le en Bearer
```

Le code OTP fait **6 chiffres**. Il expire au bout de **10 minutes**. Un nouveau `request` invalide les codes encore valides pour ce numéro.

---

## 4. Rôle — restez sur PASSENGER

Pour une application tierce, **passez toujours `"role": "PASSENGER"`** (ou `"intendedRole": "PASSENGER"`). Ne passez pas `DRIVER`, `RESTAURANT`, `RENTAL_PARTNER`, ni un rôle staff.

| Champ | Pour vous | Pourquoi |
|-------|-----------|----------|
| omis ou `PASSENGER` | **Oui** | Compte passager SENGA ; auto-création si le numéro n’existe pas |
| `DRIVER` | Non | App chauffeur SENGA + KYC ; réservé |
| `RESTAURANT` / `portal: "restaurant"` | Non | Portail restaurant SENGA |
| `RENTAL_PARTNER` / `portal: "rental"` | Non | Portail location SENGA |
| `ADMIN`, `SUPER_ADMIN`, … | Non | Console admin, comptes créés uniquement par AfriSoft |

Si le numéro est déjà un compte chauffeur / restaurant / location / staff, `role: "PASSENGER"` renvoie **403** avec un message du type « utilisez l’application SENGA Driver » (ou le portail concerné). C’est voulu : un même numéro n’est pas partagé entre ces rôles.

Il n’existe pas aujourd’hui de rôle « partenaire externe » dédié. Le login OTP pour une app tierce = **PASSENGER**.

---

## 5. Format téléphone RDC (+243)

L’API normalise puis valide. Forme canonique : **`+243` + 9 chiffres** (`/^\+243[0-9]{9}$/`).

Vous pouvez envoyer le numéro tel que l’utilisateur le tape ; le champ `phone` de la réponse est toujours normalisé.

| Saisie | Normalisé |
|--------|-----------|
| `+243812345678` | `+243812345678` |
| `0812345678` | `+243812345678` |
| `243812345678` | `+243812345678` |
| `812345678` | `+243812345678` |
| `+243 81 234 5678` | `+243812345678` |
| `00243812345678` | `+243812345678` |
| `+2430812345678` | `+243812345678` |

Numéro invalide (mauvais pays, trop court, etc.) → **400** `MOVA_AUTH_004` : `Numéro de téléphone invalide. Format: +243XXXXXXXXX`.

---

## 6. Étape 1 — demander l’OTP

`POST https://api.afri-soft.com/api/auth/otp/request`

```json
{
  "phone": "+243812345678",
  "role": "PASSENGER"
}
```

**Réponse 200**

```json
{
  "success": true,
  "message": "Code OTP envoyé",
  "phone": "+243812345678"
}
```

Le texte de `message` peut varier légèrement (fournisseur SMS). `phone` est le numéro normalisé. **Aucun code n’est renvoyé** en production. L’utilisateur le reçoit par SMS.

Affichez uniquement un message du type « Un code a été envoyé par SMS », jamais de trace technique.

---

## 7. Étape 2 — vérifier l’OTP et obtenir le JWT

`POST https://api.afri-soft.com/api/auth/otp/verify`

```json
{
  "phone": "+243812345678",
  "code": "482913",
  "role": "PASSENGER"
}
```

- Compte déjà existant → **HTTP 200**
- Premier login (compte créé) → **HTTP 201** (`isNew: true`)

**Réponse 200 / 201** (jetons masqués)

```json
{
  "success": true,
  "accessToken": "<JWT>",
  "isNew": false,
  "pinConfigured": false,
  "needsPinSetup": true,
  "needsPhone": false,
  "user": {
    "id": "<uuid>",
    "phone": "+243812345678",
    "phoneMasked": "+243 *** 5678",
    "email": "",
    "emailMasked": "",
    "googleLinked": false,
    "hasPhone": true,
    "canUnlinkGoogle": false,
    "canUnlinkPhone": false,
    "publicId": "RDR-A1B2C3",
    "role": "PASSENGER",
    "status": "ACTIVE",
    "firstName": null,
    "lastName": null
  }
}
```

Stockez `accessToken`. Durée de vie du JWT : **7 jours** (sauf indication contraire d’AfriSoft).

`needsPinSetup: true` signifie que l’utilisateur n’a pas encore de PIN local SENGA. **Le flux principal reste l’OTP SMS.** Vous pouvez ignorer le PIN. Si vous voulez le proposer plus tard :

- `POST /api/auth/pin/setup` (JWT requis) — corps `{ "pin": "847291", "confirmPin": "847291" }` (6 chiffres)
- `POST /api/auth/login/options` puis `POST /api/auth/pin/login` — connexion sans SMS si un PIN existe

Ne construisez pas un second système d’auth. Réutilisez ce JWT.

---

## 8. Après login — header Authorization

Sur toutes les routes protégées (ex. profil) :

```
Authorization: Bearer <accessToken>
Content-Type: application/json
```

Exemple :

```http
GET /api/users/me HTTP/1.1
Host: api.afri-soft.com
Authorization: Bearer <JWT>
```

---

## 9. CORS — mobile / serveur / navigateur

| Client | CORS | Recommandation |
|--------|------|----------------|
| App native (iOS / Android) | Non concerné | Appel direct à `https://api.afri-soft.com` |
| Backend (Node, PHP, Java…) | Non concerné | **Recommandé** pour un site web tiers |
| Navigateur (SPA sur *votre* domaine) | **Refusé** par défaut | La passerelle n’autorise que les origines listées par AfriSoft (`CORS_ORIGIN`). Demandez à AfriSoft d’ajouter votre origine HTTPS, **ou** proxiez depuis votre serveur. |

`credentials: true` est activé côté API. Un appel navigateur cross-origin sans origine autorisée échoue avant même le JSON.

---

## 10. Limites et verrous

| Règle | Valeur |
|-------|--------|
| Validité du code | 10 minutes |
| Nouveau `request` | Invalide les OTP précédents du même numéro |
| Passerelle (par IP) | **8** appels / **60 s** sur `otp/request`, `otp/verify` (et PIN / Google) |
| Codes faux | **5** échecs → verrou **15 minutes** (HTTP 429) |

En cas de 429, affichez « Trop de tentatives. Réessayez plus tard. » — pas le corps brut.

---

## 11. Erreurs (messages utilisateur, jamais de stack)

Corps typique :

```json
{
  "success": false,
  "error": {
    "code": "MOVA_AUTH_001",
    "message": "Code OTP invalide. Veuillez réessayer."
  },
  "timestamp": "2026-09-02T15:00:00.000Z"
}
```

Affichez `error.message`. N’affichez pas de stack, de nom de variable d’environnement, ni de détail fournisseur.

| HTTP | `error.code` | Message (FR) |
|------|----------------|--------------|
| 400 | `MOVA_AUTH_004` | Numéro de téléphone invalide. Format: +243XXXXXXXXX |
| 400 | `MOVA_AUTH_001` | Code OTP invalide. Veuillez réessayer. *(code faux, expiré ou déjà utilisé)* |
| 400 | `MOVA_VAL_001` | Données invalides. / « Numéro de téléphone requis. » / portail inconnu si `portal` est envoyé |
| 403 | `MOVA_AUTH_005` | Accès refusé… / Compte suspendu. Contactez le support SENGA. / mauvais rôle (chauffeur, resto, staff…) |
| 429 | `MOVA_AUTH_005` | Trop de tentatives OTP. Réessayez dans 15 minutes. |
| 429 | (throttle IP) | Traitez comme un rate-limit ; message utilisateur générique |
| 401 | `MOVA_AUTH_003` | Non autorisé. Veuillez vous connecter. *(JWT manquant / invalide sur les routes protégées)* |
| 503 | `MOVA_VAL_001` | Impossible d'envoyer le code par SMS. Réessayez dans quelques minutes. |

Un code expiré ou déjà consommé revient comme **OTP invalide** (`MOVA_AUTH_001`) : proposez « Renvoyer le code » (`otp/request` à nouveau).

---

## 12. Exemples curl

```bash
# 1) Demander le SMS
curl -sS -X POST "https://api.afri-soft.com/api/auth/otp/request" \
  -H "Content-Type: application/json" \
  -d '{"phone":"+243812345678","role":"PASSENGER"}'

# 2) L’utilisateur lit le SMS, puis :
curl -sS -X POST "https://api.afri-soft.com/api/auth/otp/verify" \
  -H "Content-Type: application/json" \
  -d '{"phone":"+243812345678","code":"482913","role":"PASSENGER"}'

# 3) Appels suivants
curl -sS "https://api.afri-soft.com/api/users/me" \
  -H "Authorization: Bearer <JWT>"
```

---

## 13. Interdictions (checklist)

- Ne pas appeler `https://sms.afri-soft.com` ni implémenter HMAC / `app_id` du hub SMS.
- Ne pas appeler le hub paiements (`pay.afri-soft.com`) pour un login.
- Ne pas embarquer de clés SerdiPay, Africa’s Talking, SMTP, ni d’URL de base de données.
- Ne pas inventer un second login (OTP maison, Firebase parallèle, etc.) pour « remplacer » cet API.
- Ne pas créer de comptes `DRIVER` / restaurant / location / staff depuis votre app.
- Ne pas logger le code OTP ni le JWT en clair dans un front public.

---

## 14. Contact

**AfriSoft** — intégrations et évolutions (clé partenaire future, ajout d’origine CORS, questions contrat).

Dépôt canonique : [https://github.com/afri-soft-com/mova](https://github.com/afri-soft-com/mova)  
Ce document : `docs/AFRISOFT_OTP_LOGIN_INTEGRATION.md`

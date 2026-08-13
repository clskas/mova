# Africa's Talking — OTP SMS (MOVA)

OTP SMS est déjà branché dans le code (`packages/shared/src/africas-talking.ts` → `mova-auth` / `mova-notification`).  
Il reste à **renseigner les secrets sur Render** et à utiliser un **compte / sender production** pour les vrais numéros `+243`.

## Variables Render

Définir sur le **groupe d’env** `mova-external-apis` (consommé par `mova-auth` et `mova-notification`), ou directement sur `mova-auth` :

| Variable | Valeur typique | Notes |
|----------|----------------|--------|
| `SMS_PROVIDER` | `africastalking` | Switch explicite — **pas** de fallback vers SerdiPay. Pour SerdiPay SMS : voir [SMS_OTP_PROVIDERS.md](./SMS_OTP_PROVIDERS.md). |
| `AFRICAS_TALKING_USERNAME` | `mova` | **Username de l’app** AT (pas l’email de login) |
| `AFRICAS_TALKING_API_KEY` | *(secret)* | Dashboard → app → **Settings → API Key** |
| `AFRICAS_TALKING_ENV` | `production` | `sandbox` = API sandbox uniquement (pas de vrais +243 fiables) |
| `AFRICAS_TALKING_SMS_SENDER` | `MOVA` | Alphanumeric / shortcode **approuvé** (voir ci-dessous) |

Ne pas committer la clé. Local : copier `config/external-apis.env.example` → `config/external-apis.env`.

### `ALLOW_TEST_OTP` (mova-auth)

| Mode | Comportement |
|------|----------------|
| `ALLOW_TEST_OTP=true` | OTP fixe **`123456`** uniquement pour les numéros seed (`+2439000000xx`, etc.). **Pas d’SMS** pour ces numéros. |
| Numéro hors whitelist | OTP aléatoire + SMS réel via AT (si `SMS_PROVIDER` / credentials OK) |
| `MOCK_OTP=true` | Interdit en production (`NODE_ENV=production`) |

Garder `ALLOW_TEST_OTP=true` pour Play / démos seed ; le retirer seulement après un test SMS réussi sur un vrai `+243`.

Mobile Money reste **SerdiPay** (`MOBILE_MONEY_GATEWAY=serdipay`) — ce guide ne change pas le hub paiement.

## Où trouver le Sender ID

1. [account.africastalking.com](https://account.africastalking.com/) → ouvrir l’app **mova**
2. Menu **SMS** → **Alphanumerics** → **My Alphanumerics** (ou **Shortcodes** → **My Shortcodes**)
3. Si aucun ID : **SMS → Alphanumerics → Request** (ex. `MOVA`), attendre validation
4. Coller la valeur approuvée dans `AFRICAS_TALKING_SMS_SENDER`

Sans sender enregistré, AT peut utiliser un défaut (`AFRICASTKNG`) ou rejeter selon le réseau RDC.

## Configurer Render (manuel)

1. Dashboard Render → Environment Groups → **`mova-external-apis`**
2. Ajouter / mettre à jour les variables du tableau ci-dessus (coller l’API key une seule fois)
3. Vérifier `mova-auth` : `MOCK_OTP=false`, `ALLOW_TEST_OTP=true` (ou `false` après validation SMS)
4. Redeploy **`mova-auth`** (et **`mova-notification`** si SMS statut course)

Option tooling local (si `RENDER_API_KEY` + `config/external-apis.env` remplis) :

```bash
node scripts/restore-render-provider-env.mjs
```

Le script n’uploade que les clés présentes (non vides) ; il n’a pas besoin que vous colliez la clé dans le chat.

## Tester avec un vrai numéro Congolais

1. Compte AT **live** + crédit SMS + sender approuvé pour la RDC  
2. Env Render : `AFRICAS_TALKING_ENV=production`, username `mova`, clé live, sender `MOVA`  
3. Utiliser un numéro **hors** whitelist test (ex. votre `+2438…` / `+2439…`)  
4. App ou API :

```http
POST https://<gateway>/api/auth/otp/request
Content-Type: application/json

{ "phone": "+2438XXXXXXXX" }
```

5. Recevoir SMS « Votre code MOVA : …… » → `POST /api/auth/otp/verify` avec ce code  
6. Logs `mova-auth` : provider `AFRICASTALKING` ; en cas d’échec, statut destinataire AT dans le message d’erreur

Pour un numéro seed (`+243900000010`, etc.) avec `ALLOW_TEST_OTP=true` : code **`123456`**, aucun SMS AT.

## Blocages courants

| Blocage | Action |
|---------|--------|
| Sandbox vs live | Sandbox ≠ livraison fiable vers +243. Passer l’app en **production** et `AFRICAS_TALKING_ENV=production`. |
| Sender non enregistré (RDC) | Demander alphanumeric `MOVA` ; Vodacom exige souvent une pré-enregistrement ; Orange peut remplacer le sender. |
| Username incorrect | Utiliser le **username app** (`mova`), pas l’email compte. |
| Crédit insuffisant | Recharger le wallet SMS AT. |
| SerdiPay MM | Inchangé — ne pas mettre `MOBILE_MONEY_GATEWAY=africastalking` sauf intention MM AT. |

## Fichiers code (référence)

- Client HTTP SMS : `packages/shared/src/africas-talking.ts` (`africasTalkingSendSms`)
- Abstraction OTP : `services/auth-service/src/auth/sms.providers.ts`
- SMS courses / notifs : `services/notification-service/src/sms/sms.service.ts`
- Exemple env : `config/external-apis.env.example`

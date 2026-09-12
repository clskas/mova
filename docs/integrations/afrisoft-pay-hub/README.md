# Pack d’intégration — Payment Hub AfriSoft (app sœur)

**Handoff canonique (comme « hub sms ») :** [../afrisoft-pay-hub-mobilemoney.md](../afrisoft-pay-hub-mobilemoney.md)  
**Pack détaillé :** [../afrisoft-pay-hub.md](../afrisoft-pay-hub.md) · env [../afrisoft-pay-hub.env.example](../afrisoft-pay-hub.env.example)  
**Contrat long / ops VPS :** [../../AFRISOFT_PAYMENT_HUB_API.md](../../AFRISOFT_PAYMENT_HUB_API.md)  
**Companion SMS :** [../afrisoft-sms-hub-otp.md](../afrisoft-sms-hub-otp.md) · [../afrisoft-sms-hub.env.example](../afrisoft-sms-hub.env.example)

**Snippets :**

| Fichier | Rôle |
|---------|------|
| [create-payment.example.mjs](./create-payment.example.mjs) | `POST /v1/payments` (C2B) |
| [create-payout.example.mjs](./create-payout.example.mjs) | `POST /v1/payouts` (B2C) |
| [verify-webhook.example.mjs](./verify-webhook.example.mjs) | Vérifier HMAC webhook hub → app |

**URL de base :** `https://pay.afri-soft.com`  
**Ne pas utiliser :** `sms.afri-soft.com` · `api.afri-soft.com/api/wallet/*` · `serdipay.com` depuis votre app

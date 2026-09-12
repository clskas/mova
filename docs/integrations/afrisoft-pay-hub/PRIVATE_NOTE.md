# Note privée — clés Payment Hub (ops AfriSoft)

Ce fichier **n’a pas de secrets**. Il décrit comment remettre `app_id` + `api_key` + `webhook_secret` aux apps sœurs.

## 1. Ne pas mettre les clés dans le guide public

Le handoff [`afrisoft-pay-hub-mobilemoney.md`](../afrisoft-pay-hub-mobilemoney.md) / « hub paiement mobilemoney.docx » reste **sans secrets** (placeholders `CHANGE_ME`).

Remettre les valeurs **à part**, comme pour le hub SMS.

## 2. Apps déjà enregistrées sur le VPS pay (sept. 2026)

Sur `/opt/afrisoft-pay/.env` → `AFRISOFT_HUB_APPS` :

| `app_id` | Usage |
|----------|--------|
| `senga` | SENGA uniquement — **ne pas** donner aux autres apps |
| `educongo` | App sœur Educongo |
| `afrisoft-partenaire` | Autre partenaire AfriSoft |

Les clés `educongo` / `afrisoft-partenaire` sont **alignées** sur le hub SMS (`/opt/afrisoft-sms/.env`) pour le même `app_id`.

Fichiers privés générés localement (hors git) :

- `%USERPROFILE%\Downloads\educongo.env`
- `%USERPROFILE%\Downloads\afrisoft-partenaire.env`

## 3. Ce que l’autre app reçoit

| Variable | Valeur |
|----------|--------|
| `AFRISOFT_PAY_HUB_URL` | `https://pay.afri-soft.com` |
| `AFRISOFT_HUB_APP_ID` | ex. `educongo` |
| `AFRISOFT_HUB_API_KEY` | secret HMAC |
| `AFRISOFT_HUB_WEBHOOK_SECRET` | en pratique = `api_key` si secret dédié non distinct |

**Webhook URL** : l’autre équipe fournit `https://leur-domaine/.../webhooks/afrisoft-payments`. Ops pose :

```bash
# Sur le VPS /opt/afrisoft-pay/.env
AFRISOFT_HUB_WEBHOOK_URL_EDUCONGO=https://…
# puis recreate du conteneur payment
```

Sans cette URL, C2B/B2C marchent (création + poll GET) ; les **notifications push** hub→app ne partent pas.

## 4. Nouvel `app_id`

```bash
ssh -i ~/.ssh/afrisoft_pay root@178.104.82.66
NEW_KEY=$(openssl rand -hex 24)
# Ajouter ,votreapp:$NEW_KEY à AFRISOFT_HUB_APPS
# Optionnel : AFRISOFT_HUB_WEBHOOK_SECRET_VOTREAPP=$NEW_KEY
# AFRISOFT_HUB_WEBHOOK_URL_VOTREAPP=https://…
chmod 600 /opt/afrisoft-pay/.env
cd /opt/afrisoft-pay && docker compose --profile hub up -d --force-recreate payment
```

Idéal : **même** `app_id` + clé que le hub SMS si l’app utilise les deux hubs.

## 5. Canal de remise

Envoyer le `.env` rempli via 1Password / Signal / e-mail chiffré.  
**Pas** GitHub, **pas** le docx public, **pas** `pay.json` dans le dépôt.

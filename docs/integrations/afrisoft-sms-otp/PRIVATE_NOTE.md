# Note privée — remplir et transmettre les clés (ops AfriSoft)

Ce fichier **n’a pas de secrets**. Il décrit comment coller les valeurs **en local** puis les envoyer à l’autre équipe.

## 1. Extraire les noms (déjà fait)

Variables présentes sur le VPS `/opt/afrisoft-sms/.env` (noms seuls, septembre 2026) :

`AFRISOFT_HUB_APPS`, `APP_BRAND_NAMES`, `SMS_PROVIDER`, `SMS_IMAGE`, `CORS_ORIGIN`,  
`OTP_TTL_SEC`, `OTP_MAX_ATTEMPTS`, `OTP_COOLDOWN_SEC`, `OTP_PEPPER`,  
`MOCK_OTP`, `MOCK_RETURN_CODE`, `MOCK_FIXED_OTP`, `MOCK_OTP_CODE`,  
`SERDIPAY_SMS_*`, `AFRICAS_TALKING_*`

## 2. Ce que l’autre app doit recevoir

Uniquement **trois** valeurs, copiées dans `env.example` → `.env` **sur votre machine**, pas dans git :

| Coller dans | Copier depuis le VPS |
|-------------|----------------------|
| `AFRISOFT_SMS_HUB_URL` | `https://sms.afri-soft.com` (fixe) |
| `AFRISOFT_HUB_APP_ID` | partie gauche d’une entrée `AFRISOFT_HUB_APPS` |
| `AFRISOFT_HUB_API_KEY` | partie droite de **cette** entrée (`app_id:api_key`) |

Commande **noms uniquement** (ne pas dumper les valeurs dans un ticket) :

```bash
ssh -i ~/.ssh/afrisoft_pay root@178.104.82.66 \
  "grep -E '^[A-Za-z_][A-Za-z0-9_]*=' /opt/afrisoft-sms/.env | cut -d= -f1"
```

Pour lire `AFRISOFT_HUB_APPS` : SSH interactif, `grep AFRISOFT_HUB_APPS /opt/afrisoft-sms/.env`, copier la paire utile dans le `.env` local.

**Nouvel `app_id` (recommandé)** — ne pas réutiliser `senga` :

```bash
NEW_KEY=$(openssl rand -hex 32)
# Ajouter ,votreapp:$NEW_KEY à AFRISOFT_HUB_APPS
# Ajouter ,votreapp:VotreMarque à APP_BRAND_NAMES (si /v1/otp/send)
# chmod 600 .env && docker compose --profile hub up -d
```

## 3. Canal de remise

Envoyer le **fichier `.env` rempli** (ou les 3 lignes) via :

- 1Password / Bitwarden (partage chiffré), **ou**
- Signal / e-mail chiffré / clé USB chiffrée

**Pas** GitHub, **pas** Slack / Teams public, **pas** ce dépôt, **pas** `sms.json` / `pay.json` untracked.

## 4. Après envoi

- Ne pas committer le `.env` rempli.
- Ne pas coller `SERDIPAY_*` ni `AFRICAS_TALKING_*` dans le fichier destiné à l’autre app.
- L’autre équipe suit [README.md](./README.md) §1 (OTP local + `POST /v1/sms/send`).

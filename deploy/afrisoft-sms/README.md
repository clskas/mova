# AfriSoft SMS / OTP Hub — VPS scaffold

Host: `178.104.82.66` (Hetzner) — same VPS as `pay.afri-soft.com`.

## Layout

- `/opt/afrisoft-sms/docker-compose.yml` — dedicated redis + sms hub
- `/opt/afrisoft-sms/.env` — secrets (chmod 600; not in git)
- Caddy site `sms.afri-soft.com` → `127.0.0.1:3001`

## Contract

- Doc: `docs/AFRISOFT_SMS_OTP_HUB_API.md`
- App: `services/sms-hub-service` · image: `docker/sms.Dockerfile`
- Endpoints: `GET /health`, `POST /v1/otp/send`, `POST /v1/otp/verify`, `POST /v1/sms/send`

## MOCK bootstrap

Until Africa’s Talking Sender ID / SerdiPay SMS keys are ready:

```env
SMS_PROVIDER=mock
MOCK_RETURN_CODE=true
MOCK_FIXED_OTP=true
MOCK_OTP_CODE=123456
```

When SerdiPay SMS keys are in `/opt/afrisoft-sms/.env`:

```env
SMS_PROVIDER=serdipay
MOCK_OTP=false
MOCK_RETURN_CODE=false
MOCK_FIXED_OTP=false
SERDIPAY_SMS_BASE_URL=https://apis.serdipay.com
SERDIPAY_SMS_SENDER_ID=SerdiPay
```

OTP codes are logged in the container; with `MOCK_RETURN_CODE=true` the API also returns `debug_code` (disable when going live).

## DNS (Cloudflare)

1. DNS → Records → Add / edit **A**
2. Name: `sms`
3. IPv4: `178.104.82.66`
4. Proxy status: **DNS only** (grey cloud) — same as `pay`
5. Save

## Commands

```bash
cd /opt/afrisoft-sms
cp .env.example .env && chmod 600 .env
# edit secrets…
docker compose --profile hub up -d
curl -sS http://127.0.0.1:3001/health
```

## Déploiement automatique (CI)

Le job `deploy-sms-hub` de `.github/workflows/deploy.yml` déploie le hub SMS après chaque
déploiement Render de `main`, juste après le hub de paiement :

1. il ne fait **rien** si les sources du hub (`docker/sms.Dockerfile`, `packages/shared`,
   `services/sms-hub-service`) n'ont pas changé depuis le dernier déploiement — le hub n'est
   donc pas redémarré à chaque fusion ;
2. il construit une image candidate (le conteneur en service n'est pas touché) ;
3. il bascule, puis contrôle `/health` : Redis connecté **et** même fournisseur SMS qu'avant
   (jamais de retour silencieux au mode `mock`) ;
4. sinon, **retour automatique** à l'image précédente.

Il utilise une clé SSH dédiée, **limitée à un seul script** sur le VPS (`command=` forcé). Elle ne
donne pas de shell. Tant que le secret `SMS_HUB_DEPLOY_SSH_KEY` n'existe pas, le job ne fait
qu'afficher un avertissement. Mise en place, une seule fois, depuis un poste qui a déjà
`~/.ssh/afrisoft_pay`, à la racine du dépôt Mova :

```bash
scp -i ~/.ssh/afrisoft_pay deploy/afrisoft-sms/scripts/ci-deploy.sh root@178.104.82.66:/opt/afrisoft-sms/scripts/ci-deploy.sh
ssh -i ~/.ssh/afrisoft_pay root@178.104.82.66 "chmod 700 /opt/afrisoft-sms/scripts/ci-deploy.sh"
ssh-keygen -t ed25519 -N "" -C senga-ci-sms-deploy -f ~/.ssh/senga_ci_sms
ssh -i ~/.ssh/afrisoft_pay root@178.104.82.66 "echo 'command=\"/opt/afrisoft-sms/scripts/ci-deploy.sh\",no-pty,no-port-forwarding,no-agent-forwarding,no-X11-forwarding $(cat ~/.ssh/senga_ci_sms.pub)' >> /root/.ssh/authorized_keys"
gh secret set SMS_HUB_DEPLOY_SSH_KEY --repo clskas/mova < ~/.ssh/senga_ci_sms
```

`HUB_SSH_KNOWN_HOSTS` (déjà créé pour le hub de paiement) est réutilisé.

Le script installé sur le VPS (`/opt/afrisoft-sms/scripts/ci-deploy.sh`) est la copie de
`deploy/afrisoft-sms/scripts/ci-deploy.sh` : recopiez-le après chaque modification.
Retour arrière manuel : `docker images afrisoft-sms/hub` liste les images `pre-<date>`.

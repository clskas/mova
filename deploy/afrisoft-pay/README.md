# AfriSoft Payment Hub — VPS scaffold

Host: `178.104.82.66` (Hetzner) — SerdiPay **must** whitelist this outbound IP.

This is **not** a Render service. `mova-payment` on Render is the SENGA wallet/orchestration API. Live Mobile Money charges (`SERDIPAY_*`) belong **only** here.

## Layout

- `/opt/afrisoft-pay/docker-compose.yml` — postgres + redis + payment
- `/opt/afrisoft-pay/.env` — secrets (`chmod 600`; never in git)
- `/opt/afrisoft-pay/caddy/Caddyfile` — HTTPS reverse proxy (system Caddy → `127.0.0.1:3000`)
- `/opt/afrisoft-pay/scripts/deploy-from-repo.sh` — build from Mova monorepo

Public:

- Domain: `https://pay.afri-soft.com`
- Health: `GET /health` (200)
- SerdiPay callback: `POST /webhooks/serdipay` → Nest `/api/payments/webhooks/serdipay`

## Align with repo / API contract

- App code: `services/payment-service` (Nest), image: `docker/payment.Dockerfile`
- Shared SerdiPay client: `packages/shared/src/serdipay.ts`
- Contract: `docs/AFRISOFT_PAYMENT_HUB_API.md`

GitHub Actions / Render `mova-external-apis` copies of `SERDIPAY_*` **do not** satisfy the SerdiPay IP whitelist. Put merchant keys in `/opt/afrisoft-pay/.env`.

## Put SerdiPay keys on the VPS

```bash
ssh -i ~/.ssh/afrisoft_pay root@178.104.82.66
cd /opt/afrisoft-pay
nano .env    # chmod 600 ; never commit
```

Fill (no placeholders from the SerdiPay PDF):

```env
MOCK_PAYMENTS=false
MOBILE_MONEY_GATEWAY=serdipay
SERDIPAY_BASE_URL=https://apis.serdipay.com
SERDIPAY_EMAIL=
SERDIPAY_PASSWORD=
SERDIPAY_API_ID=
SERDIPAY_API_PASSWORD=
SERDIPAY_MERCHANT_CODE=
SERDIPAY_MERCHANT_PIN=
SERDIPAY_WEBHOOK_SECRET=
```

Then recreate the payment container so it reloads `env_file`:

```bash
cd /opt/afrisoft-pay
docker compose --profile hub up -d --force-recreate payment
docker exec afrisoft-pay-payment printenv MOCK_PAYMENTS
curl -sS https://pay.afri-soft.com/health
```

Verify key **names** only (do not print values):

```bash
docker exec afrisoft-pay-payment sh -c 'for k in SERDIPAY_EMAIL SERDIPAY_PASSWORD SERDIPAY_API_ID SERDIPAY_API_PASSWORD SERDIPAY_MERCHANT_CODE SERDIPAY_MERCHANT_PIN; do eval v=\$$k; if [ -n "$v" ]; then echo "$k=SET"; else echo "$k=EMPTY"; fi; done'
```

## Commands (first install)

```bash
cd /opt/afrisoft-pay
cp .env.example .env && chmod 600 .env
docker compose --profile infra up -d
# after image build:
docker compose --profile hub up -d
```

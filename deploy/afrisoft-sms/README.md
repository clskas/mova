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

# UptimeRobot — surveillance SENGA / AfriSoft

Guide pratique pour un compte UptimeRobot **déjà créé**. Objectif : alerter si un site ou une API publique tombe, **toutes les 5 minutes**.

Les sondes `/health` renvoient du JSON avec `"status":"ok"` quand le process (et, selon le service, la base) est joignable.

## 1. Moniteurs à créer

Type recommandé : **HTTPS Keyword** (mot-clé dans le corps) + code HTTP **200**.

| Nom | URL | Mot-clé | Notes |
|-----|-----|---------|--------|
| SENGA web | `https://senga.afri-soft.com` | `SENGA` (ou laisser Keyword vide et utiliser HTTP 200) | Page marketing / app web |
| SENGA admin | `https://admin.afri-soft.com` | `SENGA` | Portail admin |
| Restaurant | `https://restaurant.afri-soft.com` | `SENGA` | Portail restaurant |
| Location | `https://rental.afri-soft.com` | `SENGA` | Portail location |
| API gateway | `https://api.afri-soft.com/health` | `"status":"ok"` | Liveness+dépendances. Si trop d’alertes « degraded », utiliser `https://api.afri-soft.com/health/live` |
| Hub paiements | `https://pay.afri-soft.com/health` | `"status":"ok"` | VPS `afrisoft-pay` |
| Hub SMS | `https://sms.afri-soft.com/health` | `"status":"ok"` | Hub OTP (MOCK jusqu’aux clés SMS) |

**Intervalle :** 5 minutes (plan gratuit : 5 min est le plus fréquent).

**Chemin gateway :** `GET /health` est le bon endpoint public (préfixe Nest `api` exclu pour `health`). `GET /health/live` ne teste que le process gateway, sans les microservices Render.

## 2. Créer un moniteur (clics)

1. Ouvrir [https://uptimerobot.com/dashboard](https://uptimerobot.com/dashboard) et se connecter.
2. **Add New Monitor**.
3. **Monitor Type** : `Keyword` (HTTPS).
4. **Friendly Name** : ex. `SENGA API /health`.
5. **URL** : coller une URL du tableau ci-dessus (`https://…`).
6. **Keyword Type** : `Exists`.
7. **Keyword Value** : `"status":"ok"` pour les `/health`, ou `SENGA` pour les sites.
8. **Monitoring Interval** : `5 minutes`.
9. **Alert Contacts To Notify** : cocher l’e-mail du compte. Pour le SMS : **My Settings → Alert Contacts → Add Alert Contact → SMS**, puis l’associer au moniteur.
10. **Create Monitor**.
11. Répéter pour les **7 URLs**.

Option HTTP 200 seul (sites web) : type **HTTPS(s)** au lieu de Keyword, même URL, intervalle 5 min.

## 3. Alertes e-mail / SMS

- E-mail : contact par défaut à la création du compte — cocher sur chaque moniteur.
- SMS : **My Settings → Alert Contacts → Add Alert Contact → SMS** (crédits selon l’offre). Ajouter le numéro RDC au format international (`+243…`).
- Tester : **Monitors → le moniteur → Send Test Notification**.

## 4. Page de statut (optionnel)

1. **Status Pages** (menu gauche) → **Add Status Page**.
2. Nom public : ex. `Statut AfriSoft / SENGA`.
3. Ajouter les 7 moniteurs.
4. Publier le lien (sous-domaine UptimeRobot, ou CNAME si plan payant).

Utile pour le support : un lien unique au lieu d’ouvrir le dashboard.

## 5. Après une alerte

| Moniteur down | Où regarder |
|---------------|-------------|
| `senga` / `admin` / `restaurant` / `rental` | Render (front Next.js) |
| `api.afri-soft.com/health` | Gateway Render + services `mova-*` |
| `pay.afri-soft.com/health` | VPS `178.104.82.66` — `docker ps` / Caddy |
| `sms.afri-soft.com/health` | VPS hub SMS (Redis) |

Ne pas coller d’URL de base avec mot de passe dans UptimeRobot : uniquement les URLs HTTPS publiques ci-dessus.

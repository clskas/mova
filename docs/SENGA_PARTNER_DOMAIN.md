# Domaine portail commerce — `sengapartner.afri-soft.com`

Le portail Next.js `mova-restaurant` (restaurant, pharmacie, supermarché, boutique)
utilise le domaine canonique **https://sengapartner.afri-soft.com**.

L’ancien hôte **https://restaurant.afri-soft.com** redirige en **301** vers le nouveau
(via `restaurant/src/middleware.ts`) tant que le DNS legacy pointe encore vers le même service.

Le portail location reste séparé : **https://rental.afri-soft.com**.

## Checklist ops (à faire hors repo)

### 1. DNS (zone `afri-soft.com`)

| Enregistrement | Type | Cible |
|----------------|------|--------|
| `sengapartner` | CNAME | `mova-restaurant.onrender.com` (ou cible Render indiquée au moment de l’ajout du custom domain) |
| `restaurant` | CNAME | **même cible** (garder pour 301 + favoris) |

### 2. Render — service `mova-restaurant`

1. **Settings → Custom Domains** → ajouter `sengapartner.afri-soft.com`
2. Valider le certificat TLS
3. Garder `restaurant.afri-soft.com` tant que la redirection 301 est utile
4. Vérifier : `https://sengapartner.afri-soft.com/login` et `https://restaurant.afri-soft.com/login` (doit rediriger)

### 3. CORS gateway (`CORS_ORIGIN` sur Render / `render.yaml`)

Inclure les deux origines pendant la transition :

```text
…,https://sengapartner.afri-soft.com,https://restaurant.afri-soft.com,…
```

Après migration complète des favoris, on pourra retirer `restaurant.afri-soft.com`.

### 4. Google Cloud Console (OAuth Web client)

Pour le client ID utilisé par le portail commerce (`NEXT_PUBLIC_GOOGLE_CLIENT_ID`) :

- **Authorized JavaScript origins** : `https://sengapartner.afri-soft.com` (+ garder l’ancien un temps)
- **Authorized redirect URIs** : idem si des URIs exactes sont listées

### 5. UptimeRobot

Mettre à jour (ou dupliquer) le moniteur « Restaurant » vers `https://sengapartner.afri-soft.com`.

### 6. Vérifications smoke

- [ ] Login Google sur le nouveau domaine
- [ ] Login téléphone / e-mail OTP (lien mail pointe vers `sengapartner…`)
- [ ] Appels API depuis le navigateur (pas d’erreur CORS)
- [ ] 301 : `curl -I https://restaurant.afri-soft.com/login` → `Location: https://sengapartner.afri-soft.com/login`

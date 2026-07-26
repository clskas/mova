# Intégration IA — SENGA RDC

Guide concis des cas d’usage IA compatibles avec l’architecture microservices SENGA (gateway NestJS + 7 services).

## Configuration des clés API

Toutes les clés IA se configurent **côté serveur** dans :

```
config/external-apis.env
```

(copiez depuis `config/external-apis.env.example`)

| Variable | Usage |
|----------|--------|
| `OPENAI_API_KEY` | OpenAI API (ChatGPT) |
| `OPENAI_MODEL` | Modèle, ex. `gpt-4o-mini` |
| `AZURE_OPENAI_ENDPOINT` | URL ressource Azure OpenAI |
| `AZURE_OPENAI_API_KEY` | Clé Azure |
| `AZURE_OPENAI_DEPLOYMENT` | Nom du déploiement (ex. `gpt-4o`) |
| `AI_ENABLED` | `true` pour activer les routes IA |

**Ne jamais** mettre ces clés dans l'app mobile (`--dart-define`) ni dans le dépôt Git.

Après modification : redémarrer les services Docker concernés (`docker compose up -d`).

## État actuel

SENGA n’intègre pas encore de modèle IA en production. Les briques existantes facilitent l’ajout :

| Domaine | Implémentation actuelle | Piste IA |
|---------|-------------------------|----------|
| OTP / SMS | Twilio (`auth-service`) | Twilio Verify déjà supporté |
| Matching chauffeur | Score pondéré proximité/note (`driver-service`) | Optimisation ML sur historique |
| Tarification | Règles CDF par ville (`ride-service`) | Pricing dynamique (surge) |
| KYC | Upload documents + revue admin | OCR + détection fraude documentaire |
| Support | FAQ in-app (`mobile/lib/features/help`) | Assistant conversationnel |
| Géolocalisation | Mapbox, haversine, WebSocket `/tracking` | ETA prédictif |

## Cas d’usage recommandés (par priorité)

### 1. Assistant support in-app (court terme)

- **Besoin** : réponses FR sur zones RDC, tarifs, OTP, paiements mobile money.
- **Stack** : Azure OpenAI ou OpenAI API via un **nouveau module** dans `admin-service` ou microservice `ai-service` derrière le gateway.
- **Pourquoi** : faible risque, pas de données sensibles temps réel, grounding sur `docs/user-manual/` et CGU.

### 2. OCR KYC chauffeur (moyen terme)

- **Besoin** : extraire nom, numéro permis, dates depuis photos uploadées (`driver-service`).
- **Stack** : Azure Document Intelligence ou Google Vision ; stockage photos via Cloudinary (déjà prévu dans `external-apis.env.example`).
- **Flux** : `driver-service` → file d’attente Redis → worker OCR → score confiance → file admin KYC.

### 3. ETA et demande (moyen terme)

- **Besoin** : ETA plus fiable que haversine seul ; anticiper pics (événements, pluie Kinshasa).
- **Stack** : modèle léger (régression / gradient boosting) entraîné sur historique `ride-service` ; inférence batch ou API dédiée.
- **Alternative on-device** : peu pertinent pour ETA serveur ; garder le calcul côté `ride-service`.

### 4. Matching et dispatch (long terme)

- **Besoin** : réduire temps d’attente dans les 32 zones.
- **Stack** : enrichir le score existant (`MARKET_RDC.matching`) avec features ML (heure, zone, acceptation historique).
- **Attention** : latence &lt; 500 ms — inférence synchrone dans `driver-service` ou cache Redis des scores.

### 5. Détection fraude (long terme)

- **Besoin** : comptes multiples, OTP abus, paiements annulés, trajets fantômes.
- **Stack** : règles + modèle anomaly sur `payment-service` / `auth-service` ; alertes admin.

### 6. Voix / support téléphonique (optionnel)

- **Stack** : Twilio ConversationRelay + LLM (webhook depuis gateway ou service dédié).
- **Cas** : ligne support +243, IVR « où est ma course ? ».

## Choix technologiques

| Option | Avantages SENGA | Inconvénients |
|--------|----------------|---------------|
| **Azure OpenAI** | Conformité entreprise, région EU possible, bon pour OCR Azure DI | Coût, config Azure |
| **OpenAI API** | Rapide à prototyper, bon FR | Données hors RDC à cadrer (RGPD / politique SENGA) |
| **Twilio AI** | Déjà Twilio pour OTP ; Verify + ConversationRelay | Moins adapté à matching/ETA |
| **On-device (Flutter)** | Offline, privacy | Limité (pas de gros LLM) ; utile pour suggestion adresses cache |

**Recommandation architecture** : exposer `POST /api/ai/chat` et `POST /internal/ai/ocr` via le **gateway**, secrets `AZURE_OPENAI_*` ou `OPENAI_API_KEY` dans `config/external-apis.env` (même pattern que Twilio). Ne pas embarquer les clés dans l’app mobile.

## Activer l'IA (checklist)

1. Copier `config/external-apis.env.example` → `config/external-apis.env`.
2. Renseigner `OPENAI_API_KEY=sk-...` (ou variables Azure).
3. Mettre `AI_ENABLED=true`.
4. Implémenter le module `ai-service` ou routes gateway (étapes ci-dessous).
5. L'app mobile appelle `POST /api/ai/chat` avec le JWT utilisateur — la clé ne quitte jamais le serveur.

## Prochaines étapes techniques

1. Créer `services/ai-service` (NestJS) ou module `AiModule` dans `admin-service`.
2. Variables documentées dans `config/external-apis.env.example`.
3. RAG minimal : indexer `docs/user-manual/*.md` en embeddings (pgvector sur une DB existante ou service managé).
4. Pilote : assistant FAQ passager/chauffeur en français (fr-CD).

Voir aussi : [architecture.md](./architecture.md), [PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md).

# SENGA Web PWA

Application passager Next.js 14 — couverture nationale RDC.

## Configuration

Copier `.env.example` vers `.env.local` :

```powershell
Copy-Item .env.example .env.local
```

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Passerelle API microservices (défaut `http://localhost:3000`) |

Toutes les routes API utilisent le préfixe `/api/...` sur la passerelle. Mode démo si la passerelle est indisponible.

## Démarrage

```powershell
npm install
npm run dev
```

Ouvrir [http://localhost:3001](http://localhost:3001) (ou le port affiché par Next.js).

## Build

```powershell
npm run build
```

Icônes PWA : `public/icon-192.png`, `public/icon-512.png` (source `movaicone`).

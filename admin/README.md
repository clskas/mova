# SENGA Admin

Console d'administration Next.js — couverture nationale RDC.

## Configuration

Copier `.env.example` vers `.env.local` :

```powershell
Copy-Item .env.example .env.local
```

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Passerelle API microservices (défaut `http://localhost:3000`) |

Toutes les routes admin passent par `/api/admin/...` sur la passerelle. Mode démo si indisponible.

## Démarrage

```powershell
npm install
npm run dev
```

## Build

```powershell
npm run build
```

Favicon : `src/app/icon.png` (source `movaicone`).

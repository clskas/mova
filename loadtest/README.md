# Test de charge SENGA (staging uniquement)

Simule sur le **staging** des chauffeurs qui envoient leur position GPS toutes les 8 s, des passagers
qui consultent les véhicules proches et les prix (1 sur 10 commande puis annule), et des connexions
en direct (`/tracking`). Le script refuse toute adresse qui n'est pas celle du staging.

## Préparer une seule fois

1. Choisir une clé secrète d'au moins 24 caractères (lettres et chiffres).
2. Render → **mova-stg-gateway** → Environment : ajouter `LOAD_TEST_KEY` = cette clé.
   (Ne jamais l'ajouter à `mova-gateway`, la production ; elle y serait de toute façon ignorée.)
3. GitHub → Settings → Secrets and variables → Actions : ajouter le secret `LOAD_TEST_KEY` = la même clé.

## Lancer

GitHub → Actions → **Load Test Staging** → Run workflow, avec par exemple :

| Palier | Chauffeurs | Passagers | Connexions | Durée |
|---|---|---|---|---|
| 1 — lancement | 200 | 50 | 100 | 5m |
| 2 — plusieurs villes | 1000 | 200 | 500 | 10m |
| 3 — national | 3000 | 600 | 1500 | 10m |

Monter d'un palier seulement si le précédent passe. Le résumé (`load-test-summary`) donne les temps
de réponse (p95) et le taux d'erreurs ; le test échoue si plus de 2 % des requêtes échouent ou si
95 % des réponses dépassent 1,5 s.

Le staging tourne sur les plus petites formules : ses limites ne sont pas celles de la production,
mais il montre où le système casse en premier (base, passerelle, service des courses). Les comptes
de test créés (`+243981…`) restent dans la base du staging.

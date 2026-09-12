# SENGA Business (portail partenaire)

Portail web : [restaurant.afri-soft.com](https://restaurant.afri-soft.com)

Le portail **SENGA Business** sert les partenaires **restaurant**, **supermarché**, **pharmacie** et **boutique**. L’interface (menus, libellés, pages) s’adapte au type de commerce (`commerceType`) défini à la création du magasin dans l’admin.

## Connexion et PIN

1. Ouvrez [restaurant.afri-soft.com](https://restaurant.afri-soft.com).
2. Saisissez votre **téléphone +243 ou e-mail**, puis le **Code PIN (reçu par e-mail / SMS)** — 6 chiffres.
3. Première visite avant KYC : code SMS ou Continuer avec Google, puis **Mon dossier**.
4. Après **Approuver** dans l’admin KYC, le PIN part par SMS et/ou e-mail. Un compte déjà lié à Google peut aussi se connecter avec ce PIN.
5. Si l’e-mail n’est pas dans la boîte, ouvrez **Spam**. L’admin n’a que la preuve SMTP (accepté), pas l’arrivée Gmail.

## Manuel dans le portail

**Aide → Manuel utilisateur**, ou le menu **Manuel utilisateur**.

## Types de commerce

| Type | Ce que voit le partenaire | Côté passager (app SENGA) |
|------|---------------------------|---------------------------|
| **Restaurant** | Menu (plats, tailles, options) | Filtre Restaurants, menu avec tailles/options |
| **Supermarché** | Catalogue, Stock, Restrictions | Filtre Supermarchés, catalogue produits |
| **Pharmacie** | Catalogue, Stock, Restrictions (ordonnance) | Filtre Pharmacies ; mention ordonnance si requis |
| **Boutique** | Catalogue, Stock, Restrictions (âge) | Filtre Boutiques |

Le type est fixé par l’équipe SENGA à la création / édition du magasin (console admin → **Restaurants** → type de commerce). Contactez le support pour le changer.

## Menu (restaurants)

1. Ouvrez **Menu**.
2. Ajoutez un plat : nom, prix en **CDF**, description, photo.
3. Optionnel : **tailles** (ex. Petite / Grande avec prix) et **groupes d’options** (ex. extras).
4. Publiez pour que les articles apparaissent dans l’app passager.

Le dossier KYC doit être validé avant de publier.

## Catalogue (supermarché, pharmacie, boutique)

1. Ouvrez **Catalogue**.
2. Créez des **catégories** (ex. Épicerie, Soins).
3. Ajoutez des **produits** : nom, prix CDF, catégorie, photo, description.
4. Pour une pharmacie : cochez **Ordonnance requise** si besoin.
5. Pour l’âge : cochez **Restriction d’âge** si le produit est réservé aux adultes.
6. **Publier le catalogue** — visible immédiatement côté passager après enregistrement.

## Stock

Disponible pour supermarché, pharmacie et boutique.

1. Ouvrez **Stock**.
2. Indiquez la quantité pour chaque produit (laissez vide = stock illimité).
3. Enregistrez. Un stock à **0** bloque l’ajout au panier côté passager.

## Restrictions

Disponible pour supermarché, pharmacie et boutique.

1. Ouvrez **Restrictions**.
2. Activez **âge minimum** et/ou **ordonnance** par produit.
3. Enregistrez. Le passager voit un avertissement et doit confirmer avant d’ajouter au panier.

## Exploitation quotidienne

- **Commandes** : préparer, suivre, accepter.
- **Paramètres** : livreurs SENGA, internes ou mixte ; localisation du magasin.
- **Revenus** : encaissements en CDF.

Vous êtes payé à l’enlèvement. Un livreur SENGA est payé après le PIN client.

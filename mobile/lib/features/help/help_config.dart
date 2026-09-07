/// Configuration partagée du centre d'aide SENGA (RDC).
class HelpConfig {
  static const hubTitle = "Centre d'aide SENGA";
}

class FaqItem {
  const FaqItem({required this.question, required this.answer});

  final String question;
  final String answer;
}

const kFaqItems = <FaqItem>[
  FaqItem(
    question: 'Comment créer un compte SENGA ?',
    answer:
        'Saisissez votre numéro au format +243 suivi de 9 chiffres, puis entrez le code OTP reçu par SMS — ou continuez avec Google. Aucun mot de passe n\'est requis.',
  ),
  FaqItem(
    question: 'Puis-je lier mon numéro et Google ?',
    answer:
        'Oui, c\'est optionnel. Dans Connexion (profil), liez Google ou votre +243. Vous pouvez aussi rester téléphone seul ou Google seul — un seul portefeuille si les deux sont liés.',
  ),
  FaqItem(
    question: 'Je n\'ai pas reçu le code OTP, que faire ?',
    answer:
        'Vérifiez votre réseau (Orange, Vodacom, Airtel). Attendez 60 secondes puis demandez un nouveau code. Si le problème persiste, ouvrez Aide → Contacter le support.',
  ),
  FaqItem(
    question: 'Quels moyens de paiement sont acceptés ?',
    answer:
        'Orange Money, M-Pesa (Vodacom), Airtel Money, le portefeuille SENGA et les espèces (selon le service). Tous les montants sont en francs congolais (CDF).',
  ),
  FaqItem(
    question: 'Comment recharger mon portefeuille SENGA ?',
    answer:
        'Ouvrez Wallet SENGA, appuyez sur Recharger, choisissez votre opérateur mobile money et suivez les instructions USSD ou l\'écran de confirmation.',
  ),
  FaqItem(
    question: 'Le prix affiché est-il définitif ?',
    answer:
        'Oui. Le prix que vous voyez avant de confirmer est le prix facturé. Ce n\'est pas un compteur qui augmente pendant le trajet.',
  ),
  FaqItem(
    question: 'Comment annuler une course ou une livraison ?',
    answer:
        'Avant confirmation : annulation gratuite. Après affectation d\'un chauffeur : des frais peuvent s\'appliquer selon le délai. Consultez le message affiché avant validation.',
  ),
  FaqItem(
    question: 'Pourquoi le GPS ne fonctionne pas ?',
    answer:
        'Activez la localisation dans les paramètres de votre téléphone et autorisez SENGA. En intérieur ou sous tunnel, la position peut être approximative.',
  ),
  FaqItem(
    question: 'Dans quelles zones SENGA est-il disponible ?',
    answer:
        'SENGA est disponible dans 32 zones de service à travers la RDC (capitales provinciales et grandes villes). Choisissez votre ville sur l\'écran d\'accueil ou laissez le GPS détecter la zone la plus proche.',
  ),
  FaqItem(
    question: 'Comment suivre mon chauffeur ou livreur ?',
    answer:
        'Après confirmation, l\'écran de suivi affiche la position en temps réel, l\'ETA et les étapes (en route, arrivé, terminé).',
  ),
  FaqItem(
    question: 'Puis-je commander pour quelqu\'un d\'autre ?',
    answer:
        'Oui. Indiquez l\'adresse de livraison ou de prise en charge du bénéficiaire et, si besoin, son numéro de téléphone dans les instructions.',
  ),
  FaqItem(
    question: 'Que faire en cas de objet oublié dans le véhicule ?',
    answer:
        'Contactez immédiatement le support via Aide → Contacter le support en indiquant la date, l\'heure et le trajet concerné.',
  ),
  FaqItem(
    question: 'Comment noter un chauffeur ou livreur ?',
    answer:
        'À la fin de chaque prestation, une fenêtre de notation (1 à 5 étoiles) s\'affiche. Votre avis améliore la qualité du service.',
  ),
  FaqItem(
    question: 'La livraison express, c\'est quoi ?',
    answer:
        'Envoi urgent de petits colis en moins de 45 minutes dans les zones SENGA. Idéal pour documents, clés ou petits objets légers.',
  ),
  FaqItem(
    question: 'Comment fonctionne le covoiturage ?',
    answer:
        'Recherchez un trajet existant ou proposez le vôtre avec date, itinéraire et places disponibles. Le coût est partagé entre passagers.',
  ),
  FaqItem(
    question: 'Puis-je louer un véhicule sans chauffeur ?',
    answer:
        'La location SENGA propose voiture, SUV ou minibus avec ou sans chauffeur selon disponibilité. Une pièce d\'identité peut être demandée.',
  ),
  FaqItem(
    question: 'Comment demander un déménagement ?',
    answer:
        'Choisissez Déménagement, indiquez adresse de départ et d\'arrivée, volume estimé et options (manutention, étage). Un camion adapté vous est affecté.',
  ),
  FaqItem(
    question: 'Mes données personnelles sont-elles protégées ?',
    answer:
        'Oui. Consultez la Politique de confidentialité dans Aide. SENGA ne vend pas vos données. Pour le DPO, utilisez Aide → Contacter le support.',
  ),
  FaqItem(
    question: 'Comment supprimer mon compte ?',
    answer:
        'Envoyez une demande via Aide → Contacter le support. Votre historique sera traité conformément à la politique de conservation.',
  ),
  FaqItem(
    question: 'Le paiement mobile money a échoué, que faire ?',
    answer:
        'Vérifiez votre solde et réessayez. Si le débit a eu lieu sans confirmation SENGA, contactez votre opérateur puis le support via Aide avec la référence transaction.',
  ),
  FaqItem(
    question: 'Comment contacter le support ?',
    answer:
        'Ouvrez Aide → Contacter le support. Les coordonnées affichées sont celles publiées par AfriSoft.',
  ),
];

class ManualChapter {
  const ManualChapter({
    required this.id,
    required this.title,
    required this.icon,
    required this.steps,
    this.tip,
  });

  final String id;
  final String title;
  final String icon;
  final List<String> steps;
  final String? tip;
}

const kManualChapters = <ManualChapter>[
  ManualChapter(
    id: 'account',
    title: 'Connexion et code PIN',
    icon: '👤',
    steps: [
      'Ouvrez SENGA. Entrez votre numéro +243, ou continuez avec Google.',
      'Au premier accès, créez un code PIN à 6 chiffres.',
      'Les prochaines fois, ouvrez l\'app et saisissez ce PIN.',
      'Ne donnez jamais votre PIN de connexion à quelqu\'un.',
    ],
    tip: 'Si vous oubliez le PIN, reconnectez-vous par SMS pour en créer un autre.',
  ),
  ManualChapter(
    id: 'taxi',
    title: 'Taxi / Moto-taxi',
    icon: '🏍️',
    steps: [
      'Appuyez sur Taxi / Moto-taxi.',
      'Indiquez le départ et l\'arrivée. Vous pouvez aussi poser un pin sur la carte (appui long), puis « Utiliser cet emplacement ».',
      'Choisissez Moto ou Taxi (Standard, Confort ou VIP).',
      'Regardez le prix, puis confirmez.',
      'Suivez le chauffeur et payez le prix affiché (portefeuille, Mobile Money ou espèces).',
    ],
    tip: 'Le prix vu avant confirmation est le prix facturé. Il n\'y a pas de compteur qui augmente pendant le trajet.',
  ),
  ManualChapter(
    id: 'price',
    title: 'Le prix affiché',
    icon: '💵',
    steps: [
      'SENGA calcule le prix avant que vous confirmiez.',
      'Ce prix est bloqué : c\'est celui que vous payez.',
      'Ce n\'est pas un taxi à compteur qui change en route.',
    ],
  ),
  ManualChapter(
    id: 'parcel',
    title: 'Livraisons (colis et repas)',
    icon: '📦',
    steps: [
      'Appuyez sur Livraisons, puis colis ou repas.',
      'Indiquez l\'enlèvement et la livraison (ou choisissez un restaurant).',
      'Confirmez le prix affiché — c\'est le montant à payer.',
      'Suivez le livreur. Pour un colis, donnez le code PIN seulement quand vous avez bien reçu.',
    ],
  ),
  ManualChapter(
    id: 'wallet',
    title: 'Recharger le portefeuille',
    icon: '💳',
    steps: [
      'Ouvrez Wallet SENGA.',
      'Appuyez sur Recharger.',
      'Choisissez Orange Money, M-Pesa ou Airtel Money.',
      'Validez le paiement sur votre téléphone. Le solde apparaît en CDF.',
    ],
  ),
  ManualChapter(
    id: 'history',
    title: 'Historique',
    icon: '📋',
    steps: [
      'Ouvrez Historique depuis l\'accueil ou la navigation.',
      'Parcourez les onglets : Courses, Colis, Repas, Réservations, Courses & commissions.',
      'Appuyez sur une entrée pour voir le détail et le montant en CDF.',
    ],
  ),
  ManualChapter(
    id: 'scheduled',
    title: 'Réservation planifiée',
    icon: '📅',
    steps: [
      'Appuyez sur Réservation planifiée.',
      'Consultez vos réservations à venir en haut de l\'écran.',
      'Choisissez date et heure (jusqu\'à J+7).',
      'Indiquez la destination et le type de véhicule.',
      'Confirmez — un rappel vous sera envoyé avant le trajet.',
    ],
  ),
  ManualChapter(
    id: 'food',
    title: 'Livraison repas',
    icon: '🍽️',
    steps: [
      'Appuyez sur Livraison repas.',
      'Choisissez un restaurant partenaire dans votre ville.',
      'Ajoutez des plats au panier.',
      'Indiquez l\'adresse de livraison et validez.',
      'Suivez la livraison en temps réel.',
    ],
  ),
  ManualChapter(
    id: 'errand',
    title: 'Courses & commissions',
    icon: '🛒',
    steps: [
      'Appuyez sur Courses & commissions.',
      'Listez les articles à acheter (marché, pharmacie, supermarché).',
      'Indiquez le budget estimé et l\'adresse de livraison.',
      'Estimez le prix (course + livraison) et envoyez la liste.',
      'Le livreur vous contacte en cas d\'article indisponible.',
    ],
  ),
  ManualChapter(
    id: 'carpool',
    title: 'Covoiturage',
    icon: '🚗',
    steps: [
      'Appuyez sur Covoiturage.',
      'Onglet Rechercher : trouvez un trajet partagé et le prix par passager.',
      'Onglet Proposer : publiez votre trajet (départ, arrivée, places, horaire).',
      'Confirmez votre place ou attendez des passagers.',
    ],
    tip: 'Partagez le coût du carburant entre passagers — économies garanties.',
  ),
  ManualChapter(
    id: 'rental',
    title: 'Location véhicule',
    icon: '🚙',
    steps: [
      'Appuyez sur Location véhicule.',
      'Choisissez la durée (heure, journée, semaine).',
      'Sélectionnez voiture, SUV ou minibus selon vos besoins.',
      'Indiquez lieu de prise en charge (ex. Gombe, Ngaliema).',
      'Confirmez et récupérez le véhicule au point convenu.',
    ],
  ),
  ManualChapter(
    id: 'express',
    title: 'Livraison express',
    icon: '⚡',
    steps: [
      'Appuyez sur Livraison express.',
      'Indiquez enlèvement et livraison dans une zone SENGA.',
      'Décrivez le contenu (documents, clés, petit objet).',
      'Confirmez — livraison cible en moins de 45 minutes.',
      'Suivez le coursier en temps réel.',
    ],
    tip: 'Réservé aux petits colis légers. Pas de marchandises dangereuses.',
  ),
  ManualChapter(
    id: 'moving',
    title: 'Déménagement',
    icon: '🚚',
    steps: [
      'Appuyez sur Déménagement.',
      'Indiquez adresse de départ et d\'arrivée (commune, avenue, repère).',
      'Estimez le volume (studio, F2, F3, bureau).',
      'Ajoutez options : manutention, étage sans ascenseur.',
      'Confirmez — un camion et une équipe vous sont affectés.',
      'Suivez les étapes : chargement, transit, déchargement.',
    ],
  ),
];

const kDriverManualChapters = <ManualChapter>[
  ManualChapter(
    id: 'kyc',
    title: 'Dossier et documents',
    icon: '📁',
    steps: [
      'Ouvrez Mon dossier.',
      'Envoyez votre pièce d\'identité, votre permis et les papiers du véhicule.',
      'Attendez la validation SENGA avant de travailler.',
    ],
    tip: 'Sans dossier validé, vous ne pouvez pas vous mettre en ligne.',
  ),
  ManualChapter(
    id: 'vehicle',
    title: 'Type d\'engin',
    icon: '🛵',
    steps: [
      'Indiquez si vous roulez en moto, taxi, Confort ou VIP.',
      'Pour Confort et VIP, SENGA doit encore valider le type.',
      'Ensuite seulement, vous pouvez recevoir ces courses.',
    ],
  ),
  ManualChapter(
    id: 'pin',
    title: 'Connexion avec le PIN',
    icon: '🔐',
    steps: [
      'Après validation, créez ou utilisez votre code PIN à 6 chiffres.',
      'Ouvrez SENGA Driver et saisissez ce PIN.',
      'Ne donnez jamais votre PIN de connexion.',
    ],
  ),
  ManualChapter(
    id: 'online',
    title: 'Se mettre en ligne',
    icon: '🟢',
    steps: [
      'Sur l\'accueil, activez En ligne.',
      'Gardez le GPS allumé.',
      'Vous recevez alors les demandes près de vous.',
    ],
  ),
  ManualChapter(
    id: 'accept',
    title: 'Accepter une course',
    icon: '🚕',
    steps: [
      'Une demande arrive : acceptez ou refusez.',
      'Allez au point de départ indiqué.',
      'Suivez les étapes jusqu\'à la fin de la course.',
    ],
  ),
  ManualChapter(
    id: 'delivery-pin',
    title: 'PIN de livraison',
    icon: '📦',
    steps: [
      'Pour un colis ou un repas, le client a un code PIN.',
      'Il vous le donne seulement à la remise.',
      'Saisissez ce PIN quand le client a bien reçu.',
    ],
    tip: 'Ne demandez pas le PIN avant d\'être arrivé et d\'avoir remis le colis.',
  ),
  ManualChapter(
    id: 'earnings',
    title: 'Revenus',
    icon: '💰',
    steps: [
      'Ouvrez Revenus pour voir vos gains du jour en CDF.',
      'Consultez l\'historique des courses et livraisons.',
      'Vous pouvez demander un retrait quand le minimum est atteint.',
    ],
  ),
  ManualChapter(
    id: 'charter',
    title: 'Charte et CGU',
    icon: '📜',
    steps: [
      'La charte, ce sont les règles de conduite avec les clients (respect, sécurité).',
      'Les CGU, c\'est le contrat d\'utilisation de SENGA (compte, paiements, responsabilités).',
      'Les deux sont à accepter pour travailler.',
    ],
  ),
];

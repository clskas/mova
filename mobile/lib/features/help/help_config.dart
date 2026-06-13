/// Configuration partagée du centre d'aide MOVA (RDC).
class HelpConfig {
  static const hubTitle = "Centre d'aide MOVA";
  static const supportPhone = '+243 900 000 000';
  static const supportPhoneDial = '+243900000000';
  static const supportEmail = 'support@mova.cd';
  static const privacyEmail = 'privacy@mova.cd';
  static const whatsAppUrl = 'https://wa.me/243900000000';
  static const supportHours = 'Lun–Sam 8h–20h (Africa/Kinshasa)';
  static const supportAddress = 'Kinshasa, République Démocratique du Congo';
}

class FaqItem {
  const FaqItem({required this.question, required this.answer});

  final String question;
  final String answer;
}

const kFaqItems = <FaqItem>[
  FaqItem(
    question: 'Comment créer un compte MOVA ?',
    answer:
        'Saisissez votre numéro au format +243 suivi de 9 chiffres, puis entrez le code OTP reçu par SMS. Aucun mot de passe n\'est requis.',
  ),
  FaqItem(
    question: 'Je n\'ai pas reçu le code OTP, que faire ?',
    answer:
        'Vérifiez votre réseau (Orange, Vodacom, Airtel). Attendez 60 secondes puis demandez un nouveau code. Si le problème persiste, contactez support@mova.cd.',
  ),
  FaqItem(
    question: 'Quels moyens de paiement sont acceptés ?',
    answer:
        'Orange Money, M-Pesa (Vodacom), Airtel Money, le portefeuille MOVA et les espèces (selon le service). Tous les montants sont en francs congolais (CDF).',
  ),
  FaqItem(
    question: 'Comment recharger mon portefeuille MOVA ?',
    answer:
        'Ouvrez Wallet MOVA, appuyez sur Recharger, choisissez votre opérateur mobile money et suivez les instructions USSD ou l\'écran de confirmation.',
  ),
  FaqItem(
    question: 'Le prix affiché est-il définitif ?',
    answer:
        'Non, c\'est une estimation. Le montant final peut varier selon la distance réelle, le trafic de Kinshasa, les embouteillages ou les suppléments (nuit, pluie, etc.).',
  ),
  FaqItem(
    question: 'Comment annuler une course ou une livraison ?',
    answer:
        'Avant confirmation : annulation gratuite. Après affectation d\'un chauffeur : des frais peuvent s\'appliquer selon le délai. Consultez le message affiché avant validation.',
  ),
  FaqItem(
    question: 'Pourquoi le GPS ne fonctionne pas ?',
    answer:
        'Activez la localisation dans les paramètres de votre téléphone et autorisez MOVA. En intérieur ou sous tunnel, la position peut être approximative.',
  ),
  FaqItem(
    question: 'Dans quelles zones MOVA est-il disponible ?',
    answer:
        'Lancement à Kinshasa (toutes communes). Extension progressive vers Lubumbashi, Goma, Bukavu et d\'autres villes de RDC.',
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
        'Contactez immédiatement le support via WhatsApp +243 900 000 000 ou support@mova.cd en indiquant la date, l\'heure et le trajet concerné.',
  ),
  FaqItem(
    question: 'Comment noter un chauffeur ou livreur ?',
    answer:
        'À la fin de chaque prestation, une fenêtre de notation (1 à 5 étoiles) s\'affiche. Votre avis améliore la qualité du service.',
  ),
  FaqItem(
    question: 'La livraison express, c\'est quoi ?',
    answer:
        'Envoi urgent de petits colis en moins de 45 minutes à Kinshasa. Idéal pour documents, clés ou petits objets légers.',
  ),
  FaqItem(
    question: 'Comment fonctionne le covoiturage ?',
    answer:
        'Recherchez un trajet existant ou proposez le vôtre avec date, itinéraire et places disponibles. Le coût est partagé entre passagers.',
  ),
  FaqItem(
    question: 'Puis-je louer un véhicule sans chauffeur ?',
    answer:
        'La location MOVA propose voiture, SUV ou minibus avec ou sans chauffeur selon disponibilité. Une pièce d\'identité peut être demandée.',
  ),
  FaqItem(
    question: 'Comment demander un déménagement ?',
    answer:
        'Choisissez Déménagement, indiquez adresse de départ et d\'arrivée, volume estimé et options (manutention, étage). Un camion adapté vous est affecté.',
  ),
  FaqItem(
    question: 'Mes données personnelles sont-elles protégées ?',
    answer:
        'Oui. Consultez la Politique de confidentialité dans Aide. MOVA ne vend pas vos données. Contact DPO : privacy@mova.cd.',
  ),
  FaqItem(
    question: 'Comment supprimer mon compte ?',
    answer:
        'Envoyez une demande à privacy@mova.cd ou via WhatsApp support. Votre historique sera traité conformément à la politique de conservation.',
  ),
  FaqItem(
    question: 'Le paiement mobile money a échoué, que faire ?',
    answer:
        'Vérifiez votre solde et réessayez. Si le débit a eu lieu sans confirmation MOVA, contactez votre opérateur puis support@mova.cd avec la référence transaction.',
  ),
  FaqItem(
    question: 'Comment contacter le support ?',
    answer:
        'WhatsApp +243 900 000 000, e-mail support@mova.cd, du lundi au samedi 8h–20h (fuseau Africa/Kinshasa).',
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
    title: 'Créer un compte',
    icon: '👤',
    steps: [
      'Ouvrez MOVA Passager.',
      'Saisissez votre numéro +243 (9 chiffres après l\'indicatif).',
      'Entrez le code OTP reçu par SMS.',
      'Accédez à l\'écran d\'accueil avec tous les services.',
    ],
  ),
  ManualChapter(
    id: 'taxi',
    title: 'Taxi / Moto-taxi',
    icon: '🏍️',
    steps: [
      'Appuyez sur Taxi / Moto-taxi.',
      'Indiquez votre position (GPS ou saisie manuelle) et la destination (ex. Gombe, Limete, Masina).',
      'Choisissez Moto-taxi, Standard, Confort ou VIP.',
      'Appuyez sur Estimer le prix puis Confirmer la course.',
      'Suivez le chauffeur en temps réel et payez à l\'arrivée ou via Wallet.',
    ],
    tip: 'En heure de pointe à Kinshasa, prévoyez un délai supplémentaire.',
  ),
  ManualChapter(
    id: 'parcel',
    title: 'Livraison colis',
    icon: '📦',
    steps: [
      'Appuyez sur Livraison colis.',
      'Renseignez l\'adresse d\'enlèvement et de livraison.',
      'Sélectionnez la catégorie de poids du colis.',
      'Ajoutez une photo et des instructions (optionnel).',
      'Estimez, confirmez et suivez le livreur.',
    ],
  ),
  ManualChapter(
    id: 'wallet',
    title: 'Wallet MOVA',
    icon: '💳',
    steps: [
      'Ouvrez Wallet MOVA depuis l\'accueil ou la barre de navigation.',
      'Consultez votre solde en CDF.',
      'Rechargez via Orange Money, M-Pesa ou Airtel Money.',
      'Payez vos courses directement depuis le portefeuille.',
      'Consultez l\'historique des transactions.',
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
      'Choisissez un restaurant partenaire à Kinshasa.',
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
      'Indiquez enlèvement et livraison (Kinshasa).',
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

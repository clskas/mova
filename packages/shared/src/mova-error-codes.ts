export enum MovaErrorCode {
  AUTH_INVALID_OTP = 'MOVA_AUTH_001',
  AUTH_EXPIRED_OTP = 'MOVA_AUTH_002',
  AUTH_UNAUTHORIZED = 'MOVA_AUTH_003',
  AUTH_INVALID_PHONE = 'MOVA_AUTH_004',
  AUTH_FORBIDDEN = 'MOVA_AUTH_005',
  AUTH_INVALID_PIN = 'MOVA_AUTH_006',
  AUTH_PIN_LOCKED = 'MOVA_AUTH_007',
  AUTH_PIN_NOT_SET = 'MOVA_AUTH_008',
  AUTH_INVALID_GOOGLE = 'MOVA_AUTH_009',
  AUTH_IDENTITY_TAKEN = 'MOVA_AUTH_010',

  RIDE_NOT_FOUND = 'MOVA_RIDE_001',
  RIDE_INVALID_STATUS = 'MOVA_RIDE_002',
  RIDE_NO_DRIVERS = 'MOVA_RIDE_003',
  RIDE_ALREADY_ACTIVE = 'MOVA_RIDE_004',
  RIDE_ACCEPT_TIMEOUT = 'MOVA_RIDE_005',
  RIDE_ALREADY_RATED = 'MOVA_RIDE_010',
  RIDE_INVALID_TRANSITION = 'MOVA_RIDE_011',
  RIDE_UNPAID_PENDING = 'MOVA_RIDE_012',
  SCHEDULED_RIDE_NOT_FOUND = 'MOVA_RIDE_006',
  SCHEDULED_RIDE_TOO_FAR = 'MOVA_RIDE_007',
  SCHEDULED_RIDE_PAST = 'MOVA_RIDE_008',
  SCHEDULED_RIDE_INVALID_STATUS = 'MOVA_RIDE_009',

  DELIVERY_NOT_FOUND = 'MOVA_DEL_001',
  DELIVERY_INVALID_STATUS = 'MOVA_DEL_002',
  RESTAURANT_NOT_FOUND = 'MOVA_DEL_003',

  CARPOOL_NOT_FOUND = 'MOVA_CAR_001',
  CARPOOL_NO_SEATS = 'MOVA_CAR_002',
  CARPOOL_ALREADY_JOINED = 'MOVA_CAR_003',
  CARPOOL_PUBLISH_DRIVER_ONLY = 'MOVA_CAR_004',

  ERRAND_NOT_FOUND = 'MOVA_ERR_001',
  ERRAND_INVALID_STATUS = 'MOVA_ERR_002',

  RENTAL_INQUIRY_NOT_FOUND = 'MOVA_REN_001',
  RENTAL_VEHICLE_NOT_FOUND = 'MOVA_REN_002',

  MOVING_NOT_FOUND = 'MOVA_MOV_001',
  MOVING_INVALID_STATUS = 'MOVA_MOV_002',

  PAYMENT_FAILED = 'MOVA_PAY_001',
  PAYMENT_INSUFFICIENT_BALANCE = 'MOVA_PAY_002',
  PAYMENT_INVALID_METHOD = 'MOVA_PAY_003',
  PAYMENT_PHONE_REQUIRED = 'MOVA_PAY_004',

  USER_NOT_FOUND = 'MOVA_USER_001',
  DRIVER_NOT_AVAILABLE = 'MOVA_DRIVER_001',
  DRIVER_KYC_PENDING = 'MOVA_DRIVER_002',
  DRIVER_DOCUMENTS_EXPIRED = 'MOVA_DRIVER_003',

  VALIDATION_ERROR = 'MOVA_VAL_001',
  NOT_FOUND = 'MOVA_VAL_002',
  PRICING_NOT_CONFIGURED = 'MOVA_VAL_003',
  PROMO_NOT_FOUND = 'MOVA_VAL_004',
  PROMO_INVALID = 'MOVA_VAL_005',
  SUBSCRIPTION_NOT_FOUND = 'MOVA_VAL_006',
  CITY_INACTIVE = 'MOVA_VAL_007',
  INTERNAL_ERROR = 'MOVA_INT_001',
}

export const MOVA_ERROR_MESSAGES: Record<MovaErrorCode, string> = {
  [MovaErrorCode.AUTH_INVALID_OTP]: 'Code OTP invalide. Veuillez réessayer.',
  [MovaErrorCode.AUTH_EXPIRED_OTP]: 'Code OTP expiré. Demandez un nouveau code.',
  [MovaErrorCode.AUTH_UNAUTHORIZED]: 'Non autorisé. Veuillez vous connecter.',
  [MovaErrorCode.AUTH_INVALID_PHONE]: 'Numéro de téléphone invalide. Format: +243XXXXXXXXX',
  [MovaErrorCode.AUTH_FORBIDDEN]: 'Accès refusé. Permissions insuffisantes pour cette action.',
  [MovaErrorCode.AUTH_INVALID_PIN]: 'Code PIN incorrect. Réessayez ou connectez-vous par SMS.',
  [MovaErrorCode.AUTH_PIN_LOCKED]: 'Trop de tentatives PIN. Réessayez dans 15 minutes ou connectez-vous par SMS.',
  [MovaErrorCode.AUTH_PIN_NOT_SET]: 'Aucun code PIN configuré. Connectez-vous par SMS.',
  [MovaErrorCode.AUTH_INVALID_GOOGLE]: 'Connexion Google refusée. Réessayez ou utilisez le numéro de téléphone.',
  [MovaErrorCode.AUTH_IDENTITY_TAKEN]:
    'Ce numéro ou ce compte Google est déjà lié à un autre utilisateur SENGA.',

  [MovaErrorCode.RIDE_NOT_FOUND]: 'Course introuvable.',
  [MovaErrorCode.RIDE_INVALID_STATUS]: 'Statut de course invalide pour cette action.',
  [MovaErrorCode.RIDE_NO_DRIVERS]:
    'Aucun chauffeur disponible dans votre zone pour le moment. Réessayez dans 2 min.',
  [MovaErrorCode.RIDE_ALREADY_ACTIVE]: 'Vous avez déjà une course en cours.',
  [MovaErrorCode.RIDE_ACCEPT_TIMEOUT]: "Délai d'acceptation expiré (30 secondes).",
  [MovaErrorCode.RIDE_ALREADY_RATED]: 'Vous avez déjà noté cette course.',
  [MovaErrorCode.RIDE_INVALID_TRANSITION]: 'Transition de statut non autorisée pour cette course.',
  [MovaErrorCode.RIDE_UNPAID_PENDING]:
    'Vous avez une course terminée non payée. Réglez le paiement avant d\'en commander une nouvelle.',
  [MovaErrorCode.SCHEDULED_RIDE_NOT_FOUND]: 'Réservation planifiée introuvable.',
  [MovaErrorCode.SCHEDULED_RIDE_TOO_FAR]: 'La réservation ne peut pas dépasser 7 jours.',
  [MovaErrorCode.SCHEDULED_RIDE_PAST]: 'La date de réservation doit être dans le futur.',
  [MovaErrorCode.SCHEDULED_RIDE_INVALID_STATUS]: 'Statut de réservation invalide pour cette action.',

  [MovaErrorCode.DELIVERY_NOT_FOUND]: 'Livraison introuvable.',
  [MovaErrorCode.DELIVERY_INVALID_STATUS]: 'Statut de livraison invalide pour cette action.',
  [MovaErrorCode.RESTAURANT_NOT_FOUND]: 'Restaurant introuvable.',

  [MovaErrorCode.CARPOOL_NOT_FOUND]: 'Trajet covoiturage introuvable.',
  [MovaErrorCode.CARPOOL_NO_SEATS]: 'Plus de places disponibles sur ce trajet.',
  [MovaErrorCode.CARPOOL_ALREADY_JOINED]: 'Vous avez déjà rejoint ce trajet.',
  [MovaErrorCode.CARPOOL_PUBLISH_DRIVER_ONLY]:
    'Seuls les chauffeurs SENGA validés (KYC approuvé) peuvent publier un covoiturage.',

  [MovaErrorCode.ERRAND_NOT_FOUND]: 'Commande de course introuvable.',
  [MovaErrorCode.ERRAND_INVALID_STATUS]: 'Statut de commande invalide pour cette action.',

  [MovaErrorCode.RENTAL_INQUIRY_NOT_FOUND]: 'Demande de location introuvable.',
  [MovaErrorCode.RENTAL_VEHICLE_NOT_FOUND]: 'Véhicule de location introuvable.',

  [MovaErrorCode.MOVING_NOT_FOUND]: 'Demande de déménagement introuvable.',
  [MovaErrorCode.MOVING_INVALID_STATUS]: 'Statut de déménagement invalide pour cette action.',

  [MovaErrorCode.PAYMENT_FAILED]: 'Le paiement a échoué. Vérifiez votre solde.',
  [MovaErrorCode.PAYMENT_INSUFFICIENT_BALANCE]: 'Solde insuffisant dans votre portefeuille.',
  [MovaErrorCode.PAYMENT_INVALID_METHOD]: 'Méthode de paiement non supportée.',
  [MovaErrorCode.PAYMENT_PHONE_REQUIRED]:
    'Numéro Mobile Money requis. Format: +243XXXXXXXXX',

  [MovaErrorCode.USER_NOT_FOUND]: 'Utilisateur introuvable.',
  [MovaErrorCode.DRIVER_NOT_AVAILABLE]: 'Chauffeur non disponible.',
  [MovaErrorCode.DRIVER_KYC_PENDING]: 'Votre dossier KYC est en cours de validation.',
  [MovaErrorCode.DRIVER_DOCUMENTS_EXPIRED]:
    'Un ou plusieurs documents (permis, assurance, visite technique) sont expirés ou incomplets.',

  [MovaErrorCode.VALIDATION_ERROR]: 'Données invalides.',
  [MovaErrorCode.NOT_FOUND]: 'Ressource introuvable.',
  [MovaErrorCode.PRICING_NOT_CONFIGURED]: 'Tarification non configurée. Contactez le support SENGA.',
  [MovaErrorCode.PROMO_NOT_FOUND]: 'Code promo introuvable.',
  [MovaErrorCode.PROMO_INVALID]: 'Code promo invalide ou expiré.',
  [MovaErrorCode.SUBSCRIPTION_NOT_FOUND]: 'Abonnement introuvable.',
  [MovaErrorCode.CITY_INACTIVE]: 'SENGA n\'est pas disponible dans cette ville pour le moment.',
  [MovaErrorCode.INTERNAL_ERROR]: 'Une erreur interne est survenue.',
};

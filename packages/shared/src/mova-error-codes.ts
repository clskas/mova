export enum MovaErrorCode {
  AUTH_INVALID_OTP = 'MOVA_AUTH_001',
  AUTH_EXPIRED_OTP = 'MOVA_AUTH_002',
  AUTH_UNAUTHORIZED = 'MOVA_AUTH_003',
  AUTH_INVALID_PHONE = 'MOVA_AUTH_004',

  RIDE_NOT_FOUND = 'MOVA_RIDE_001',
  RIDE_INVALID_STATUS = 'MOVA_RIDE_002',
  RIDE_NO_DRIVERS = 'MOVA_RIDE_003',
  RIDE_ALREADY_ACTIVE = 'MOVA_RIDE_004',
  RIDE_ACCEPT_TIMEOUT = 'MOVA_RIDE_005',

  PAYMENT_FAILED = 'MOVA_PAY_001',
  PAYMENT_INSUFFICIENT_BALANCE = 'MOVA_PAY_002',
  PAYMENT_INVALID_METHOD = 'MOVA_PAY_003',

  USER_NOT_FOUND = 'MOVA_USER_001',
  DRIVER_NOT_AVAILABLE = 'MOVA_DRIVER_001',
  DRIVER_KYC_PENDING = 'MOVA_DRIVER_002',

  VALIDATION_ERROR = 'MOVA_VAL_001',
  INTERNAL_ERROR = 'MOVA_INT_001',
}

export const MOVA_ERROR_MESSAGES: Record<MovaErrorCode, string> = {
  [MovaErrorCode.AUTH_INVALID_OTP]: 'Code OTP invalide. Veuillez réessayer.',
  [MovaErrorCode.AUTH_EXPIRED_OTP]: 'Code OTP expiré. Demandez un nouveau code.',
  [MovaErrorCode.AUTH_UNAUTHORIZED]: 'Non autorisé. Veuillez vous connecter.',
  [MovaErrorCode.AUTH_INVALID_PHONE]: 'Numéro de téléphone invalide. Format: +243XXXXXXXXX',

  [MovaErrorCode.RIDE_NOT_FOUND]: 'Course introuvable.',
  [MovaErrorCode.RIDE_INVALID_STATUS]: 'Statut de course invalide pour cette action.',
  [MovaErrorCode.RIDE_NO_DRIVERS]:
    'Aucun chauffeur disponible à Kinshasa pour le moment. Réessayez dans 2 min.',
  [MovaErrorCode.RIDE_ALREADY_ACTIVE]: 'Vous avez déjà une course en cours.',
  [MovaErrorCode.RIDE_ACCEPT_TIMEOUT]: "Délai d'acceptation expiré (30 secondes).",

  [MovaErrorCode.PAYMENT_FAILED]: 'Le paiement a échoué. Vérifiez votre solde.',
  [MovaErrorCode.PAYMENT_INSUFFICIENT_BALANCE]: 'Solde insuffisant dans votre portefeuille.',
  [MovaErrorCode.PAYMENT_INVALID_METHOD]: 'Méthode de paiement non supportée.',

  [MovaErrorCode.USER_NOT_FOUND]: 'Utilisateur introuvable.',
  [MovaErrorCode.DRIVER_NOT_AVAILABLE]: 'Chauffeur non disponible.',
  [MovaErrorCode.DRIVER_KYC_PENDING]: 'Votre dossier KYC est en cours de validation.',

  [MovaErrorCode.VALIDATION_ERROR]: 'Données invalides.',
  [MovaErrorCode.INTERNAL_ERROR]: 'Une erreur interne est survenue. Veuillez réessayer.',
};

import 'result.dart';

/// Messages MOVA alignés sur packages/shared/src/mova-error-codes.ts
const movaErrorMessages = <String, String>{
  'MOVA_AUTH_001': 'Code OTP invalide. Veuillez réessayer.',
  'MOVA_AUTH_002': 'Code OTP expiré. Demandez un nouveau code.',
  'MOVA_AUTH_003': 'Non autorisé. Veuillez vous connecter.',
  'MOVA_AUTH_004': 'Numéro de téléphone invalide. Format: +243XXXXXXXXX',
  'MOVA_RIDE_001': 'Course introuvable.',
  'MOVA_RIDE_002': 'Statut de course invalide pour cette action.',
  'MOVA_RIDE_003':
      'Aucun chauffeur disponible à Kinshasa pour le moment. Réessayez dans 2 min.',
  'MOVA_RIDE_004': 'Vous avez déjà une course en cours.',
  'MOVA_RIDE_005': "Délai d'acceptation expiré (30 secondes).",
  'MOVA_RIDE_006': 'Réservation planifiée introuvable.',
  'MOVA_RIDE_007': 'La réservation ne peut pas dépasser 7 jours.',
  'MOVA_RIDE_008': 'La date de réservation doit être dans le futur.',
  'MOVA_RIDE_009': 'Statut de réservation invalide pour cette action.',
  'MOVA_DEL_001': 'Livraison introuvable.',
  'MOVA_DEL_002': 'Statut de livraison invalide pour cette action.',
  'MOVA_DEL_003': 'Restaurant introuvable.',
  'MOVA_CAR_001': 'Trajet covoiturage introuvable.',
  'MOVA_CAR_002': 'Plus de places disponibles sur ce trajet.',
  'MOVA_CAR_003': 'Vous avez déjà rejoint ce trajet.',
  'MOVA_ERR_001': 'Commande de course introuvable.',
  'MOVA_REN_001': 'Demande de location introuvable.',
  'MOVA_PAY_001': 'Le paiement a échoué. Vérifiez votre solde.',
  'MOVA_PAY_002': 'Solde insuffisant dans votre portefeuille.',
  'MOVA_PAY_003': 'Méthode de paiement non supportée.',
  'MOVA_USER_001': 'Utilisateur introuvable.',
  'MOVA_DRIVER_001': 'Chauffeur non disponible.',
  'MOVA_DRIVER_002': 'Votre dossier KYC est en cours de validation.',
  'MOVA_VAL_001': 'Données invalides. Vérifiez les champs obligatoires.',
  'MOVA_INT_001': 'Une erreur interne est survenue. Veuillez réessayer.',
};

MovaFailure failureFromApiResponse(int statusCode, Map<String, dynamic> body) {
  final error = body['error'];
  if (error is Map<String, dynamic>) {
    final code = error['code'] as String?;
    final rawMessage = error['message'];
    final apiMessage = rawMessage is List
        ? rawMessage.join(', ')
        : rawMessage?.toString();

    if (code != null) {
      final mapped = movaErrorMessages[code];
      if (mapped != null) {
        if (code == 'MOVA_AUTH_003' || statusCode == 401) {
          return AuthFailure(mapped);
        }
        if (code == 'MOVA_RIDE_003') return NoDriversFailure(mapped);
        if (code.startsWith('MOVA_PAY_')) return PaymentFailure(mapped);
        if (code == 'MOVA_VAL_001') {
          return ValidationFailure(apiMessage ?? mapped);
        }
        return ServerFailure(apiMessage ?? mapped);
      }
    }
    if (apiMessage != null && apiMessage.isNotEmpty) {
      if (statusCode == 401) return AuthFailure(apiMessage);
      return ServerFailure(apiMessage);
    }
  }

  if (statusCode == 401) {
    return const AuthFailure('Session expirée. Reconnectez-vous.');
  }
  return ServerFailure('Erreur serveur ($statusCode).');
}

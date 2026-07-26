import 'result.dart';
import 'user_friendly_error.dart';

/// Messages SENGA alignés sur packages/shared/src/mova-error-codes.ts
const movaErrorMessages = <String, String>{
  'MOVA_AUTH_001': 'Code OTP invalide. Veuillez réessayer.',
  'MOVA_AUTH_002': 'Code OTP expiré. Demandez un nouveau code.',
  'MOVA_AUTH_003': 'Non autorisé. Veuillez vous connecter.',
  'MOVA_AUTH_004': 'Numéro de téléphone invalide. Format: +243XXXXXXXXX',
  'MOVA_AUTH_005': 'Accès refusé. Permissions insuffisantes pour cette action.',
  'MOVA_AUTH_006': 'Code PIN incorrect. Réessayez ou connectez-vous par SMS.',
  'MOVA_AUTH_007': 'Trop de tentatives PIN. Réessayez dans 15 minutes ou connectez-vous par SMS.',
  'MOVA_AUTH_008': 'Aucun code PIN configuré. Connectez-vous par SMS.',
  'MOVA_RIDE_001': 'Course introuvable.',
  'MOVA_RIDE_002': 'Statut de course invalide pour cette action.',
  'MOVA_RIDE_003':
      'Aucun chauffeur disponible dans votre zone pour le moment. Réessayez dans 2 min.',
  'MOVA_RIDE_004': 'Vous avez déjà une course en cours.',
  'MOVA_RIDE_005': "Délai d'acceptation expiré (30 secondes).",
  'MOVA_RIDE_006': 'Réservation planifiée introuvable.',
  'MOVA_RIDE_007': 'La réservation ne peut pas dépasser 7 jours.',
  'MOVA_RIDE_008': 'La date de réservation doit être dans le futur.',
  'MOVA_RIDE_009': 'Statut de réservation invalide pour cette action.',
  'MOVA_RIDE_010': 'Vous avez déjà noté cette course.',
  'MOVA_RIDE_011': 'Transition de statut non autorisée pour cette course.',
  'MOVA_RIDE_012':
      'Vous avez une course terminée non payée. Réglez le paiement avant d\'en commander une nouvelle.',
  'MOVA_DEL_001': 'Livraison introuvable.',
  'MOVA_DEL_002': 'Statut de livraison invalide pour cette action.',
  'MOVA_DEL_003': 'Restaurant introuvable.',
  'MOVA_CAR_001': 'Trajet covoiturage introuvable.',
  'MOVA_CAR_002': 'Plus de places disponibles sur ce trajet.',
  'MOVA_CAR_003': 'Vous avez déjà rejoint ce trajet.',
  'MOVA_CAR_004': 'Seuls les chauffeurs SENGA validés peuvent publier un covoiturage.',
  'MOVA_ERR_001': 'Commande de course introuvable.',
  'MOVA_ERR_002': 'Statut de commande invalide pour cette action.',
  'MOVA_REN_001': 'Demande de location introuvable.',
  'MOVA_REN_002': 'Véhicule de location introuvable.',
  'MOVA_MOV_001': 'Demande de déménagement introuvable.',
  'MOVA_MOV_002': 'Statut de déménagement invalide pour cette action.',
  'MOVA_PAY_001': 'Le paiement a échoué. Vérifiez votre solde.',
  'MOVA_PAY_002': 'Solde insuffisant dans votre portefeuille.',
  'MOVA_PAY_003': 'Méthode de paiement non supportée.',
  'MOVA_PAY_004': 'Numéro Mobile Money requis. Format: +243XXXXXXXXX',
  'MOVA_USER_001': 'Utilisateur introuvable.',
  'MOVA_DRIVER_001': 'Chauffeur non disponible.',
  'MOVA_DRIVER_002': 'Votre dossier KYC est en cours de validation.',
  'MOVA_DRIVER_003':
      'Un ou plusieurs documents (permis, assurance, visite technique) sont expirés ou incomplets.',
  'MOVA_VAL_001': 'Données invalides. Vérifiez les champs obligatoires.',
  'MOVA_VAL_002': 'Ressource introuvable.',
  'MOVA_VAL_003': 'Tarification non configurée. Contactez le support SENGA.',
  'MOVA_VAL_004': 'Code promo introuvable.',
  'MOVA_VAL_005': 'Code promo invalide ou expiré.',
  'MOVA_VAL_006': 'Abonnement introuvable.',
  'MOVA_VAL_007': 'SENGA n\'est pas disponible dans cette ville pour le moment.',
  'MOVA_INT_001': 'Une erreur interne est survenue.',
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
          return ValidationFailure(sanitizeUserMessage(apiMessage, fallback: mapped));
        }
        return ServerFailure(sanitizeUserMessage(apiMessage, fallback: mapped));
      }
      // Code technique inconnu : ne jamais l'afficher tel quel.
      return ServerFailure(
        sanitizeUserMessage(apiMessage, fallback: 'Une erreur est survenue. Veuillez réessayer.'),
      );
    }
    if (apiMessage != null && apiMessage.isNotEmpty) {
      final friendly = sanitizeUserMessage(apiMessage);
      if (statusCode == 401) return AuthFailure(friendly);
      return ServerFailure(friendly);
    }
  }

  if (statusCode == 401) {
    return const AuthFailure('Session expirée. Reconnectez-vous.');
  }
  return ServerFailure('Impossible de contacter le serveur. Réessayez.');
}

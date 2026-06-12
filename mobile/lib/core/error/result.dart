sealed class MovaFailure {
  const MovaFailure(this.message);
  final String message;
}

class NetworkFailure extends MovaFailure {
  const NetworkFailure([
    super.message = 'Connexion instable. Nouvelle tentative…',
  ]);
}

class AuthFailure extends MovaFailure {
  const AuthFailure([super.message = 'Erreur d\'authentification.']);
}

class ServerFailure extends MovaFailure {
  const ServerFailure([super.message = 'Erreur serveur. Veuillez réessayer.']);
}

class ValidationFailure extends MovaFailure {
  const ValidationFailure(super.message);
}

class NoDriversFailure extends MovaFailure {
  const NoDriversFailure([
    super.message =
        'Aucun chauffeur disponible dans votre zone pour le moment. Réessayez dans 2 min.',
  ]);
}

class PaymentFailure extends MovaFailure {
  const PaymentFailure([
    super.message =
        'Le paiement a échoué. Vérifiez votre solde.',
  ]);
}

class OfflineFailure extends MovaFailure {
  const OfflineFailure([
    super.message = 'Mode hors ligne. Données en cache affichées.',
  ]);
}

sealed class Result<T> {
  const Result();
}

class Success<T> extends Result<T> {
  const Success(this.data);
  final T data;
}

class Failure<T> extends Result<T> {
  const Failure(this.error);
  final MovaFailure error;
}

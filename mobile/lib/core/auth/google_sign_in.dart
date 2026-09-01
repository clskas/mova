import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:google_sign_in/google_sign_in.dart';
import '../config/market_config.dart';

/// Google Sign-In → ID token for `POST /auth/google`.
///
/// Android: `serverClientId` must be the **Web** OAuth client ID so Play / the
/// SDK returns an ID token the backend can verify (`GOOGLE_CLIENT_ID`).
///
/// Google Cloud allows **one SHA-1 per Android OAuth client**. Register each
/// fingerprint on its own Android client (same package `cd.mova.mova.passenger`
/// / `cd.mova.mova.driver`):
/// - upload/keystore SHA-1 (internal / sideload)
/// - Play App Signing **certificate** SHA-1 — Play Console → App integrity →
///   **SHA-1** classical (not SHA-256, not PQC)
/// Missing Play SHA-1 → ApiException 10. After adding a fingerprint, wait a
/// few minutes and use the **installed** app's signing cert (Play vs upload).
final GoogleSignIn _googleSignIn = GoogleSignIn(
  scopes: const ['email', 'profile'],
  serverClientId: MarketConfig.googleServerClientId.isEmpty
      ? null
      : MarketConfig.googleServerClientId,
);

/// User-facing Google Sign-In error. Never use this on the SMS/PIN path.
String googleSignInErrorMessage(Object error) {
  debugPrint('Google Sign-In failed: $error');
  if (error is PlatformException) {
    final blob = '${error.code} ${error.message} ${error.details}'.toLowerCase();
    if (error.code == 'sign_in_canceled' ||
        error.code == '12501' ||
        blob.contains('canceled') ||
        blob.contains('cancelled')) {
      return 'Connexion Google annulée.';
    }
    if (error.code == 'id_token_missing') {
      return 'Google n\'a pas renvoyé de jeton. Utilisez le SMS, ou vérifiez le SHA-1 classique Play (pas PQC) sur un client Android séparé.';
    }
    if (error.code == '12500' || blob.contains('12500')) {
      return 'Connexion Google indisponible sur cet appareil. Utilisez le SMS.';
    }
    if (error.code == 'sign_in_failed' ||
        blob.contains('developer_error') ||
        blob.contains('api_exception: 10') ||
        blob.contains('apiexception: 10') ||
        RegExp(r'\b10\b').hasMatch(blob)) {
      return 'Google refuse cette installation (empreinte SHA-1). Utilisez le SMS, ou ajoutez le SHA-1 classique Play ET upload sur deux clients Android (même package).';
    }
  }
  return 'Impossible de se connecter avec Google. Réessayez ou utilisez le SMS.';
}

Future<String?> signInWithGoogleIdToken() async {
  try {
    await _googleSignIn.signOut();
  } catch (_) {
    /* ignore — force a fresh account picker so a stale session cannot yield a null idToken */
  }
  final account = await _googleSignIn.signIn();
  if (account == null) return null;
  var auth = await account.authentication;
  var idToken = auth.idToken;
  if (idToken == null || idToken.isEmpty) {
    await Future<void>.delayed(const Duration(milliseconds: 400));
    auth = await account.authentication;
    idToken = auth.idToken;
  }
  if (idToken == null || idToken.isEmpty) {
    throw PlatformException(
      code: 'id_token_missing',
      message: 'Google Sign-In returned an account without an ID token',
    );
  }
  return idToken;
}

Future<void> signOutGoogle() async {
  try {
    await _googleSignIn.signOut();
  } catch (_) {
    /* ignore — local session already cleared */
  }
}

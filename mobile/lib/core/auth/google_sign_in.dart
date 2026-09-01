import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:google_sign_in/google_sign_in.dart';
import '../config/market_config.dart';

/// Google Sign-In → ID token for `POST /auth/google`.
///
/// Android: `serverClientId` must be the **Web** OAuth client ID so Play / the
/// SDK returns an ID token the backend can verify (`GOOGLE_CLIENT_ID`).
/// Register SHA-1 of the **upload** keystore AND Play App Signing **certificate**
/// (Play Console → App integrity → SHA-1 classical) on both Android OAuth clients:
/// `cd.mova.mova.passenger` and `cd.mova.mova.driver`. Missing Play SHA-1 → ApiException 10.
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
    if (error.code == 'sign_in_failed' ||
        blob.contains('developer_error') ||
        blob.contains('api_exception: 10') ||
        blob.contains('apiexception: 10') ||
        RegExp(r'\b10\b').hasMatch(blob)) {
      return 'Connexion Google indisponible sur cette installation. Utilisez le SMS.';
    }
  }
  return 'Impossible de se connecter avec Google. Réessayez ou utilisez le SMS.';
}

Future<String?> signInWithGoogleIdToken() async {
  final account = await _googleSignIn.signIn();
  if (account == null) return null;
  final auth = await account.authentication;
  return auth.idToken;
}

Future<void> signOutGoogle() async {
  try {
    await _googleSignIn.signOut();
  } catch (_) {
    /* ignore — local session already cleared */
  }
}

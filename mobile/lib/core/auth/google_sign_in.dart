import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:google_sign_in/google_sign_in.dart';
import '../config/market_config.dart';

/// Google Sign-In → ID token for `POST /auth/google`.
///
/// Android: `serverClientId` must be the **Web** OAuth client ID so Play / the
/// SDK returns an ID token the backend can verify (`GOOGLE_CLIENT_ID`).
/// Do not pass an Android OAuth client ID here (that yields a missing idToken).
///
/// DEVELOPER_ERROR / ApiException 10 is Play Services (package + SHA-1), not
/// our API. Rebuild AAB does not fix it. Google Cloud allows **one SHA-1 per
/// Android OAuth client**. Create a separate Android client per fingerprint,
/// same package `cd.mova.mova.passenger` / `cd.mova.mova.driver`:
///
/// | Certificat | SHA-1 |
/// |---|---|
/// | Debug (sideload / `flutter run`) | `6A:4B:2A:B7:88:F4:1C:41:9D:63:31:06:73:43:67:C8:4E:6D:2E:40` |
/// | Upload keystore | `D5:7A:0F:7F:3C:A2:99:60:A2:24:C3:28:86:77:F6:89:F6:71:CD:BF` |
/// | Play App Signing (install Play) | Play Console → Intégrité de l'app → **SHA-1 classique** (pas SHA-256, pas PQC) |
///
/// Missing Play App Signing SHA-1 → error 10 on Play-installed builds.
GoogleSignIn? _googleSignInInstance;
GoogleSignIn get _googleSignIn =>
    _googleSignInInstance ??= GoogleSignIn(
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
      return 'Google n\'a pas renvoyé de jeton. Le client OAuth Web (serverClientId) est requis, pas un client Android. Utilisez le SMS.';
    }
    if (error.code == '12500' || blob.contains('12500')) {
      return 'Connexion Google indisponible sur cet appareil. Utilisez le SMS.';
    }
    if (error.code == 'sign_in_failed' ||
        blob.contains('developer_error') ||
        blob.contains('api_exception: 10') ||
        blob.contains('apiexception: 10') ||
        RegExp(r'\b10\b').hasMatch(blob)) {
      return 'Google refuse cette installation (empreinte SHA-1). Ce n\'est pas l\'API SENGA. Ajoutez le SHA-1 classique Play (Intégrité de l\'app) ET upload sur deux clients Android (même package). Sideload : SHA-1 debug 6A:4B:2A:B7:…. Utilisez le SMS en attendant.';
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

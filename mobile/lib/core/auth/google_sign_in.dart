import 'package:google_sign_in/google_sign_in.dart';
import '../config/market_config.dart';

/// Google Sign-In → ID token for `POST /auth/google`.
///
/// Android: `serverClientId` must be the **Web** OAuth client ID so Play / the
/// SDK returns an ID token the backend can verify (`GOOGLE_CLIENT_ID`).
/// Register SHA-1 of the upload keystore on the Android OAuth clients
/// `cd.mova.mova.passenger` and `cd.mova.mova.driver`.
final GoogleSignIn _googleSignIn = GoogleSignIn(
  scopes: const ['email', 'profile'],
  serverClientId: MarketConfig.googleServerClientId.isEmpty
      ? null
      : MarketConfig.googleServerClientId,
);

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

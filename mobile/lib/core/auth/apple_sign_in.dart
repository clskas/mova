import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';
import '../../core/i18n/i18n.dart';

/// Result of native Sign in with Apple for `POST /auth/apple`.
class AppleSignInResult {
  const AppleSignInResult({
    required this.identityToken,
    this.givenName,
    this.familyName,
    this.email,
  });

  final String identityToken;
  final String? givenName;
  final String? familyName;
  final String? email;
}

String appleSignInErrorMessage(Object error) {
  debugPrint('Apple Sign-In failed: $error');
  if (error is SignInWithAppleAuthorizationException) {
    switch (error.code) {
      case AuthorizationErrorCode.canceled:
        return tr('Connexion Apple annulée.');
      case AuthorizationErrorCode.failed:
        return tr('Connexion Apple impossible. Réessayez ou utilisez le SMS.');
      case AuthorizationErrorCode.invalidResponse:
        return tr('Réponse Apple invalide. Réessayez ou utilisez le SMS.');
      case AuthorizationErrorCode.notHandled:
      case AuthorizationErrorCode.notInteractive:
        return tr('Connexion Apple indisponible sur cet appareil. Utilisez le SMS.');
      case AuthorizationErrorCode.unknown:
        return tr('Connexion Apple refusée. Réessayez ou utilisez le SMS.');
    }
  }
  if (error is PlatformException) {
    final blob = '${error.code} ${error.message}'.toLowerCase();
    if (blob.contains('cancel')) return tr('Connexion Apple annulée.');
  }
  return tr('Impossible de se connecter avec Apple. Réessayez ou utilisez le SMS.');
}

String _randomNonce([int length = 32]) {
  const charset = '0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._';
  final random = Random.secure();
  return List.generate(length, (_) => charset[random.nextInt(charset.length)]).join();
}

String _sha256of(String input) {
  final bytes = utf8.encode(input);
  return sha256.convert(bytes).toString();
}

/// Native Sign in with Apple → identity token for auth-service.
/// Returns null if the user cancels.
Future<AppleSignInResult?> signInWithAppleIdentityToken() async {
  if (kIsWeb || defaultTargetPlatform != TargetPlatform.iOS) {
    throw PlatformException(
      code: 'apple_unavailable',
      message: tr('Sign in with Apple is only available on iOS'),
    );
  }

  final rawNonce = _randomNonce();
  final nonce = _sha256of(rawNonce);

  try {
    final credential = await SignInWithApple.getAppleIDCredential(
      scopes: [
        AppleIDAuthorizationScopes.email,
        AppleIDAuthorizationScopes.fullName,
      ],
      nonce: nonce,
    );
    final token = credential.identityToken?.trim() ?? '';
    if (token.isEmpty) {
      throw PlatformException(
        code: 'identity_token_missing',
        message: tr('Apple Sign-In returned no identity token'),
      );
    }
    return AppleSignInResult(
      identityToken: token,
      givenName: credential.givenName?.trim(),
      familyName: credential.familyName?.trim(),
      email: credential.email?.trim(),
    );
  } on SignInWithAppleAuthorizationException catch (e) {
    if (e.code == AuthorizationErrorCode.canceled) return null;
    rethrow;
  }
}

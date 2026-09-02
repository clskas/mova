import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mova/core/auth/google_sign_in.dart';
import 'package:mova/core/config/market_config.dart';

void main() {
  test('serverClientId is the Web OAuth client, not an Android client', () {
    expect(
      MarketConfig.googleServerClientId,
      '58917716638-rbgibno8pdvlud8dd00pdfjdv3q1dh4k.apps.googleusercontent.com',
    );
    expect(MarketConfig.googleServerClientId.contains('-h0rc1c3nej5n68clebbriph4nftprr09'), isFalse);
  });

  test('maps Play Services DEVELOPER_ERROR 10 to SHA-1 copy, not a rebuild hint', () {
    final msg = googleSignInErrorMessage(
      PlatformException(code: 'sign_in_failed', message: 'ApiException: 10', details: 'DEVELOPER_ERROR'),
    );
    expect(msg.toLowerCase(), contains('sha-1'));
    expect(msg.toLowerCase(), isNot(contains('aab')));
    expect(msg.toLowerCase(), isNot(contains('rebuild')));
  });

  test('maps missing idToken to Web client copy', () {
    final msg = googleSignInErrorMessage(
      PlatformException(code: 'id_token_missing', message: 'no token'),
    );
    expect(msg.toLowerCase(), contains('web'));
  });
}

import 'package:flutter_test/flutter_test.dart';
import 'package:mova/core/monitoring/error_reporter.dart';

void main() {
  test('parses a Sentry DSN into the envelope endpoint and key', () {
    final parsed = ErrorReporter.parseDsn('https://abc123@o42.ingest.sentry.io/4505');
    expect(parsed?.$1.toString(), 'https://o42.ingest.sentry.io/api/4505/envelope/');
    expect(parsed?.$2, 'abc123');
  });

  test('rejects unusable DSNs', () {
    expect(ErrorReporter.parseDsn(''), isNull);
    expect(ErrorReporter.parseDsn('https://o42.ingest.sentry.io/4505'), isNull);
  });

  test('is disabled without a SENTRY_DSN dart-define', () async {
    expect(ErrorReporter.enabled, isFalse);
    expect(await ErrorReporter.report(Exception('boom'), null), isFalse);
  });

  test('builds an event tagged with flavor and version', () {
    final event = ErrorReporter.buildEvent(StateError('bad'), StackTrace.current);
    expect(event['level'], 'error');
    expect((event['tags'] as Map)['flavor'], isNotNull);
    expect(((event['exception'] as Map)['values'] as List).first['type'], 'StateError');
  });

  group('ignores network noise from map tiles and fonts', () {
    test('offline map tile (SENGA-MOBILE-5)', () {
      expect(
        ErrorReporter.shouldIgnore(Exception(
          'ClientException with SocketException: Connection failed (OS Error: Network is unreachable, errno = 101), '
          'address = tile.openstreetmap.org, port = 443, uri=https://tile.openstreetmap.org/15/1/2.png',
        )),
        isTrue,
      );
    });

    test('map tile server timeout (SENGA-MOBILE-3)', () {
      expect(
        ErrorReporter.shouldIgnore(Exception(
          'ClientException: Request to https://tile.openstreetmap.org/15/18516/16836.png failed with status 504: Gateway Timeout.',
        )),
        isTrue,
      );
    });

    test('runtime font download (SENGA-MOBILE-1)', () {
      expect(
        ErrorReporter.shouldIgnore(Exception('Failed to load font with url: https://fonts.gstatic.com/s/a/x.ttf')),
        isTrue,
      );
    });

    test('photo that could not be downloaded (SENGA-MOBILE-6 / -9)', () {
      expect(
        ErrorReporter.shouldIgnore(Exception(
          'NetworkImageLoadException: HTTP request failed, statusCode: 400, https://x.supabase.co/storage/v1/object/sign/kyc-docs/k.jpg?token=a',
        )),
        isTrue,
      );
      expect(
        ErrorReporter.shouldIgnore(Exception(
          'HttpException: Connection closed while receiving data, uri = https://mova-gateway.onrender.com/api/uploads/vehicles/a.jpg',
        )),
        isTrue,
      );
    });

    test('keeps real bugs and our own API failures', () {
      expect(ErrorReporter.shouldIgnore(StateError('Cannot use "ref" after the widget was disposed.')), isFalse);
      expect(
        ErrorReporter.shouldIgnore(Exception('ClientException: Connection failed, uri=https://api.afri-soft.com/api/rides')),
        isFalse,
      );
    });
  });
}

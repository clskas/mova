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
}

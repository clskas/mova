import 'dart:convert';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import '../config/app_version.dart';

/// Minimal Sentry reporter (envelope HTTP API) — pure Dart, no native SDK.
///
/// Inactive unless the build passes `--dart-define=SENTRY_DSN=…` (CI secret
/// SENTRY_DSN_MOBILE). Reports uncaught Flutter / Dart errors with the flavor,
/// platform and version. Native crashes are not captured.
class ErrorReporter {
  static const _dsn = String.fromEnvironment('SENTRY_DSN');
  static const _dedupeWindow = Duration(minutes: 1);
  static final Map<String, DateTime> _recent = {};
  static final _random = Random();

  static bool get enabled => parseDsn(_dsn) != null;

  /// Wire Flutter and platform error hooks. Call right after ensureInitialized().
  static void install() {
    if (!enabled || kDebugMode) return;
    final previous = FlutterError.onError;
    FlutterError.onError = (details) {
      previous?.call(details);
      report(details.exception, details.stack);
    };
    PlatformDispatcher.instance.onError = (error, stack) {
      report(error, stack);
      return false; // keep the default handling (console / crash)
    };
  }

  /// (envelope endpoint, public key) or null when the DSN is unusable.
  static (Uri, String)? parseDsn(String dsn) {
    final raw = dsn.trim();
    if (raw.isEmpty) return null;
    final uri = Uri.tryParse(raw);
    if (uri == null || uri.userInfo.isEmpty || uri.pathSegments.isEmpty) return null;
    final projectId = uri.pathSegments.last;
    final prefix = uri.pathSegments.sublist(0, uri.pathSegments.length - 1);
    final endpoint = uri.replace(
      userInfo: '',
      pathSegments: [...prefix, 'api', projectId, 'envelope', ''],
    );
    return (endpoint, uri.userInfo.split(':').first);
  }

  static String _eventId() =>
      List.generate(32, (_) => _random.nextInt(16).toRadixString(16)).join();

  static Map<String, Object?> buildEvent(Object error, StackTrace? stack, {DateTime? now}) {
    return {
      'event_id': _eventId(),
      'timestamp': (now ?? DateTime.now()).toUtc().toIso8601String(),
      'platform': 'dart',
      'level': 'error',
      'environment': 'production',
      // Build number comes from --dart-define=APP_BUILD (AppVersion.name is only a fallback).
      'release': 'senga-${AppFlavor.isDriver ? 'driver' : 'passenger'}@${AppVersion.build}',
      'tags': {
        'flavor': AppFlavor.isDriver ? 'driver' : 'passenger',
        'os': defaultTargetPlatform.name,
      },
      'exception': {
        'values': [
          {'type': error.runtimeType.toString(), 'value': error.toString()},
        ],
      },
      if (stack != null) 'extra': {'stack': stack.toString()},
    };
  }

  static Future<bool> report(Object error, StackTrace? stack, {http.Client? client}) async {
    final parsed = parseDsn(_dsn);
    if (parsed == null) return false;
    final key = '${error.runtimeType}:$error';
    final last = _recent[key];
    final now = DateTime.now();
    if (last != null && now.difference(last) < _dedupeWindow) return false;
    _recent[key] = now;
    if (_recent.length > 200) _recent.clear();

    final event = buildEvent(error, stack, now: now);
    final body = [
      jsonEncode({'event_id': event['event_id'], 'sent_at': now.toUtc().toIso8601String()}),
      jsonEncode({'type': 'event'}),
      jsonEncode(event),
    ].join('\n');
    final c = client ?? http.Client();
    try {
      final res = await c
          .post(
            parsed.$1,
            headers: {
              'Content-Type': 'application/x-sentry-envelope',
              'X-Sentry-Auth':
                  'Sentry sentry_version=7, sentry_key=${parsed.$2}, sentry_client=senga-mobile/1.0',
            },
            body: body,
          )
          .timeout(const Duration(seconds: 5));
      return res.statusCode >= 200 && res.statusCode < 300;
    } catch (_) {
      return false;
    } finally {
      if (client == null) c.close();
    }
  }
}

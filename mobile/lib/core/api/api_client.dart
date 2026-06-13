import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../config/market_config.dart';
import '../error/mova_error_codes.dart';
import '../error/result.dart';
import 'mock_data.dart';

final apiClientProvider = Provider((ref) => ApiClient());

class ApiClient {
  ApiClient({http.Client? client}) : _client = client ?? http.Client();

  /// Client API en mode démo (tests et hors-ligne immédiat).
  ApiClient.mock({http.Client? client})
      : _client = client ?? http.Client(),
        _mockMode = true;

  final http.Client _client;
  String? _token;
  bool _mockMode = false;

  bool get isMockMode => _mockMode;
  bool get hasToken => _token != null && _token!.isNotEmpty;

  Future<void> loadToken() async {
    final prefs = await SharedPreferences.getInstance();
    _token = prefs.getString('auth_token');
  }

  Future<void> saveToken(String token) async {
    _token = token;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('auth_token', token);
  }

  Future<void> clearToken() async {
    _token = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('auth_token');
  }

  Future<void> ensureReady() async {
    if (_token == null) await loadToken();
  }

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        if (_token != null && _token!.isNotEmpty) 'Authorization': 'Bearer $_token',
      };

  Future<bool> checkHealth() async {
    if (_mockMode) return false;
    try {
      final res = await _client
          .get(Uri.parse('${MarketConfig.gatewayBaseUrl}/health'))
          .timeout(const Duration(seconds: 3));
      _mockMode = res.statusCode != 200;
      return !_mockMode;
    } catch (_) {
      _mockMode = true;
      return false;
    }
  }

  Result<Map<String, dynamic>>? _mockFor(String method, String path, Map<String, dynamic>? body) {
    if (!_mockMode) return null;
    if (path.contains('/auth/otp/request')) {
      return Success(MockData.otpRequest(body?['phone']?.toString() ?? '+243812345678'));
    }
    if (path.contains('/auth/otp/verify')) {
      return Success(MockData.verifyOtp(
        body?['phone']?.toString() ?? '+243812345678',
        body?['code']?.toString() ?? '',
        role: body?['role']?.toString(),
      ));
    }
    if (path.contains('/rides/estimate')) {
      return Success(MockData.estimate(body ?? {}));
    }
    if (path.contains('/geo/autocomplete')) {
      final q = Uri.parse('http://x$path').queryParameters['q'] ??
          path.split('q=').last.split('&').first;
      return Success({'suggestions': MockData.geoAutocomplete(q)});
    }
    if (path.contains('/geo/communes')) {
      return Success({'data': MockData.communes()});
    }
    if (RegExp(r'^/rides/[^/]+/search$').hasMatch(path) && method == 'POST') {
      final id = path.split('/')[2];
      return Success(MockData.searchDrivers(id));
    }
    if (RegExp(r'^/rides/[^/]+/cancel$').hasMatch(path) && method == 'POST') {
      final id = path.split('/')[2];
      return Success(MockData.cancelRide(id, reason: body?['reason']?.toString()));
    }
    if (RegExp(r'^/payments/rides/[^/]+$').hasMatch(path) && method == 'POST') {
      final id = path.split('/').last;
      return Success(MockData.payRide(id, body ?? {}));
    }
    if (RegExp(r'^/rides/[^/]+$').hasMatch(path) &&
        method == 'GET' &&
        path != '/rides/history' &&
        !path.contains('scheduled')) {
      final id = path.split('/').last.split('?').first;
      return Success({'ride': MockData.rideDetail(id)});
    }
    if (path == '/rides' && method == 'POST') {
      return Success({'ride': MockData.createRide(body ?? {})});
    }
    if (path.contains('/rides/history') || (path == '/rides' && method == 'GET')) {
      return Success({'data': MockData.rideHistory()});
    }
    if (path.contains('/services')) {
      return Success({'data': MockData.services()});
    }
    if (path.contains('/deliveries/history') ||
        (path.startsWith('/deliveries/') && method == 'GET' && !path.contains('restaurants'))) {
      final id = path.split('/').last.split('?').first;
      if (id != 'history' && id != 'restaurants') {
        return Success({'delivery': MockData.parcelTracking(id)});
      }
      return Success({'data': MockData.deliveryHistory()});
    }
    if (path.contains('/deliveries/restaurants')) {
      return Success({'data': MockData.restaurants()});
    }
    if (path.contains('/deliveries/parcel/estimate')) {
      return Success(MockData.parcelEstimate(body ?? {}));
    }
    if (path.contains('/deliveries/parcel') && method == 'POST') {
      return Success({'delivery': MockData.createParcel(body ?? {})});
    }
    if (path == '/deliveries/food' && method == 'POST') {
      return Success({'delivery': MockData.createFoodOrder(body ?? {}), 'order': MockData.createFoodOrder(body ?? {})});
    }
    if (path.contains('/deliveries/food/estimate')) {
      return Success(MockData.foodEstimate(body ?? {}));
    }
    if (path == '/rides/scheduled' && method == 'POST') {
      return Success({'scheduledRide': MockData.createScheduledRide(body ?? {}), 'ride': MockData.createScheduledRide(body ?? {})});
    }
    if (path.contains('/rides/scheduled')) {
      return Success({'data': MockData.scheduledRides()});
    }
    if (path == '/wallet') {
      return Success(MockData.wallet());
    }
    if (path.contains('/drivers/earnings')) {
      return Success(MockData.earnings());
    }
    if (path.contains('/drivers/availability') ||
        path.contains('/drivers/kyc') ||
        path.contains('/wallet/withdraw') ||
        path.contains('/ratings') ||
        path.contains('/incidents')) {
      return const Success({'success': true});
    }
    if (path.contains('/errands/estimate')) {
      return Success(MockData.errandEstimate(body ?? {}));
    }
    if (path == '/errands' && method == 'POST') {
      final errand = MockData.createErrand(body ?? {});
      return Success({'order': errand, 'errand': errand});
    }
    if (path.contains('/errands')) {
      return Success({'data': MockData.errandHistory()});
    }
    if (path.contains('/carpool') && method == 'GET') {
      return Success({'trips': MockData.carpoolRides(), 'matches': MockData.carpoolRides(), 'data': MockData.carpoolRides()});
    }
    if (path == '/carpool' && method == 'POST') {
      return Success({'trip': MockData.createCarpoolRide(body ?? {}), 'ride': MockData.createCarpoolRide(body ?? {})});
    }
    if (path.contains('/carpool/') && path.endsWith('/join')) {
      return const Success({'success': true});
    }
    return null;
  }

  dynamic _decodeBody(String raw) {
    if (raw.isEmpty) return <String, dynamic>{};
    return jsonDecode(raw);
  }

  Result<Map<String, dynamic>> _failureFromResponse(int statusCode, dynamic data) {
    if (data is Map<String, dynamic>) {
      return Failure(failureFromApiResponse(statusCode, data));
    }
    return Failure(ServerFailure('Erreur serveur ($statusCode).'));
  }

  Map<String, dynamic> _normalizeSuccess(dynamic data) {
    if (data is Map<String, dynamic>) return data;
    if (data is List) return {'data': data};
    return {'data': data};
  }

  Future<Result<Map<String, dynamic>>> post(
    String path,
    Map<String, dynamic> body, {
    int retries = 3,
  }) async {
    await ensureReady();
    final mock = _mockFor('POST', path, body);
    if (mock != null) return mock;

    for (var i = 0; i < retries; i++) {
      try {
        final response = await _client
            .post(
              Uri.parse('${MarketConfig.apiBaseUrl}$path'),
              headers: _headers,
              body: jsonEncode(body),
            )
            .timeout(const Duration(seconds: 30));

        final data = _decodeBody(response.body);
        if (response.statusCode >= 200 && response.statusCode < 300) {
          return Success(_normalizeSuccess(data));
        }
        if (data is Map<String, dynamic>) {
          return _failureFromResponse(response.statusCode, data);
        }
        return Failure(ServerFailure('Erreur serveur (${response.statusCode}).'));
      } catch (e) {
        if (i == retries - 1) {
          _mockMode = true;
          final fallback = _mockFor('POST', path, body);
          if (fallback != null) return fallback;
          return const Failure(NetworkFailure());
        }
        await Future.delayed(Duration(seconds: i + 1));
      }
    }
    return const Failure(NetworkFailure());
  }

  Future<Result<dynamic>> get(String path, {int retries = 3}) async {
    await ensureReady();
    final mock = _mockFor('GET', path, null);
    if (mock != null) return mock;

    for (var i = 0; i < retries; i++) {
      try {
        final response = await _client
            .get(Uri.parse('${MarketConfig.apiBaseUrl}$path'), headers: _headers)
            .timeout(const Duration(seconds: 30));

        final data = _decodeBody(response.body);
        if (response.statusCode >= 200 && response.statusCode < 300) {
          if (path.contains('/rides/history') || (path == '/rides')) {
            await RideHistoryCache.save(
              data is List ? data : (data['rides'] as List? ?? data['data'] as List? ?? []),
            );
          }
          return Success(_normalizeSuccess(data));
        }
        if (data is Map<String, dynamic>) {
          return _failureFromResponse(response.statusCode, data);
        }
        return Failure(ServerFailure('Erreur serveur (${response.statusCode}).'));
      } catch (e) {
        if (i == retries - 1) {
          _mockMode = true;
          if (path.contains('/rides/history')) {
            final cached = await RideHistoryCache.load();
            if (cached.isNotEmpty) {
              return Success({'data': cached, 'cached': true});
            }
          }
          final fallback = _mockFor('GET', path, null);
          if (fallback != null) return fallback;
          return const Failure(NetworkFailure());
        }
        await Future.delayed(Duration(seconds: i + 1));
      }
    }
    return const Failure(NetworkFailure());
  }

  Future<Result<List<Map<String, dynamic>>>> geoAutocomplete(String query) async {
    if (query.trim().length < 2) return const Success([]);
    await ensureReady();
    final encoded = Uri.encodeQueryComponent(query.trim());
    final mock = _mockFor('GET', '/geo/autocomplete?q=$encoded', null);
    if (mock != null) {
      return switch (mock) {
        Success(:final data) => Success(
            List<Map<String, dynamic>>.from(
              data['suggestions'] as List? ?? data['data'] as List? ?? [],
            ),
          ),
        Failure(:final error) => Failure(error),
      };
    }
    final result = await get('/geo/autocomplete?q=$encoded');
    return switch (result) {
      Success(:final data) => Success(
          List<Map<String, dynamic>>.from(
            data['suggestions'] as List? ?? data['data'] as List? ?? [],
          ),
        ),
      Failure() => Success(MockData.geoAutocomplete(query)),
    };
  }

  Future<Result<Map<String, dynamic>>> getRide(String rideId) async {
    final result = await get('/rides/$rideId');
    return switch (result) {
      Success(:final data) => Success(
          data['ride'] as Map<String, dynamic>? ?? data,
        ),
      Failure(:final error) => Failure(error),
    };
  }

  Future<Result<Map<String, dynamic>>> searchDrivers(String rideId) async {
    return post('/rides/$rideId/search', {});
  }

  Future<Result<Map<String, dynamic>>> cancelRide(String rideId, {String? reason}) async {
    return post('/rides/$rideId/cancel', {if (reason != null) 'reason': reason});
  }

  Future<Result<Map<String, dynamic>>> payRide(
    String rideId, {
    required String method,
    required int amountCdf,
  }) async {
    return post('/payments/rides/$rideId', {
      'method': method,
      'amountCdf': amountCdf,
    });
  }
}

/// Cache hors-ligne de l'historique des courses.
class RideHistoryCache {
  static const _key = 'mova_ride_history_cache';

  static Future<void> save(List<dynamic> rides) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, jsonEncode(rides));
  }

  static Future<List<dynamic>> load() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_key);
    if (raw == null) return [];
    return jsonDecode(raw) as List<dynamic>;
  }
}

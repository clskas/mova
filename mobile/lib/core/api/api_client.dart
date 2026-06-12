import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../config/market_config.dart';
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

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        if (_token != null) 'Authorization': 'Bearer $_token',
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
      return Success(MockData.estimate());
    }
    if (path == '/rides' && method == 'POST') {
      return Success({'ride': MockData.createRide(body ?? {})});
    }
    if (path.contains('/rides/history')) {
      return Success({'data': MockData.rideHistory()});
    }
    if (path.contains('/services')) {
      return Success({'data': MockData.services()});
    }
    if (path.contains('/deliveries/history')) {
      return Success({'data': MockData.deliveryHistory()});
    }
    if (path.contains('/deliveries/restaurants')) {
      return Success({'data': MockData.restaurants()});
    }
    if (path.contains('/deliveries/parcel/estimate')) {
      return Success(MockData.parcelEstimate(body ?? {}));
    }
    if (path == '/deliveries/parcel' && method == 'POST') {
      return Success({'delivery': MockData.createParcel(body ?? {})});
    }
    if (path.contains('/deliveries/parcel/') && method == 'GET') {
      final id = path.split('/').last.split('?').first;
      return Success({'delivery': MockData.parcelTracking(id)});
    }
    if (path == '/deliveries/food' && method == 'POST') {
      return Success({'order': MockData.createFoodOrder(body ?? {})});
    }
    if (path.contains('/rides/scheduled/estimate')) {
      return Success(MockData.scheduledRideEstimate(body ?? {}));
    }
    if (path == '/rides/scheduled' && method == 'POST') {
      return Success({'ride': MockData.createScheduledRide(body ?? {})});
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
    if (path.contains('/deliveries/errand/estimate')) {
      return Success(MockData.errandEstimate(body ?? {}));
    }
    if (path == '/deliveries/errand' && method == 'POST') {
      return Success({'errand': MockData.createErrand(body ?? {})});
    }
    if (path.contains('/deliveries/errand/history')) {
      return Success({'data': MockData.errandHistory()});
    }
    if (path.contains('/carpool/search') && method == 'POST') {
      return Success({'data': MockData.carpoolRides()});
    }
    if (path.contains('/carpool/estimate')) {
      return Success(MockData.carpoolEstimate(body ?? {}));
    }
    if (path == '/carpool/rides' && method == 'POST') {
      return Success({'ride': MockData.createCarpoolRide(body ?? {})});
    }
    if (path.contains('/carpool/rides')) {
      return Success({'data': MockData.carpoolRides()});
    }
    return null;
  }

  Future<Result<Map<String, dynamic>>> post(
    String path,
    Map<String, dynamic> body, {
    int retries = 3,
  }) async {
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

        final data = jsonDecode(response.body) as Map<String, dynamic>;
        if (response.statusCode >= 200 && response.statusCode < 300) {
          return Success(data);
        }
        final errorMsg = data['error']?['message'] as String? ??
            'Erreur serveur (${response.statusCode})';
        return Failure(ServerFailure(errorMsg));
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
    final mock = _mockFor('GET', path, null);
    if (mock != null) return mock;

    for (var i = 0; i < retries; i++) {
      try {
        final response = await _client
            .get(Uri.parse('${MarketConfig.apiBaseUrl}$path'), headers: _headers)
            .timeout(const Duration(seconds: 30));

        final data = jsonDecode(response.body);
        if (response.statusCode >= 200 && response.statusCode < 300) {
          if (path.contains('/rides/history')) {
            await RideHistoryCache.save(
              data is List ? data : (data['rides'] as List? ?? data['data'] as List? ?? []),
            );
          }
          return Success(data is Map<String, dynamic> ? data : {'data': data});
        }
        return const Failure(ServerFailure());
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

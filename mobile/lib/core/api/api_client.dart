import 'dart:convert';
import 'dart:io' show File;
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

  Future<String?> authToken() async {
    await ensureReady();
    return _token;
  }

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
    await prefs.remove('user_phone');
  }

  Future<void> saveUserPhone(String phone) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('user_phone', MarketConfig.normalizePhone(phone));
  }

  Future<String?> loadUserPhone() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('user_phone');
  }

  Future<void> ensureReady() async {
    if (_token == null) await loadToken();
  }

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        if (_token != null && _token!.isNotEmpty) 'Authorization': 'Bearer $_token',
      };

  /// Vérifie la santé de la passerelle. Active le mode mock uniquement si `/health` échoue.
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
    if (path == '/rides/offers' && method == 'GET') {
      return Success({'offers': MockData.driverOffers()});
    }
    if (RegExp(r'^/rides/[^/]+$').hasMatch(path) &&
        method == 'GET' &&
        path != '/rides/history' &&
        path != '/rides/offers' &&
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
    if (path.contains('/uploads/parcel-photo') && method == 'POST') {
      return Success({'photoUrl': 'mock://parcel-photo', 'cloudinaryMockUrl': 'mock://cloudinary'});
    }
    if (path.contains('/deliveries/parcel/photo') && method == 'POST') {
      return Success({'url': 'mock://parcel-photo', 'photoUrl': 'mock://parcel-photo'});
    }
    if (path.contains('/express/estimate') || path.contains('/deliveries/express/estimate')) {
      return Success(MockData.expressEstimate(body ?? {}));
    }
    if ((path == '/express' || path.contains('/deliveries/express')) && method == 'POST') {
      return Success({'delivery': MockData.createExpress(body ?? {})});
    }
    if (path.contains('/deliveries/parcel') && method == 'POST') {
      return Success({'delivery': MockData.createParcel(body ?? {})});
    }
    if (path.contains('/deliveries/errand/estimate')) {
      return Success(MockData.mobileErrandEstimate(body ?? {}));
    }
    if (path == '/deliveries/errand' && method == 'POST') {
      return Success(MockData.createMobileErrand(body ?? {}));
    }
    if (path.contains('/deliveries/errand/history')) {
      return Success({'data': MockData.errandHistory()});
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
    if (path.contains('/rides/scheduled/estimate')) {
      return Success(MockData.scheduledEstimate(body ?? {}));
    }
    if (RegExp(r'^/rides/scheduled/[^/]+/cancel$').hasMatch(path) && method == 'POST') {
      return const Success({'success': true, 'status': 'CANCELLED'});
    }
    if (path.contains('/rides/scheduled')) {
      return Success({'data': MockData.scheduledRides()});
    }
    if (path == '/wallet') {
      return Success(MockData.wallet());
    }
    if (path.contains('/wallet/top-up') || path.contains('/wallet/topup')) {
      return Success(MockData.walletTopUp(body ?? {}));
    }
    if (path == '/history' || path.startsWith('/history?')) {
      return Success({'data': MockData.unifiedHistory(), 'currency': 'CDF', 'city': 'Kinshasa'});
    }
    if (path.contains('/drivers/earnings')) {
      return Success(MockData.earnings());
    }
    if (RegExp(r'^/rides/offers$').hasMatch(path) && method == 'GET') {
      return Success({'offers': MockData.driverOffers()});
    }
    if (RegExp(r'^/rides/[^/]+/accept$').hasMatch(path) && method == 'POST') {
      final id = path.split('/')[2];
      return Success({'ride': MockData.rideDetail(id), 'id': id, 'status': 'DRIVER_ASSIGNED'});
    }
    if (RegExp(r'^/rides/[^/]+/reject$').hasMatch(path) && method == 'POST') {
      return const Success({'success': true});
    }
    if (RegExp(r'^/rides/[^/]+/status$').hasMatch(path) && method == 'PATCH') {
      final id = path.split('/')[2];
      return Success({'ride': MockData.rideDetail(id), 'status': body?['status']});
    }
    if (path.contains('/drivers/profile') && method == 'GET') {
      return Success(MockData.driverProfile());
    }
    if (path.contains('/drivers/availability') ||
        path.contains('/drivers/kyc') ||
        path.contains('/drivers/location') ||
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
    if (RegExp(r'^/errands/[^/]+$').hasMatch(path) && method == 'GET') {
      final id = path.split('/').last;
      return Success({'order': MockData.errandDetail(id), 'errand': MockData.errandDetail(id)});
    }
    if (path.contains('/errands')) {
      return Success({'data': MockData.errandHistory()});
    }
    if (path.contains('/carpool/estimate')) {
      return Success(MockData.carpoolEstimate(body ?? {}));
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
    if (path.contains('/rental/estimate')) {
      return Success(MockData.rentalEstimate(body ?? {}));
    }
    if (path.contains('/rental/vehicles')) {
      return Success({'data': MockData.rentalVehicles(), 'currency': 'CDF'});
    }
    if (path == '/rental/bookings' && method == 'POST') {
      return Success(MockData.createRentalInquiry(body ?? {}));
    }
    if (path == '/rental/inquiries' && method == 'POST') {
      return Success(MockData.createRentalInquiry(body ?? {}));
    }
    if (path.contains('/rental/inquiries')) {
      return Success({'data': MockData.rentalInquiries(), 'inquiries': MockData.rentalInquiries()});
    }
    if (path.contains('/moving/estimate')) {
      return Success(MockData.movingEstimate(body ?? {}));
    }
    if (path == '/moving' && method == 'POST') {
      return Success(MockData.createMovingRequest(body ?? {}));
    }
    if (RegExp(r'^/moving/[^/]+$').hasMatch(path) && method == 'GET') {
      final id = path.split('/').last;
      return Success({'moving': MockData.movingDetail(id)});
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
          if (_mockMode) {
            final fallback = _mockFor('POST', path, body);
            if (fallback != null) return fallback;
          }
          return const Failure(NetworkFailure());
        }
        await Future.delayed(Duration(seconds: i + 1));
      }
    }
    return const Failure(NetworkFailure());
  }

  Future<Result<Map<String, dynamic>>> patch(
    String path,
    Map<String, dynamic> body, {
    int retries = 3,
  }) async {
    await ensureReady();
    final mock = _mockFor('PATCH', path, body);
    if (mock != null) return mock;

    for (var i = 0; i < retries; i++) {
      try {
        final response = await _client
            .patch(
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
          if (_mockMode) {
            final fallback = _mockFor('PATCH', path, body);
            if (fallback != null) return fallback;
          }
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
          if (_mockMode) {
            if (path.contains('/rides/history')) {
              final cached = await RideHistoryCache.load();
              if (cached.isNotEmpty) {
                return Success({'data': cached, 'cached': true});
              }
            }
            final fallback = _mockFor('GET', path, null);
            if (fallback != null) return fallback;
          }
          return const Failure(NetworkFailure());
        }
        await Future.delayed(Duration(seconds: i + 1));
      }
    }
    return const Failure(NetworkFailure());
  }

  Future<Result<List<Map<String, dynamic>>>> geoAutocomplete(String query, {String? city}) async {
    if (query.trim().length < 2) return const Success([]);
    await ensureReady();
    final encoded = Uri.encodeQueryComponent(query.trim());
    final cityParam = city != null ? '&city=${Uri.encodeQueryComponent(city)}' : '';
    final mock = _mockFor('GET', '/geo/autocomplete?q=$encoded$cityParam', null);
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
    final result = await get('/geo/autocomplete?q=$encoded$cityParam');
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

  Future<Result<List<Map<String, dynamic>>>> getDriverOffers() async {
    final result = await get('/rides/offers');
    return switch (result) {
      Success(:final data) => Success(
          List<Map<String, dynamic>>.from(data['offers'] as List? ?? []),
        ),
      Failure(:final error) => Failure(error),
    };
  }

  Future<Result<Map<String, dynamic>>> acceptRide(String rideId, {String? vehicleId}) async {
    final result = await post('/rides/$rideId/accept', {if (vehicleId != null) 'vehicleId': vehicleId});
    return switch (result) {
      Success(:final data) => Success(data['ride'] as Map<String, dynamic>? ?? data),
      Failure(:final error) => Failure(error),
    };
  }

  Future<Result<Map<String, dynamic>>> rejectRide(String rideId) async {
    return post('/rides/$rideId/reject', {});
  }

  Future<Result<Map<String, dynamic>>> updateRideStatus(String rideId, String status) async {
    final result = await patch('/rides/$rideId/status', {'status': status});
    return switch (result) {
      Success(:final data) => Success(data['ride'] as Map<String, dynamic>? ?? data),
      Failure(:final error) => Failure(error),
    };
  }

  Future<Result<Map<String, dynamic>>> updateDriverLocation(double lat, double lng) async {
    return post('/drivers/location', {'lat': lat, 'lng': lng});
  }

  Future<Result<Map<String, dynamic>>> getDriverProfile() async {
    final result = await get('/drivers/profile');
    return switch (result) {
      Success(:final data) => Success(data['profile'] as Map<String, dynamic>? ?? data),
      Failure(:final error) => Failure(error),
    };
  }

  Future<Result<Map<String, dynamic>>> payRide(
    String rideId, {
    required String method,
    required int amountCdf,
    String? phone,
  }) async {
    final userPhone = phone ?? await loadUserPhone() ?? '+243812345678';
    return post('/payments/rides/$rideId', {
      'method': method,
      'amountCdf': amountCdf,
      'phone': MarketConfig.normalizePhone(userPhone),
    });
  }

  /// Upload photo colis (base64) — retourne l'URL à passer à `photoUrl`.
  Future<Result<String>> uploadParcelPhoto(File file) async {
    await ensureReady();
    final bytes = await file.readAsBytes();
    if (bytes.length > 3 * 1024 * 1024) {
      return const Failure(ServerFailure('Photo trop volumineuse (max 3 Mo).'));
    }
    final mock = _mockFor('POST', '/deliveries/parcel/photo', {});
    if (mock != null) {
      return switch (mock) {
        Success(:final data) => Success(
            data['photoUrl']?.toString() ?? data['url']?.toString() ?? 'mock://photo',
          ),
        Failure(:final error) => Failure(error),
      };
    }
    final result = await post('/uploads/parcel-photo', {
      'imageBase64': base64Encode(bytes),
      'mimeType': 'image/jpeg',
    });
    return switch (result) {
      Success(:final data) => Success(
          data['photoUrl']?.toString() ??
              data['cloudinaryMockUrl']?.toString() ??
              data['url']?.toString() ??
              '',
        ),
      Failure(:final error) => Failure(error),
    };
  }

  bool rideHasDriver(Map<String, dynamic> ride) {
    if (ride['driverId'] != null) return true;
    if (ride['driver'] != null) return true;
    final status = ride['status']?.toString() ?? '';
    return status == 'ACCEPTED' ||
        status == 'DRIVER_ARRIVED' ||
        status == 'IN_PROGRESS' ||
        status == 'COMPLETED';
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

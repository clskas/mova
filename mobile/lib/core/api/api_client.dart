import 'dart:convert';
import 'dart:io' show File;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../cache/profile_cache.dart';
import '../cache/unified_history_cache.dart';
import '../cache/wallet_cache.dart';
import '../config/market_config.dart';
import '../error/mova_error_codes.dart';
import '../error/result.dart';
import '../offline/connectivity_service.dart';
import '../offline/sync_queue.dart';
import 'mock_data.dart';

final apiClientProvider = Provider((ref) {
  return ApiClient(
    connectivity: ref.watch(connectivityServiceProvider),
    syncQueue: ref.watch(syncQueueProvider),
  );
});

class ApiClient {
  ApiClient({
    http.Client? client,
    ConnectivityService? connectivity,
    SyncQueue? syncQueue,
  })  : _client = client ?? http.Client(),
        _connectivity = connectivity,
        _syncQueue = syncQueue;

  /// Client API en mode démo (tests uniquement — pas de file hors ligne).
  ApiClient.mock({http.Client? client})
      : _client = client ?? http.Client(),
        _connectivity = null,
        _syncQueue = null,
        _mockMode = true;

  final http.Client _client;
  final ConnectivityService? _connectivity;
  final SyncQueue? _syncQueue;
  String? _token;
  bool _mockMode = false;

  bool get isMockMode => _mockMode;
  bool get hasToken => _token != null && _token!.isNotEmpty;

  /// Réseau + passerelle OK — prêt à synchroniser la file.
  bool get canSync {
    if (_mockMode) return false;
    final connectivity = _connectivity;
    if (connectivity == null) return true;
    return connectivity.isOnline;
  }

  bool get _hasNoNetwork {
    if (_mockMode) return false;
    final connectivity = _connectivity;
    if (connectivity == null) return false;
    return !connectivity.hasNetwork;
  }

  /// Bloque uniquement sans réseau — la passerelle peut être réessayée même si /health a échoué.
  bool get _isOffline => _hasNoNetwork;

  void _markGatewayReachable() {
    _connectivity?.setGatewayUp(true);
  }

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
    await ProfileCache.clear();
    await WalletCache.clear();
    await UnifiedHistoryCache.clear();
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

  /// Vérifie la santé de la passerelle. Ne bascule plus en mode mock automatique.
  Future<bool> checkHealth() async {
    if (_mockMode) return false;
    if (_connectivity != null && !_connectivity!.hasNetwork) {
      _connectivity!.setGatewayUp(false);
      return false;
    }
    try {
      final res = await _client
          .get(Uri.parse('${MarketConfig.gatewayBaseUrl}/health'))
          .timeout(const Duration(seconds: 8));
      final ok = res.statusCode == 200;
      _connectivity?.setGatewayUp(ok);
      return ok;
    } catch (_) {
      _connectivity?.setGatewayUp(false);
      return false;
    }
  }

  Future<Map<String, dynamic>?> _readCacheForGet(String path) async {
    if (path.startsWith('/history')) {
      final snapshot = await UnifiedHistoryCache.load();
      if (snapshot.isEmpty) return null;
      return {
        'data': snapshot.data,
        if (snapshot.currency != null) 'currency': snapshot.currency,
        if (snapshot.city != null) 'city': snapshot.city,
        'cached': true,
        'syncedAt': snapshot.syncedAt?.toIso8601String(),
      };
    }
    if (path == '/wallet') {
      final snapshot = await WalletCache.load();
      if (snapshot.isEmpty) return null;
      return {
        'balanceCdf': snapshot.balanceCdf,
        'transactions': snapshot.transactions,
        'cached': true,
        'syncedAt': snapshot.syncedAt?.toIso8601String(),
      };
    }
    if (path.contains('/drivers/profile')) {
      final snapshot = await ProfileCache.load();
      if (snapshot.isEmpty) return null;
      return {
        'profile': snapshot.profile,
        'cached': true,
        'syncedAt': snapshot.syncedAt?.toIso8601String(),
      };
    }
    if (path.contains('/rides/history') || path == '/rides') {
      final snapshot = await UnifiedHistoryCache.load();
      if (snapshot.isEmpty) {
        final legacy = await RideHistoryCache.load();
        if (legacy.isEmpty) return null;
        return {'data': legacy, 'cached': true};
      }
      return {'data': snapshot.data, 'cached': true};
    }
    return null;
  }

  Future<void> _persistCacheForGet(String path, Map<String, dynamic> data) async {
    if (path.startsWith('/history')) {
      await UnifiedHistoryCache.save(data);
      return;
    }
    if (path == '/wallet') {
      await WalletCache.save(data);
      return;
    }
    if (path.contains('/drivers/profile')) {
      await ProfileCache.save(data);
      return;
    }
    if (path.contains('/rides/history') || path == '/rides') {
      final list = data['rides'] as List? ?? data['data'] as List? ?? [];
      await RideHistoryCache.save(list);
      await UnifiedHistoryCache.save({'data': list, 'rides': list});
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
    if (RegExp(r'^/payments/services/[^/]+/[^/]+$').hasMatch(path) && method == 'POST') {
      final parts = path.split('/');
      final refType = parts[3];
      final refId = parts[4];
      return Success(MockData.payService(refType, refId, body ?? {}));
    }
    if (RegExp(r'^/deliveries/[^/]+/cancel$').hasMatch(path) && method == 'POST') {
      return const Success({'success': true, 'status': 'CANCELLED'});
    }
    if (RegExp(r'^/errands/[^/]+/cancel$').hasMatch(path) && method == 'POST') {
      return const Success({'success': true, 'status': 'CANCELLED'});
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
    if (path == '/deliveries/offers' && method == 'GET') {
      return Success({'offers': MockData.deliveryOffers()});
    }
    if (path.contains('/deliveries/history') ||
        (path.startsWith('/deliveries/') && method == 'GET' && !path.contains('restaurants'))) {
      final id = path.split('/').last.split('?').first;
      if (id != 'history' && id != 'restaurants' && id != 'offers') {
        return Success({'delivery': MockData.parcelTracking(id)});
      }
      if (id == 'offers') {
        return Success({'offers': MockData.deliveryOffers()});
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
    if (path == '/rides/scheduled-inquiries' && method == 'POST') {
      return Success({'inquiry': MockData.createScheduledInquiry(body ?? {})});
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
    if (path.contains('/drivers/withdraw') && method == 'POST') {
      final amount = body?['amountCdf'] as int? ?? 5000;
      return Success({
        'success': true,
        'message': 'Retrait de $amount FC en cours vers +243 *** 0020',
        'amountCdf': amount,
        'provider': 'ORANGE_MONEY',
        'phoneMasked': '+243 *** 0020',
        'balanceCdf': 40000,
      });
    }
    if (path.contains('/drivers/onboarding') && method == 'GET') {
      return Success(MockData.driverOnboarding());
    }
    if (path.contains('/drivers/onboarding') && method == 'PATCH') {
      return Success(MockData.driverOnboarding());
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
    if (path.contains('/carpool/search') && method == 'GET') {
      return Success({'data': MockData.carpoolRides(), 'count': MockData.carpoolRides().length});
    }
    if (path == '/carpool/mine' && method == 'GET') {
      return Success({
        'asDriver': [MockData.createCarpoolRide({'driverName': 'Vous'})],
        'asPassenger': [
          {'bookingId': 'b1', 'seats': 1, 'trip': MockData.carpoolRides().first},
        ],
      });
    }
    if (path == '/carpool' && method == 'GET') {
      return Success({'trips': MockData.carpoolRides(), 'matches': MockData.carpoolRides(), 'data': MockData.carpoolRides()});
    }
    if (path == '/carpool/rides' && method == 'POST') {
      return Success({'trip': MockData.createCarpoolRide(body ?? {}), 'ride': MockData.createCarpoolRide(body ?? {})});
    }
    if (path == '/carpool' && method == 'POST') {
      return Success({'trip': MockData.createCarpoolRide(body ?? {}), 'ride': MockData.createCarpoolRide(body ?? {})});
    }
    if (path.contains('/carpool/') && (path.endsWith('/join') || path.endsWith('/book'))) {
      return Success({
        'success': true,
        'confirmation': {
          'tripId': path.split('/')[2],
          'seats': body?['seats'] ?? 1,
          'totalCdf': 3000,
          'driverName': 'Paul M.',
          'contactPhone': '+243 *** 123',
        },
      });
    }
    if (path.contains('/carpool/') && path.endsWith('/cancel') && method == 'POST') {
      return const Success({'cancelled': true});
    }
    if (path.contains('/carpool/') && path.endsWith('/start') && method == 'POST') {
      return Success({
        'trip': {
          ...MockData.createCarpoolRide({'id': path.split('/')[2]}),
          'status': 'IN_PROGRESS',
          'timelineStep': 'En route',
        },
      });
    }
    if (path.contains('/carpool/') && path.endsWith('/complete') && method == 'POST') {
      return Success({
        'trip': {
          ...MockData.createCarpoolRide({'id': path.split('/')[2]}),
          'status': 'COMPLETED',
          'timelineStep': 'Terminé',
        },
        'paymentReady': true,
      });
    }
    if (path.contains('/carpool/') && path.endsWith('/rate') && method == 'POST') {
      return Success({
        'rating': {'score': body?['score'] ?? 5, 'comment': body?['comment']},
        'driverRating': 4.8,
      });
    }
    if (RegExp(r'^/carpool/[^/]+$').hasMatch(path) && method == 'GET') {
      final id = path.split('/').last;
      final trip = MockData.carpoolRides().firstWhere(
        (t) => t['id'] == id,
        orElse: () => MockData.createCarpoolRide({'id': id}),
      );
      return Success({
        'trip': {
          ...trip,
          'passengers': [
            {'id': 'p1', 'userId': 'user-demo', 'seats': 1, 'label': 'Passager demo'},
          ],
        },
      });
    }
    if (RegExp(r'^/deliveries/[^/]+/accept$').hasMatch(path) && method == 'POST') {
      final id = path.split('/')[2];
      return Success({'delivery': MockData.parcelTracking(id), 'success': true});
    }
    if (path.contains('/rental/quote') || path.contains('/rental/estimate')) {
      return Success(MockData.rentalEstimate(body ?? {}));
    }
    if (RegExp(r'^/rental/vehicles/[^/]+$').hasMatch(path) && method == 'GET') {
      final id = path.split('/').last;
      return Success(MockData.rentalVehicleDetail(id));
    }
    if (path.contains('/rental/vehicles')) {
      return Success({'data': MockData.rentalVehicles(), 'currency': 'CDF'});
    }
    if (path == '/rental/bookings' && method == 'POST') {
      return Success(MockData.createRentalBooking(body ?? {}));
    }
    if (path == '/rental/bookings' && method == 'GET') {
      return Success({'data': MockData.rentalBookings()});
    }
    if (RegExp(r'^/rental/bookings/[^/]+$').hasMatch(path) && method == 'GET') {
      final id = path.split('/').last;
      final booking = MockData.rentalBookings().firstWhere(
        (b) => b['id'] == id,
        orElse: () => MockData.createRentalBooking({'id': id})['inquiry'] as Map<String, dynamic>,
      );
      return Success({'inquiry': booking, 'booking': booking});
    }
    if (path.contains('/rental/bookings/') && path.endsWith('/cancel') && method == 'POST') {
      return Success({'status': 'CLOSED', 'cancelled': true});
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
    bool skipOffline = false,
  }) async {
    await ensureReady();

    // Hors ligne : file de sync pour les créations (pas de mock pour les écritures).
    if (!skipOffline && _isOffline && !_mockMode) {
      if (SyncQueue.shouldQueue('POST', path) && _syncQueue != null) {
        final pendingId = await _syncQueue!.enqueue(
          method: 'POST',
          path: path,
          body: body,
        );
        _connectivity?.setPendingSyncCount(_syncQueue!.pendingCount);
        return Success(
          SyncQueue.optimisticResponse(path, body, pendingId),
        );
      }
      return const Failure(
        NetworkFailure('Action impossible hors ligne.'),
      );
    }

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
          _markGatewayReachable();
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
    bool skipOffline = false,
  }) async {
    await ensureReady();

    if (!skipOffline && _isOffline && !_mockMode) {
      if (SyncQueue.shouldQueue('PATCH', path) && _syncQueue != null) {
        final pendingId = await _syncQueue!.enqueue(
          method: 'PATCH',
          path: path,
          body: body,
        );
        _connectivity?.setPendingSyncCount(_syncQueue!.pendingCount);
        return Success(
          SyncQueue.optimisticResponse(path, body, pendingId),
        );
      }
      return const Failure(
        NetworkFailure('Action impossible hors ligne.'),
      );
    }

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
          _markGatewayReachable();
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

  Future<Result<dynamic>> get(String path, {int retries = 3, bool skipCache = false}) async {
    await ensureReady();

    // Hors ligne : cache local d'abord, mock uniquement en mode démo explicite.
    if (_isOffline && !_mockMode) {
      if (!skipCache) {
        final cached = await _readCacheForGet(path);
        if (cached != null) return Success(cached);
      }
      return const Failure(
        OfflineFailure('Données non disponibles hors ligne.'),
      );
    }

    final mock = _mockFor('GET', path, null);
    if (mock != null) return mock;

    for (var i = 0; i < retries; i++) {
      try {
        final response = await _client
            .get(Uri.parse('${MarketConfig.apiBaseUrl}$path'), headers: _headers)
            .timeout(const Duration(seconds: 30));

        final data = _decodeBody(response.body);
        if (response.statusCode >= 200 && response.statusCode < 300) {
          _markGatewayReachable();
          final normalized = _normalizeSuccess(data);
          await _persistCacheForGet(path, normalized);
          return Success(normalized);
        }
        if (data is Map<String, dynamic>) {
          return _failureFromResponse(response.statusCode, data);
        }
        return Failure(ServerFailure('Erreur serveur (${response.statusCode}).'));
      } catch (e) {
        if (i == retries - 1) {
          if (_mockMode) {
            if (!skipCache) {
              final cached = await _readCacheForGet(path);
              if (cached != null) return Success(cached);
            }
            final fallback = _mockFor('GET', path, null);
            if (fallback != null) return fallback;
          } else if (!skipCache) {
            final cached = await _readCacheForGet(path);
            if (cached != null) return Success(cached);
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

  Future<Result<Map<String, dynamic>>> createRide(Map<String, dynamic> body) async {
    final result = await post('/rides', body);
    return switch (result) {
      Success(:final data) => Success(data['ride'] as Map<String, dynamic>? ?? data),
      Failure(:final error) => Failure(error),
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

  Future<Result<List<Map<String, dynamic>>>> getDeliveryOffers() async {
    final result = await get('/deliveries/offers');
    return switch (result) {
      Success(:final data) => Success(
          List<Map<String, dynamic>>.from(data['offers'] as List? ?? []),
        ),
      Failure(:final error) => Failure(error),
    };
  }

  Future<Result<Map<String, dynamic>>> acceptDelivery(String deliveryId) async {
    final result = await post('/deliveries/$deliveryId/accept', {});
    return switch (result) {
      Success(:final data) => Success(data['delivery'] as Map<String, dynamic>? ?? data),
      Failure(:final error) => Failure(error),
    };
  }

  Future<Result<Map<String, dynamic>>> updateDeliveryStatus(String deliveryId, String status) async {
    final result = await patch('/deliveries/$deliveryId/status', {'status': status});
    return switch (result) {
      Success(:final data) => Success(data['delivery'] as Map<String, dynamic>? ?? data),
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

  Future<Result<Map<String, dynamic>>> recordTrackingPoint(
    String type,
    String referenceId,
    double lat,
    double lng,
  ) async {
    return post('/tracking/$type/$referenceId/points', {'lat': lat, 'lng': lng});
  }

  Future<Result<Map<String, dynamic>>> getCurrentUser({bool forceRefresh = false}) async {
    final result = await get('/users/me', skipCache: forceRefresh);
    return switch (result) {
      Success(:final data) => Success(Map<String, dynamic>.from(data as Map)),
      Failure(:final error) => Failure(error),
    };
  }

  Future<Result<Map<String, dynamic>>> getDriverProfile({bool forceRefresh = false}) async {
    if (forceRefresh) await ProfileCache.clear();
    final path = forceRefresh
        ? '/drivers/profile?_=${DateTime.now().millisecondsSinceEpoch}'
        : '/drivers/profile';
    final result = await get(path, skipCache: forceRefresh);
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

  Future<Result<Map<String, dynamic>>> confirmCashRide(String rideId, String pin) async {
    return post('/payments/rides/$rideId/cash/confirm', {'pin': pin});
  }

  Future<Result<Map<String, dynamic>>> createRideShareLink(String rideId) async {
    return post('/rides/$rideId/share-link', {});
  }

  Future<Result<Map<String, dynamic>>> reportSos({
    required String description,
    String? rideId,
    double? lat,
    double? lng,
  }) async {
    return post('/incidents', {
      'type': 'SOS',
      'description': description,
      if (rideId != null) 'rideId': rideId,
      if (lat != null) 'lat': lat,
      if (lng != null) 'lng': lng,
      'referenceType': rideId != null ? 'RIDE' : null,
      'referenceId': rideId,
    });
  }

  Future<Result<Map<String, dynamic>>> payService(
    String referenceType,
    String referenceId, {
    required String method,
    required int amountCdf,
    String? phone,
  }) async {
    final userPhone = phone ?? await loadUserPhone() ?? '+243812345678';
    return post('/payments/services/$referenceType/$referenceId', {
      'method': method,
      'amountCdf': amountCdf,
      'phone': MarketConfig.normalizePhone(userPhone),
    });
  }

  Future<Result<Map<String, dynamic>>> cancelDelivery(String deliveryId) async {
    return post('/deliveries/$deliveryId/cancel', {});
  }

  Future<Result<Map<String, dynamic>>> cancelErrand(String errandId) async {
    return post('/errands/$errandId/cancel', {});
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

  /// Upload photo véhicule — retourne l'URL `/api/uploads/vehicles/...`.
  Future<Result<String>> uploadVehiclePhoto(File file) async {
    await ensureReady();
    final bytes = await file.readAsBytes();
    if (bytes.length > 3 * 1024 * 1024) {
      return const Failure(ServerFailure('Photo trop volumineuse (max 3 Mo).'));
    }
    final result = await post('/uploads/vehicle-photo', {
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

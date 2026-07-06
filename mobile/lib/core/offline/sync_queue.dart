import 'dart:async';
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_flutter/hive_flutter.dart';

import '../error/result.dart';

final syncQueueProvider = Provider<SyncQueue>((ref) => SyncQueue.instance);

typedef SyncDispatcher = Future<Result<Map<String, dynamic>>> Function(
  String method,
  String path,
  Map<String, dynamic> body,
);

/// Action HTTP mise en attente pendant le mode hors ligne.
class PendingAction {
  PendingAction({
    required this.id,
    required this.method,
    required this.path,
    required this.body,
    required this.createdAt,
    this.retries = 0,
  });

  final String id;
  final String method;
  final String path;
  final Map<String, dynamic> body;
  final DateTime createdAt;
  int retries;

  Map<String, dynamic> toJson() => {
        'id': id,
        'method': method,
        'path': path,
        'body': body,
        'createdAt': createdAt.toIso8601String(),
        'retries': retries,
      };

  factory PendingAction.fromJson(Map<String, dynamic> json) => PendingAction(
        id: json['id'] as String,
        method: json['method'] as String,
        path: json['path'] as String,
        body: Map<String, dynamic>.from(json['body'] as Map),
        createdAt: DateTime.parse(json['createdAt'] as String),
        retries: json['retries'] as int? ?? 0,
      );
}

class FlushResult {
  const FlushResult({this.synced = 0, this.failed = 0, this.skipped = false});

  final int synced;
  final int failed;
  final bool skipped;
}

/// File de synchronisation persistante (Hive) pour les écritures hors ligne.
class SyncQueue {
  SyncQueue._();

  static const _boxName = 'mova_sync_queue';
  static SyncQueue? _instance;

  static SyncQueue get instance {
    if (_instance == null) {
      throw StateError('SyncQueue.init() must be called before use');
    }
    return _instance!;
  }

  late Box<String> _box;
  final _countController = StreamController<int>.broadcast();

  Stream<int> get pendingCountStream => _countController.stream;

  static Future<void> init() async {
    await Hive.initFlutter();
    if (!Hive.isBoxOpen(_boxName)) {
      await Hive.openBox<String>(_boxName);
    }
    _instance = SyncQueue._();
    _instance!._box = Hive.box<String>(_boxName);
    _instance!._emitCount();
  }

  int get pendingCount => _box.length;

  List<PendingAction> getAll() {
    return _box.values
        .map((raw) => PendingAction.fromJson(jsonDecode(raw) as Map<String, dynamic>))
        .toList()
      ..sort((a, b) => a.createdAt.compareTo(b.createdAt));
  }

  Future<String> enqueue({
    required String method,
    required String path,
    required Map<String, dynamic> body,
  }) async {
    final id = 'pending-${DateTime.now().millisecondsSinceEpoch}';
    final action = PendingAction(
      id: id,
      method: method,
      path: path,
      body: body,
      createdAt: DateTime.now(),
    );
    await _box.put(id, jsonEncode(action.toJson()));
    _emitCount();
    return id;
  }

  /// Vide la file lorsque le réseau et la passerelle sont disponibles.
  Future<FlushResult> flush(SyncDispatcher dispatch) async {
    var synced = 0;
    var failed = 0;
    final actions = getAll();

    for (final action in actions) {
      final result = await dispatch(action.method, action.path, action.body);
      if (result is Success) {
        await _box.delete(action.id);
        synced++;
      } else {
        action.retries++;
        if (action.retries >= 5) {
          await _box.delete(action.id);
        } else {
          await _box.put(action.id, jsonEncode(action.toJson()));
        }
        failed++;
      }
    }

    _emitCount();
    return FlushResult(synced: synced, failed: failed);
  }

  void _emitCount() {
    if (!_countController.isClosed) {
      _countController.add(_box.length);
    }
  }

  /// Chemins éligibles à la mise en file (créations / recharges / profil / chauffeur).
  static bool shouldQueue(String method, String path) {
    if (method == 'PATCH' && path == '/users/me') return true;
    if (method == 'PATCH') {
      if (RegExp(r'^/rides/[^/]+/status$').hasMatch(path)) return true;
      if (RegExp(r'^/deliveries/[^/]+/status$').hasMatch(path)) return true;
      return false;
    }
    if (method == 'POST') {
      if (RegExp(r'^/rides/[^/]+/accept$').hasMatch(path)) return true;
      if (RegExp(r'^/rides/[^/]+/reject$').hasMatch(path)) return true;
      if (RegExp(r'^/deliveries/[^/]+/accept$').hasMatch(path)) return true;
      if (RegExp(r'^/deliveries/[^/]+/reject$').hasMatch(path)) return true;
      if (path == '/drivers/location') return true;
      if (RegExp(r'^/tracking/[^/]+/[^/]+/points$').hasMatch(path)) return true;
    }
    if (method != 'POST') return false;
    if (path.contains('/auth/')) return false;
    if (path.contains('/payments/')) return false;
    if (path.contains('/uploads/')) return false;
    if (path.contains('/estimate')) return false;
    if (path.contains('/search')) return false;

    const exactPaths = {
      '/rides',
      '/express',
      '/moving',
      '/errands',
      '/carpool',
      '/deliveries/parcel',
      '/deliveries/food',
      '/deliveries/express',
      '/deliveries/errand',
      '/rides/scheduled',
      '/rental/bookings',
      '/rental/inquiries',
      '/wallet/top-up',
      '/wallet/topup',
    };
    return exactPaths.contains(path);
  }

  /// Réponse optimiste locale pour une action mise en file.
  static Map<String, dynamic> optimisticResponse(
    String path,
    Map<String, dynamic> body,
    String pendingId,
  ) {
    final localId = 'offline-$pendingId';
    const message = 'Enregistré hors ligne, synchronisation à la reconnexion';
    final meta = {
      'offline': true,
      'pendingSyncId': pendingId,
      'message': message,
    };

    if (path == '/rides' || path.startsWith('/rides/scheduled')) {
      final key = path.contains('scheduled') ? 'scheduledRide' : 'ride';
      return {
        key: {
          'id': localId,
          'status': 'PENDING',
          ...body,
          ...meta,
        },
        'ride': {
          'id': localId,
          'status': 'PENDING',
          ...body,
          ...meta,
        },
        ...meta,
      };
    }
    if (path.contains('/deliveries/') ||
        path == '/express' ||
        path.contains('/express')) {
      return {
        'delivery': {
          'id': localId,
          'status': 'PENDING',
          ...body,
          ...meta,
        },
        ...meta,
      };
    }
    if (path == '/errands' || path.contains('/deliveries/errand')) {
      final order = {'id': localId, 'status': 'PENDING', ...body, ...meta};
      return {'order': order, 'errand': order, ...meta};
    }
    if (path.contains('/wallet/top')) {
      return {
        'status': 'PENDING_SYNC',
        'amountCdf': body['amountCdf'],
        ...meta,
      };
    }
    if (path.contains('/carpool')) {
      final trip = {'id': localId, 'status': 'PENDING', ...body, ...meta};
      return {'trip': trip, 'ride': trip, ...meta};
    }
    if (path == '/moving') {
      return {
        'moving': {'id': localId, 'status': 'PENDING', ...body, ...meta},
        ...meta,
      };
    }
    if (path.contains('/rental/')) {
      return {
        'booking': {'id': localId, 'status': 'PENDING', ...body, ...meta},
        'inquiry': {'id': localId, 'status': 'PENDING', ...body, ...meta},
        ...meta,
      };
    }
    if (path == '/users/me') {
      return {...body, ...meta};
    }
    if (RegExp(r'^/rides/[^/]+/accept$').hasMatch(path)) {
      final rideId = path.split('/')[2];
      return {'ride': {'id': rideId, 'status': 'ACCEPTED', ...meta}, 'success': true, ...meta};
    }
    if (RegExp(r'^/rides/[^/]+/reject$').hasMatch(path) ||
        RegExp(r'^/deliveries/[^/]+/reject$').hasMatch(path)) {
      return {'success': true, ...meta};
    }
    if (RegExp(r'^/deliveries/[^/]+/accept$').hasMatch(path)) {
      final deliveryId = path.split('/')[2];
      return {'delivery': {'id': deliveryId, 'status': 'PICKED_UP', ...meta}, 'success': true, ...meta};
    }
    if (RegExp(r'^/rides/[^/]+/status$').hasMatch(path) ||
        RegExp(r'^/deliveries/[^/]+/status$').hasMatch(path)) {
      return {'status': body['status'], 'success': true, ...meta};
    }
    if (path == '/drivers/location') {
      return {'success': true, ...meta};
    }
    return {'id': localId, ...meta};
  }
}

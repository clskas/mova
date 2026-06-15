import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

/// Cache local du portefeuille (`/wallet`).
class WalletCache {
  static const _payloadKey = 'mova_wallet_payload';
  static const _syncedAtKey = 'mova_wallet_synced_at';

  static Future<void> save(Map<String, dynamic> response) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_payloadKey, jsonEncode(response));
    await prefs.setString(_syncedAtKey, DateTime.now().toIso8601String());
  }

  static Future<WalletSnapshot> load() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_payloadKey);
    final syncedRaw = prefs.getString(_syncedAtKey);
    if (raw == null) return const WalletSnapshot();

    final decoded = jsonDecode(raw) as Map<String, dynamic>;
    final txs = decoded['transactions'] as List? ?? [];
    return WalletSnapshot(
      balanceCdf: decoded['balanceCdf'] as int? ?? 0,
      transactions: txs.cast<Map<String, dynamic>>(),
      syncedAt: syncedRaw != null ? DateTime.tryParse(syncedRaw) : null,
    );
  }
}

class WalletSnapshot {
  const WalletSnapshot({
    this.balanceCdf = 0,
    this.transactions = const [],
    this.syncedAt,
  });

  final int balanceCdf;
  final List<Map<String, dynamic>> transactions;
  final DateTime? syncedAt;

  bool get isEmpty => syncedAt == null;
}

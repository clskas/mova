import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../core/api/api_client.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';

/// Paiement de la dette espèces au guichet MOVA : code à 6 chiffres + QR pour validation admin.
class CashDebtCashPaymentScreen extends ConsumerStatefulWidget {
  const CashDebtCashPaymentScreen({super.key, this.initialRequest});

  final Map<String, dynamic>? initialRequest;

  @override
  ConsumerState<CashDebtCashPaymentScreen> createState() => _CashDebtCashPaymentScreenState();
}

class _CashDebtCashPaymentScreenState extends ConsumerState<CashDebtCashPaymentScreen> {
  Map<String, dynamic>? _request;
  bool _loading = true;
  String? _error;
  Timer? _pollTimer;

  @override
  void initState() {
    super.initState();
    _request = widget.initialRequest;
    if (_request != null) {
      _loading = false;
      _startPolling();
    } else {
      _createRequest();
    }
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }

  String? get _requestId => _request?['requestId']?.toString();
  String get _code => _request?['code']?.toString() ?? '------';
  String get _qrPayload => _request?['qrPayload']?.toString() ?? '';
  int get _amountCdf => (_request?['amountCdf'] as num?)?.toInt() ?? 0;

  Future<void> _createRequest() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final api = ref.read(apiClientProvider);
    final result = await api.createCashDebtCashRequest();
    if (!mounted) return;
    switch (result) {
      case Success(:final data):
        if (data['created'] == false) {
          setState(() {
            _loading = false;
            _error = data['message']?.toString() ?? 'Aucune dette espèces ouverte';
          });
          return;
        }
        setState(() {
          _request = data;
          _loading = false;
        });
        _startPolling();
      case Failure(:final error):
        setState(() {
          _loading = false;
          _error = error.message;
        });
    }
  }

  void _startPolling() {
    _pollTimer?.cancel();
    final id = _requestId;
    if (id == null || id.isEmpty) return;
    _pollTimer = Timer.periodic(const Duration(seconds: 4), (_) => _checkStatus());
  }

  Future<void> _checkStatus() async {
    final id = _requestId;
    if (id == null || id.isEmpty || !mounted) return;
    final api = ref.read(apiClientProvider);
    final result = await api.getCashDebtCashRequestStatus(id);
    if (!mounted) return;
    if (result case Success(:final data) when data['found'] == true && data['status'] == 'CONFIRMED') {
      _pollTimer?.cancel();
      if (!mounted) return;
      Navigator.pop(context, true);
    }
  }

  String _expiresLabel() {
    final raw = _request?['expiresAt']?.toString();
    if (raw == null) return '';
    final dt = DateTime.tryParse(raw)?.toLocal();
    if (dt == null) return '';
    return 'Valide jusqu\'à ${DateFormat('HH:mm').format(dt)}';
  }

  @override
  Widget build(BuildContext context) {
    return MovaScreen(
      title: 'Payer en espèces',
      child: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    MovaErrorBanner(message: _error!, onRetry: _createRequest),
                    const SizedBox(height: 16),
                    MovaButton(label: 'Retour', isSecondary: true, onPressed: () => Navigator.pop(context)),
                  ],
                )
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text(
                      'Présentez ce code au guichet MOVA après avoir remis l\'argent en espèces.',
                      style: TextStyle(color: MovaColors.textSecondary, height: 1.4),
                    ),
                    const SizedBox(height: 16),
                    MovaCard(
                      child: Column(
                        children: [
                          Text(
                            MarketConfig.formatCdf(_amountCdf),
                            style: const TextStyle(
                              fontSize: 22,
                              fontWeight: FontWeight.bold,
                              color: MovaColors.orange,
                            ),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            _expiresLabel(),
                            style: const TextStyle(fontSize: 12, color: MovaColors.textSecondary),
                          ),
                          const SizedBox(height: 16),
                          if (_qrPayload.isNotEmpty)
                            Container(
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(
                                color: Colors.white,
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(color: MovaColors.cloud),
                              ),
                              child: QrImageView(
                                data: _qrPayload,
                                version: QrVersions.auto,
                                size: 180,
                                eyeStyle: const QrEyeStyle(
                                  eyeShape: QrEyeShape.square,
                                  color: MovaColors.violet,
                                ),
                                dataModuleStyle: const QrDataModuleStyle(
                                  dataModuleShape: QrDataModuleShape.square,
                                  color: MovaColors.violet,
                                ),
                              ),
                            ),
                          const SizedBox(height: 16),
                          Text(
                            _code,
                            style: const TextStyle(
                              fontSize: 32,
                              fontWeight: FontWeight.bold,
                              letterSpacing: 8,
                              color: MovaColors.violet,
                            ),
                          ),
                          const SizedBox(height: 8),
                          TextButton.icon(
                            onPressed: () {
                              Clipboard.setData(ClipboardData(text: _code));
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(content: Text('Code copié')),
                              );
                            },
                            icon: const Icon(Icons.copy, size: 18),
                            label: const Text('Copier le code'),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),
                    const Text(
                      'En attente de validation par l\'équipe MOVA… Vous serez notifié dès que le paiement est confirmé.',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 13, color: MovaColors.textSecondary, height: 1.4),
                    ),
                    const SizedBox(height: 24),
                    MovaButton(
                      label: 'Actualiser',
                      isSecondary: true,
                      onPressed: _checkStatus,
                    ),
                  ],
                ),
    );
  }
}

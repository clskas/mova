import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:qr_flutter/qr_flutter.dart';
import '../../core/api/api_client.dart';
import '../../core/config/client_apps_config.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import '../billing/receipt_screen.dart';
import '../../core/wallet/mobile_money_prompt.dart';

const _allPaymentMethods = [
  ('WALLET', 'Portefeuille SENGA', Icons.account_balance_wallet, MovaColors.violet),
  ('ORANGE_MONEY', 'Orange Money', Icons.phone_android, MovaColors.orange),
  ('MPESA', 'M-Pesa', Icons.phone_android, Color(0xFFE60000)),
  ('AIRTEL_MONEY', 'Airtel Money', Icons.phone_android, Color(0xFFED1C24)),
  ('CASH', 'Espèces', Icons.payments_outlined, MovaColors.green),
];

const _mobileMoneyMethods = {'ORANGE_MONEY', 'MPESA', 'AIRTEL_MONEY'};

class PaymentScreen extends ConsumerStatefulWidget {
  const PaymentScreen({
    super.key,
    this.rideId,
    this.serviceType,
    this.serviceId,
    required this.amountCdf,
    this.completionPin,
    this.promptCashPinOnSelect,
  }) : assert(rideId != null || (serviceType != null && serviceId != null));

  /// Course taxi — utilise POST /payments/rides/:id
  final String? rideId;

  /// Livraison, course, etc. — utilise POST /payments/services/:type/:id
  final String? serviceType;
  final String? serviceId;

  final int amountCdf;
  final String? completionPin;

  /// Ouvre automatiquement la fenêtre PIN espèces à la sélection (livraisons).
  final bool? promptCashPinOnSelect;

  @override
  ConsumerState<PaymentScreen> createState() => _PaymentScreenState();
}

class _PaymentScreenState extends ConsumerState<PaymentScreen> {
  final _phoneController = TextEditingController(text: '+243');
  String _method = 'WALLET';
  bool _loading = false;
  bool _loadingDetails = true;
  bool _paymentReady = true;
  bool _escrowCollect = false;
  bool _cashAllowed = true;
  String? _error;
  late int _amountCdf;
  bool _awaitingMobileMoney = false;
  Timer? _mmPollTimer;
  int _mmPollAttempts = 0;
  Set<String> _enabledMm = {'MPESA', 'AIRTEL_MONEY'};

  List<(String, String, IconData, Color)> get _paymentMethods => _allPaymentMethods
      .where((m) => !_mobileMoneyMethods.contains(m.$1) || _enabledMm.contains(m.$1))
      .toList();

  @override
  void initState() {
    super.initState();
    _amountCdf = widget.amountCdf;
    _loadPhone();
    _loadPaymentDetails();
    _loadMmVisibility();
  }

  Future<void> _loadMmVisibility() async {
    final api = ref.read(apiClientProvider);
    final result = await api.get('/public/client-config');
    if (!mounted) return;
    if (result case Success(:final data)) {
      final mm = data['mobileMoney'];
      final row = mm is Map ? mm['senga'] : null;
      if (row is Map) {
        final next = <String>{};
        for (final id in _mobileMoneyMethods) {
          if (mmOperatorEnabledFor(row, id, 'topup')) next.add(id);
        }
        if (next.isNotEmpty) {
          setState(() {
            _enabledMm = next;
            if (_mobileMoneyMethods.contains(_method) && !_enabledMm.contains(_method)) {
              _method = 'WALLET';
            }
          });
        }
      }
    }
  }

  @override
  void dispose() {
    _mmPollTimer?.cancel();
    _phoneController.dispose();
    super.dispose();
  }

  Future<void> _loadPhone() async {
    final api = ref.read(apiClientProvider);
    final phone = await api.loadUserPhone();
    if (phone != null && mounted) {
      setState(() => _phoneController.text = phone);
    }
  }

  Future<void> _loadPaymentDetails() async {
    final api = ref.read(apiClientProvider);
    if (widget.serviceType != null && widget.serviceId != null) {
      final preview = await api.getServicePaymentInfo(widget.serviceType!, widget.serviceId!);
      if (preview case Success(:final data)) {
        final amount = data['amountCdf'] as int?;
        final ready = data['paymentReady'] != false;
        if (mounted) {
          setState(() {
            if (amount != null && amount > 0) _amountCdf = amount;
            _paymentReady = ready;
            _escrowCollect = data['escrowCollect'] == true;
            _cashAllowed = data['cashAllowed'] != false;
            if (!ready) {
              _error = switch (widget.serviceType) {
                'RENTAL' =>
                  'Le paiement sera disponible après le retour du véhicule. Le partenaire doit cliquer « Véhicule rendu ».',
                'DELIVERY' =>
                  'Le paiement espèces sera disponible après la livraison.',
                'ERRAND' =>
                  'Le paiement espèces sera disponible après la fin des courses.',
                _ => null,
              };
            }
          });
        }
      }
    }
    if (widget.rideId != null) {
      final result = await api.getRide(widget.rideId!);
      if (result case Success(:final data)) {
        if (!mounted) return;
        setState(() {
          _amountCdf = (data['finalFareCdf'] ?? data['estimatedFareCdf'] ?? _amountCdf) as int;
          _loadingDetails = false;
        });
        return;
      }
    }
    if (!mounted) return;
    setState(() => _loadingDetails = false);
  }

  void _onMethodSelected(String method) {
    setState(() => _method = method);
  }

  bool get _needsPhone => _mobileMoneyMethods.contains(_method);

  bool get _showQrPayment => _needsPhone && widget.rideId != null;

  String get _qrPayload {
    final ref = widget.rideId!.replaceAll('-', '').substring(0, 8).toUpperCase();
    return jsonEncode({
      'app': 'SENGA',
      'type': 'RIDE_PAYMENT',
      'rideId': widget.rideId,
      'amountCdf': _amountCdf,
      'method': _method,
      'ref': 'SENGA-$ref',
    });
  }

  String get _paymentRef {
    final id = widget.rideId ?? widget.serviceId ?? '';
    if (id.isEmpty) return 'SENGA';
    return 'SENGA-${id.replaceAll('-', '').substring(0, 8).toUpperCase()}';
  }

  Future<void> _goToReceipt({bool pendingCash = false}) async {
    if (!mounted) return;
    if (widget.rideId != null) {
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(
          builder: (_) => ReceiptScreen(
            rideId: widget.rideId,
            showRatingAfter: true,
            pendingCash: pendingCash,
            amountCdf: pendingCash ? _amountCdf : null,
          ),
        ),
      );
      return;
    }
    final isErrand = widget.serviceType?.toUpperCase() == 'ERRAND';
    if (_escrowCollect) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Montant séquestré. Le livreur peut partir — il sera payé après votre code PIN.'),
        ),
      );
      Navigator.pop(context, true);
      return;
    }
    if (!pendingCash && !isErrand) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Paiement effectué avec succès')),
      );
    }
    Navigator.pushReplacement(
      context,
      MaterialPageRoute(
        builder: (_) => ReceiptScreen(
          serviceType: widget.serviceType,
          serviceId: widget.serviceId,
          pendingCash: pendingCash,
          amountCdf: pendingCash ? _amountCdf : null,
          showRatingAfter: isErrand,
        ),
      ),
    );
  }

  void _stopMmPoll() {
    _mmPollTimer?.cancel();
    _mmPollTimer = null;
  }

  Future<void> _startMobileMoneyWait() async {
    _stopMmPoll();
    _mmPollAttempts = 0;
    setState(() {
      _awaitingMobileMoney = true;
      _loading = false;
      _error = null;
    });
    await _pollMobileMoneyOnce();
    if (!mounted || !_awaitingMobileMoney) return;
    _mmPollTimer = Timer.periodic(const Duration(seconds: 3), (_) => _pollMobileMoneyOnce());
  }

  Future<void> _pollMobileMoneyOnce() async {
    if (!mounted || !_awaitingMobileMoney) return;
    _mmPollAttempts++;
    if (_mmPollAttempts > 60) {
      _stopMmPoll();
      setState(() {
        _awaitingMobileMoney = false;
        _error =
            'Toujours en attente de confirmation Mobile Money. Vérifiez votre téléphone, puis réessayez.';
      });
      return;
    }
    final api = ref.read(apiClientProvider);
    final Result<Map<String, dynamic>> result;
    if (widget.rideId != null) {
      result = await api.getRidePaymentStatus(widget.rideId!);
    } else {
      result = await api.getServicePaymentStatus(widget.serviceType!, widget.serviceId!);
    }
    if (!mounted || !_awaitingMobileMoney) return;
    switch (result) {
      case Success(:final data):
        if (data['isPaid'] == true || data['status']?.toString() == 'COMPLETED') {
          _stopMmPoll();
          setState(() => _awaitingMobileMoney = false);
          await _goToReceipt();
          return;
        }
        final status = data['status']?.toString();
        if (status == 'FAILED') {
          _stopMmPoll();
          setState(() {
            _awaitingMobileMoney = false;
            _error = data['failureReason']?.toString() ??
                'Paiement Mobile Money refusé ou annulé. Réessayez.';
          });
        }
      case Failure():
        // Keep waiting — transient network errors during USSD.
        break;
    }
  }

  Future<void> _pay() async {
    if (_loading || _awaitingMobileMoney) return;
    if (!_paymentReady) {
      final msg = switch (widget.serviceType) {
        'DELIVERY' =>
          'Le paiement espèces sera disponible après la livraison du colis.',
        'ERRAND' =>
          'Le paiement espèces sera disponible après la fin des courses.',
        'RENTAL' =>
          'Le paiement sera disponible après le retour du véhicule. Le partenaire doit cliquer « Véhicule rendu ».',
        _ => 'Le paiement n\'est pas encore disponible pour cette course.',
      };
      setState(() => _error = msg);
      return;
    }
    if (_needsPhone) {
      final phone = MarketConfig.normalizePhone(_phoneController.text);
      if (!MarketConfig.validatePhone(phone)) {
        setState(() => _error = 'Numéro mobile money invalide (+243XXXXXXXXX).');
        return;
      }
    }

    setState(() {
      _loading = true;
      _error = null;
    });
    final api = ref.read(apiClientProvider);
    final Result<Map<String, dynamic>> result;
    if (widget.rideId != null) {
      result = await api.payRide(
        widget.rideId!,
        method: _method,
        phone: _needsPhone ? MarketConfig.normalizePhone(_phoneController.text) : null,
      );
    } else {
      result = await api.payService(
        widget.serviceType!,
        widget.serviceId!,
        method: _method,
        phone: _needsPhone ? MarketConfig.normalizePhone(_phoneController.text) : null,
      );
    }
    if (!mounted) return;
    setState(() => _loading = false);

    switch (result) {
      case Success(:final data):
        if (_method == 'CASH' && data['pendingCash'] == true) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Paiement espèces en attente — remettez l\'argent au livreur.'),
            ),
          );
          await _goToReceipt(pendingCash: true);
          return;
        }
        if (data['pendingMobileMoney'] == true) {
          await openMobileMoneyPrompt(
            paymentUrl: data['paymentUrl']?.toString(),
            ussdCode: data['ussdCode']?.toString(),
          );
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                data['message']?.toString() ??
                    'Confirmez le paiement sur votre téléphone Mobile Money.',
              ),
            ),
          );
          await _startMobileMoneyWait();
          return;
        }
        await _goToReceipt();
      case Failure(:final error):
        setState(() {
          _error = error.message;
        });
    }
  }

  @override
  Widget build(BuildContext context) {
    return MovaScreen(
      title: 'Paiement',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          MovaCard(
            child: Column(
              children: [
                const Text('Montant à payer', style: TextStyle(color: MovaColors.textSecondary)),
                const SizedBox(height: 8),
                Text(
                  MarketConfig.formatCdf(_amountCdf),
                  style: const TextStyle(
                    fontSize: 28,
                    fontWeight: FontWeight.bold,
                    color: MovaColors.green,
                  ),
                ),
                if (_needsPhone) ...[
                  const SizedBox(height: 8),
                  Text(
                    'Montant fixé par SENGA — sur votre téléphone Mobile Money, confirmez uniquement le PIN (ne saisissez pas un autre montant).',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: MovaColors.textSecondary.withValues(alpha: 0.95), fontSize: 12),
                  ),
                ],
                if (_loadingDetails)
                  const Padding(
                    padding: EdgeInsets.only(top: 12),
                    child: SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                  )
                else if (_method == 'CASH') ...[
                  const SizedBox(height: 12),
                  const Text(
                    'Remettez l\'argent au chauffeur ou livreur. Il confirmera « Cash reçu » dans son app — aucun code à communiquer.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: MovaColors.textSecondary, fontSize: 12),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 20),
          if (_escrowCollect) ...[
            const Text(
              'Livraison garantie : le livreur ne part qu\'après ce paiement. Il n\'est payé qu\'à la réception (PIN).',
              style: TextStyle(color: MovaColors.textSecondary, fontSize: 13),
            ),
            const SizedBox(height: 12),
          ],
          Text('Mode de paiement', style: Theme.of(context).textTheme.titleSmall),
          const SizedBox(height: 8),
          ..._paymentMethods.where((m) => _cashAllowed || m.$1 != 'CASH').map((m) {
            final (id, label, icon, color) = m;
            return Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: MovaCard(
                onTap: () => _onMethodSelected(id),
                child: Row(
                  children: [
                    Icon(icon, color: color),
                    const SizedBox(width: 12),
                    Expanded(child: Text(label)),
                    Radio<String>(
                      value: id,
                      groupValue: _method,
                      onChanged: (v) {
                        if (v != null) _onMethodSelected(v);
                      },
                      activeColor: MovaColors.violet,
                    ),
                  ],
                ),
              ),
            );
          }),
          if (_needsPhone) ...[
            const SizedBox(height: 8),
            TextField(
              controller: _phoneController,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(
                labelText: 'Numéro mobile money',
                hintText: '+243XXXXXXXXX',
                prefixIcon: Icon(Icons.phone),
              ),
            ),
            if (_showQrPayment) ...[
              const SizedBox(height: 16),
              MovaCard(
                child: Column(
                  children: [
                    const Text(
                      'Paiement rapide par QR',
                      style: TextStyle(fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(height: 4),
                    const Text(
                      'Scannez ce code avec l\'app mobile money ou partagez la référence au guichet.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: MovaColors.textSecondary, fontSize: 12),
                    ),
                    const SizedBox(height: 12),
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
                    const SizedBox(height: 12),
                    Text(
                      'Réf. $_paymentRef',
                      style: const TextStyle(fontWeight: FontWeight.bold, letterSpacing: 1.2),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      MarketConfig.formatCdf(_amountCdf),
                      style: const TextStyle(color: MovaColors.green, fontWeight: FontWeight.w600),
                    ),
                  ],
                ),
              ),
            ],
          ],
          if (_awaitingMobileMoney) ...[
            const SizedBox(height: 16),
            MovaCard(
              child: Column(
                children: [
                  const SizedBox(
                    width: 28,
                    height: 28,
                    child: CircularProgressIndicator(strokeWidth: 2.5),
                  ),
                  const SizedBox(height: 12),
                  const Text(
                    'Confirmez sur votre téléphone',
                    style: TextStyle(fontWeight: FontWeight.w600),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'Une demande Mobile Money a été envoyée. Validez le paiement (USSD / PIN), '
                    'nous confirmerons automatiquement.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: MovaColors.textSecondary, fontSize: 13),
                  ),
                  const SizedBox(height: 12),
                  TextButton(
                    onPressed: () {
                      _stopMmPoll();
                      setState(() => _awaitingMobileMoney = false);
                    },
                    child: const Text('Annuler l\'attente'),
                  ),
                ],
              ),
            ),
          ],
          if (_error != null) ...[
            const SizedBox(height: 12),
            MovaErrorBanner(message: _error!, onRetry: _pay),
          ],
          const SizedBox(height: 24),
          MovaButton(
            label: _awaitingMobileMoney
                ? 'En attente de confirmation…'
                : 'Payer ${MarketConfig.formatCdf(_amountCdf)}',
            isLoading: _loading,
            icon: Icons.lock_outline,
            onPressed: _loading || !_paymentReady || _awaitingMobileMoney ? null : _pay,
          ),
        ],
      ),
    );
  }
}

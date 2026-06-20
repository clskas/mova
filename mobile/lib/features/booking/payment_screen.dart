import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_client.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import '../rating/rating_screen.dart';

const _paymentMethods = [
  ('WALLET', 'Portefeuille MOVA', Icons.account_balance_wallet, MovaColors.violet),
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
  }) : assert(rideId != null || (serviceType != null && serviceId != null));

  /// Course taxi — utilise POST /payments/rides/:id
  final String? rideId;

  /// Livraison, course, etc. — utilise POST /payments/services/:type/:id
  final String? serviceType;
  final String? serviceId;

  final int amountCdf;
  final String? completionPin;

  @override
  ConsumerState<PaymentScreen> createState() => _PaymentScreenState();
}

class _PaymentScreenState extends ConsumerState<PaymentScreen> {
  final _phoneController = TextEditingController(text: '+243');
  String _method = 'WALLET';
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadPhone();
  }

  @override
  void dispose() {
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

  bool get _needsPhone => _mobileMoneyMethods.contains(_method);

  Future<void> _pay() async {
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
        amountCdf: widget.amountCdf,
        phone: _needsPhone ? MarketConfig.normalizePhone(_phoneController.text) : null,
      );
    } else {
      result = await api.payService(
        widget.serviceType!,
        widget.serviceId!,
        method: _method,
        amountCdf: widget.amountCdf,
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
              content: Text('Paiement espèces en attente — communiquez le code PIN au chauffeur.'),
            ),
          );
          if (widget.rideId != null) {
            Navigator.pushReplacement(
              context,
              MaterialPageRoute(builder: (_) => RatingScreen(rideId: widget.rideId!)),
            );
          } else {
            Navigator.of(context).popUntil((r) => r.isFirst);
          }
          return;
        }
        if (widget.rideId != null) {
          Navigator.pushReplacement(
            context,
            MaterialPageRoute(
              builder: (_) => RatingScreen(rideId: widget.rideId!),
            ),
          );
        } else {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Paiement effectué avec succès')),
          );
          Navigator.of(context).popUntil((r) => r.isFirst);
        }
      case Failure(:final error):
        setState(() => _error = error.message);
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
                  MarketConfig.formatCdf(widget.amountCdf),
                  style: const TextStyle(
                    fontSize: 28,
                    fontWeight: FontWeight.bold,
                    color: MovaColors.green,
                  ),
                ),
                if (widget.completionPin != null && widget.completionPin!.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  const Text('Code PIN espèces (à donner au chauffeur)', style: TextStyle(color: MovaColors.textSecondary)),
                  Text(
                    widget.completionPin!,
                    style: const TextStyle(fontSize: 32, fontWeight: FontWeight.bold, letterSpacing: 8),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 20),
          Text('Mode de paiement', style: Theme.of(context).textTheme.titleSmall),
          const SizedBox(height: 8),
          ..._paymentMethods.map((m) {
            final (id, label, icon, color) = m;
            return Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: MovaCard(
                onTap: () => setState(() => _method = id),
                child: Row(
                  children: [
                    Icon(icon, color: color),
                    const SizedBox(width: 12),
                    Expanded(child: Text(label)),
                    Radio<String>(
                      value: id,
                      groupValue: _method,
                      onChanged: (v) => setState(() => _method = v!),
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
          ],
          if (_error != null) ...[
            const SizedBox(height: 12),
            MovaErrorBanner(message: _error!, onRetry: _pay),
          ],
          const SizedBox(height: 24),
          MovaButton(
            label: 'Payer ${MarketConfig.formatCdf(widget.amountCdf)}',
            isLoading: _loading,
            icon: Icons.lock_outline,
            onPressed: _loading ? null : _pay,
          ),
        ],
      ),
    );
  }
}

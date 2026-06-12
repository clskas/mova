import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/config/market_config.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/api/api_client.dart';
import '../../core/error/result.dart';

class WalletScreen extends ConsumerStatefulWidget {
  const WalletScreen({super.key});

  @override
  ConsumerState<WalletScreen> createState() => _WalletScreenState();
}

class _WalletScreenState extends ConsumerState<WalletScreen> {
  int _balance = 0;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadWallet();
  }

  Future<void> _loadWallet() async {
    final api = ref.read(apiClientProvider);
    await api.loadToken();
    final result = await api.get('/wallet');
    setState(() {
      _loading = false;
      if (result case Success(:final data)) {
        _balance = data['balanceCdf'] as int? ?? 0;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return MovaScreen(
      title: 'Portefeuille',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          MovaCard(
            child: Column(
              children: [
                const Text('Solde disponible'),
                const SizedBox(height: 8),
                Text(
                  _loading ? '…' : MarketConfig.formatCdf(_balance),
                  style: const TextStyle(
                    fontSize: 32,
                    fontWeight: FontWeight.bold,
                    color: MovaColors.green,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          Text('Payer avec', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 12),
          ...MarketConfig.mobileMoneyProviders.map((p) => MovaCard(
                margin: const EdgeInsets.only(bottom: 8),
                onTap: () {},
                child: Row(
                  children: [
                    Container(
                      width: 40,
                      height: 40,
                      decoration: BoxDecoration(
                        color: Color(p.color),
                        borderRadius: BorderRadius.circular(8),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(child: Text(p.name, style: const TextStyle(fontWeight: FontWeight.w600))),
                    const Icon(Icons.chevron_right),
                  ],
                ),
              )),
        ],
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/config/market_config.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/api/api_client.dart';
import '../../core/error/result.dart';
import 'kyc_screen.dart';

class DriverHomeScreen extends ConsumerStatefulWidget {
  const DriverHomeScreen({super.key});

  @override
  ConsumerState<DriverHomeScreen> createState() => _DriverHomeScreenState();
}

class _DriverHomeScreenState extends ConsumerState<DriverHomeScreen> {
  bool _available = false;
  Map<String, dynamic>? _earnings;

  @override
  void initState() {
    super.initState();
    _loadEarnings();
  }

  Future<void> _loadEarnings() async {
    final api = ref.read(apiClientProvider);
    await api.loadToken();
    final result = await api.get('/drivers/earnings');
    if (result case Success(:final data)) {
      setState(() => _earnings = data);
    }
  }

  Future<void> _toggleAvailability(bool value) async {
    final api = ref.read(apiClientProvider);
    final result = await api.post('/drivers/availability', {'isAvailable': value});
    if (result case Success()) {
      setState(() => _available = value);
    }
  }

  @override
  Widget build(BuildContext context) {
    return MovaScreen(
      title: 'MOVA Chauffeur',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          MovaCard(
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Disponibilité'),
                    Text(
                      _available ? 'En ligne' : 'Hors ligne',
                      style: TextStyle(
                        color: _available ? MovaColors.green : MovaColors.textSecondary,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ),
                Switch(
                  value: _available,
                  activeColor: MovaColors.green,
                  onChanged: _toggleAvailability,
                ),
              ],
            ),
          ),
          if (_earnings != null) ...[
            const SizedBox(height: 16),
            MovaCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Revenus du jour'),
                  Text(
                    MarketConfig.formatCdf(_earnings!['todayCdf'] as int? ?? 0),
                    style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: MovaColors.green),
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 16),
          MovaButton(
            label: 'Course entrante (simulation)',
            isSecondary: true,
            icon: Icons.notifications_active,
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const RideRequestScreen()),
            ),
          ),
          const SizedBox(height: 8),
          MovaButton(
            label: 'Mes revenus',
            isSecondary: true,
            icon: Icons.account_balance_wallet,
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const EarningsScreen()),
            ),
          ),
          const SizedBox(height: 8),
          MovaButton(
            label: 'Documents KYC',
            isSecondary: true,
            icon: Icons.upload_file,
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const KycScreen()),
            ),
          ),
          const SizedBox(height: 8),
          MovaButton(
            label: 'Signaler un incident',
            isSecondary: true,
            icon: Icons.report_problem,
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const IncidentScreen()),
            ),
          ),
        ],
      ),
    );
  }
}

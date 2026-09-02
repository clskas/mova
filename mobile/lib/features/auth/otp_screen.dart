import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/config/market_config.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../home/home_screen.dart';
import 'phone_login_panel.dart';

class OtpScreen extends ConsumerWidget {
  const OtpScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MovaScreen(
      title: 'Senga',
      centerContent: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(16),
              child: Image.asset(
                'assets/icon/movaicone_passenger.png',
                width: 72,
                height: 72,
                fit: BoxFit.cover,
              ),
            ),
          ),
          const SizedBox(height: 24),
          Text(
            'Bienvenue sur SENGA',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.bold,
                  color: MovaColors.midnight,
                ),
          ),
          if (kDebugMode) ...[
            const SizedBox(height: 12),
            Text(
              'API : ${MarketConfig.apiBaseUrl}',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 11, color: MovaColors.textSecondary.withValues(alpha: 0.8)),
            ),
          ],
          const SizedBox(height: 8),
          PhoneLoginPanel(
            appRole: 'PASSENGER',
            subtitle: 'Mobilité partout en RDC — PIN, SMS ou Google',
            onAuthenticated: (_) async {
              if (!context.mounted) return;
              Navigator.of(context).pushReplacement(
                MaterialPageRoute(builder: (_) => const HomeScreen()),
              );
            },
          ),
        ],
      ),
    );
  }
}

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/cache/profile_cache.dart';
import '../../core/config/market_config.dart';
import '../../core/api/api_client.dart';
import '../../core/error/result.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import 'driver_onboarding_screen.dart';
import 'driver_home_screen.dart';
import '../auth/phone_login_panel.dart';

class DriverOtpScreen extends ConsumerWidget {
  const DriverOtpScreen({super.key});

  Future<void> _onDriverAuthenticated(BuildContext context, WidgetRef ref) async {
    final api = ref.read(apiClientProvider);
    await ProfileCache.clear();
    if (!context.mounted) return;
    final onboarding = await api.get('/drivers/onboarding');
    var onboardingDone = false;
    if (onboarding case Success(:final data)) {
      onboardingDone = data['profile']?['onboardingCompleted'] == true;
    }
    if (!context.mounted) return;
    FocusManager.instance.primaryFocus?.unfocus();
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(
        builder: (_) => onboardingDone
            ? const DriverHomeScreen()
            : const DriverOnboardingScreen(canSkipToHome: true),
      ),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MovaScreen(
      title: 'MOVA Driver',
      centerContent: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(16),
              child: Image.asset(
                'assets/icon/movaicone_driver.png',
                width: 64,
                height: 64,
                fit: BoxFit.cover,
              ),
            ),
          ),
          const SizedBox(height: 16),
          const Text(
            'Espace chauffeur',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
          ),
          if (kDebugMode) ...[
            const SizedBox(height: 10),
            Text(
              'API : ${MarketConfig.apiBaseUrl}',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 11, color: MovaColors.textSecondary.withValues(alpha: 0.8)),
            ),
          ],
          const SizedBox(height: 8),
          PhoneLoginPanel(
            appRole: 'DRIVER',
            phoneHint: '+243900000020',
            subtitle: 'Connectez-vous avec votre PIN ou un code SMS',
            onAuthenticated: (_) => _onDriverAuthenticated(context, ref),
          ),
        ],
      ),
    );
  }
}

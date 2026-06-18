import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/cache/profile_cache.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/api/api_client.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import '../../core/theme/mova_colors.dart';
import 'driver_onboarding_screen.dart';
import 'driver_home_screen.dart';

class DriverOtpScreen extends ConsumerStatefulWidget {
  const DriverOtpScreen({super.key});

  @override
  ConsumerState<DriverOtpScreen> createState() => _DriverOtpScreenState();
}

class _DriverOtpScreenState extends ConsumerState<DriverOtpScreen> {
  final _phoneController = TextEditingController(text: '+243900000020');
  final _codeController = TextEditingController();
  bool _codeSent = false;
  bool _loading = false;
  String? _error;
  String? _mockHint;

  Future<void> _requestOtp() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final phone = MarketConfig.normalizePhone(_phoneController.text);
    if (!MarketConfig.validatePhone(phone)) {
      setState(() {
        _error = 'Numéro invalide. Format: +243XXXXXXXXX (ex. +243900000020)';
        _loading = false;
      });
      return;
    }
    final api = ref.read(apiClientProvider);
    await api.checkHealth();
    final result = await api.post('/auth/otp/request', {'phone': phone});
    setState(() {
      _loading = false;
      switch (result) {
        case Success(:final data):
          _codeSent = true;
          _mockHint = data['mockCode'] as String?;
        case Failure(:final error):
          _error = error.message;
      }
    });
  }

  Future<void> _verifyOtp() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final api = ref.read(apiClientProvider);
    await api.checkHealth();
    final phone = MarketConfig.normalizePhone(_phoneController.text);
    final result = await api.post('/auth/otp/verify', {
      'phone': phone,
      'code': _codeController.text.trim(),
      'role': 'DRIVER',
    });
    setState(() => _loading = false);
    switch (result) {
      case Success(:final data):
        final token = data['accessToken'] as String?;
        if (token != null) {
          await api.saveToken(token);
          await api.saveUserPhone(phone);
          await ProfileCache.clear();
          if (mounted) {
            final onboarding = await api.get('/drivers/onboarding');
            var onboardingDone = false;
            if (onboarding case Success(:final data)) {
              onboardingDone = data['profile']?['onboardingCompleted'] == true;
            }
            Navigator.of(context).pushReplacement(
              MaterialPageRoute(
                builder: (_) => onboardingDone
                    ? const DriverHomeScreen()
                    : const DriverOnboardingScreen(canSkipToHome: true),
              ),
            );
          }
        } else {
          setState(() => _error = 'Réponse serveur invalide (token manquant).');
        }
      case Failure(:final error):
        setState(() => _error = error.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    return MovaScreen(
      title: 'MOVA Chauffeur',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(16),
              child: Image.asset(
                'assets/icon/movaicone.png',
                width: 64,
                height: 64,
                fit: BoxFit.cover,
              ),
            ),
          ),
          const SizedBox(height: 16),
          const Text(
            'Espace chauffeur',
            style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 6),
          const Text(
            'Connectez-vous avec votre numéro +243',
            style: TextStyle(color: MovaColors.textSecondary),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
          if (_mockHint != null) ...[
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: MovaColors.violet.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                'Mode démo : code OTP $_mockHint',
                style: const TextStyle(fontSize: 12, color: MovaColors.violet),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
          const SizedBox(height: 20),
          TextField(
            controller: _phoneController,
            keyboardType: TextInputType.phone,
            decoration: const InputDecoration(labelText: 'Téléphone', prefixIcon: Icon(Icons.phone)),
            enabled: !_codeSent,
          ),
          if (_codeSent) ...[
            const SizedBox(height: 16),
            TextField(
              controller: _codeController,
              keyboardType: TextInputType.number,
              maxLength: 6,
              decoration: const InputDecoration(labelText: 'Code OTP', prefixIcon: Icon(Icons.lock)),
            ),
          ],
          if (_error != null) ...[
            const SizedBox(height: 12),
            MovaErrorBanner(message: _error!),
          ],
          const SizedBox(height: 16),
          MovaButton(
            label: _codeSent ? 'Vérifier' : 'Recevoir le code',
            isLoading: _loading,
            onPressed: _codeSent ? _verifyOtp : _requestOtp,
          ),
        ],
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/api/api_client.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import '../../core/theme/mova_colors.dart';
import 'driver_home_screen.dart';

class DriverOtpScreen extends ConsumerStatefulWidget {
  const DriverOtpScreen({super.key});

  @override
  ConsumerState<DriverOtpScreen> createState() => _DriverOtpScreenState();
}

class _DriverOtpScreenState extends ConsumerState<DriverOtpScreen> {
  final _phoneController = TextEditingController(text: '+243');
  final _codeController = TextEditingController();
  bool _codeSent = false;
  bool _loading = false;
  String? _error;

  Future<void> _requestOtp() async {
    setState(() { _loading = true; _error = null; });
    final phone = MarketConfig.normalizePhone(_phoneController.text);
    final api = ref.read(apiClientProvider);
    final result = await api.post('/auth/otp/request', {'phone': phone});
    setState(() {
      _loading = false;
      if (result case Success()) _codeSent = true;
      if (result case Failure(:final error)) _error = error.message;
    });
  }

  Future<void> _verifyOtp() async {
    setState(() { _loading = true; });
    final api = ref.read(apiClientProvider);
    final phone = MarketConfig.normalizePhone(_phoneController.text);
    final result = await api.post('/auth/otp/verify', {
      'phone': phone,
      'code': _codeController.text,
      'role': 'DRIVER',
    });
    setState(() => _loading = false);
    if (result case Success(:final data)) {
      final token = data['accessToken'] as String?;
      if (token != null) {
        await api.saveToken(token);
        if (mounted) {
          Navigator.of(context).pushReplacement(
            MaterialPageRoute(builder: (_) => const DriverHomeScreen()),
          );
        }
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return MovaScreen(
      title: 'MOVA Chauffeur',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SizedBox(height: 24),
          const Text('Espace chauffeur', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          Text('Connectez-vous avec votre numéro +243', style: TextStyle(color: MovaColors.textSecondary)),
          const SizedBox(height: 32),
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
              decoration: const InputDecoration(labelText: 'Code OTP', prefixIcon: Icon(Icons.lock)),
            ),
          ],
          if (_error != null) ...[
            const SizedBox(height: 16),
            MovaErrorBanner(message: _error!),
          ],
          const SizedBox(height: 24),
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

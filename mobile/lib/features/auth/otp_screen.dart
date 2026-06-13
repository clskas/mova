import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/api/api_client.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import '../../core/theme/mova_colors.dart';
import '../home/home_screen.dart';

class OtpScreen extends ConsumerStatefulWidget {
  const OtpScreen({super.key});

  @override
  ConsumerState<OtpScreen> createState() => _OtpScreenState();
}

class _OtpScreenState extends ConsumerState<OtpScreen> {
  final _phoneController = TextEditingController(text: '+243');
  final _codeController = TextEditingController();
  bool _codeSent = false;
  bool _loading = false;
  String? _error;
  String? _mockHint;

  Future<void> _requestOtp() async {
    setState(() { _loading = true; _error = null; });
    final phone = MarketConfig.normalizePhone(_phoneController.text);
    if (!MarketConfig.validatePhone(phone)) {
      setState(() {
        _error = 'Numéro invalide. Format: +243XXXXXXXXX';
        _loading = false;
      });
      return;
    }
    final api = ref.read(apiClientProvider);
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
    setState(() { _loading = true; _error = null; });
    final api = ref.read(apiClientProvider);
    final phone = MarketConfig.normalizePhone(_phoneController.text);
    final result = await api.post('/auth/otp/verify', {
      'phone': phone,
      'code': _codeController.text,
      'role': 'PASSENGER',
    });
    setState(() => _loading = false);
    switch (result) {
      case Success(:final data):
        final token = data['accessToken'] as String?;
        if (token != null) {
          await api.saveToken(token);
          await api.saveUserPhone(phone);
          if (mounted) {
            Navigator.of(context).pushReplacement(
              MaterialPageRoute(builder: (_) => const HomeScreen()),
            );
          }
        }
      case Failure(:final error):
        setState(() => _error = error.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    return MovaScreen(
      title: 'Connexion MOVA',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(16),
              child: Image.asset(
                'assets/icon/movaicone.png',
                width: 72,
                height: 72,
                fit: BoxFit.cover,
              ),
            ),
          ),
          const SizedBox(height: 24),
          Text(
            'Bienvenue sur MOVA',
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.bold,
                  color: MovaColors.midnight,
                ),
          ),
          const SizedBox(height: 8),
          Text(
            'Mobilité partout en RDC — entrez votre numéro +243 pour recevoir un code OTP',
            style: TextStyle(color: MovaColors.textSecondary),
          ),
          const SizedBox(height: 32),
          TextField(
            controller: _phoneController,
            keyboardType: TextInputType.phone,
            decoration: const InputDecoration(
              labelText: 'Téléphone',
              prefixIcon: Icon(Icons.phone),
            ),
            enabled: !_codeSent,
          ),
          if (_codeSent) ...[
            const SizedBox(height: 16),
            TextField(
              controller: _codeController,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                labelText: 'Code OTP',
                prefixIcon: Icon(Icons.lock),
              ),
            ),
          ],
          if (_mockHint != null) ...[
            const SizedBox(height: 8),
            Text('Mode démo : code $_mockHint', style: const TextStyle(color: MovaColors.orange, fontSize: 13)),
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
            icon: _codeSent ? Icons.check : Icons.sms,
          ),
        ],
      ),
    );
  }
}

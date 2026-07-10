import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/config/market_config.dart';
import '../../core/api/api_client.dart';
import '../../core/error/result.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_widgets.dart';
import 'local_pin_setup_screen.dart';
import 'widgets/six_digit_pin_field.dart';

enum PhoneLoginStep { phone, pin, otp }

/// Écran de connexion téléphone : PIN local ou SMS OTP.
class PhoneLoginPanel extends ConsumerStatefulWidget {
  const PhoneLoginPanel({
    super.key,
    required this.appRole,
    required this.onAuthenticated,
    this.phoneHint = '+243',
    this.subtitle = 'Entrez votre numéro +243',
  });

  final String appRole;
  final Future<void> Function(Map<String, dynamic> data) onAuthenticated;
  final String phoneHint;
  final String subtitle;

  @override
  ConsumerState<PhoneLoginPanel> createState() => _PhoneLoginPanelState();
}

class _PhoneLoginPanelState extends ConsumerState<PhoneLoginPanel> {
  final _phoneController = TextEditingController();
  final _codeController = TextEditingController();
  final _pinController = TextEditingController();

  PhoneLoginStep _step = PhoneLoginStep.phone;
  bool _loading = false;
  String? _error;
  String? _mockHint;
  String? _normalizedPhone;

  @override
  void initState() {
    super.initState();
    if (widget.phoneHint != '+243') {
      _phoneController.text = widget.phoneHint;
    }
  }

  @override
  void dispose() {
    _phoneController.dispose();
    _codeController.dispose();
    _pinController.dispose();
    super.dispose();
  }

  Future<void> _continueFromPhone() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final api = ref.read(apiClientProvider);
    await api.checkHealth();
    final phone = MarketConfig.normalizePhone(_phoneController.text);
    if (!MarketConfig.validatePhone(phone)) {
      setState(() {
        _loading = false;
        _error = 'Numéro invalide. Format: +243XXXXXXXXX';
      });
      return;
    }
    _normalizedPhone = phone;
    final result = await api.post('/auth/login/options', {
      'phone': phone,
      'role': widget.appRole,
    });
    if (!mounted) return;
    switch (result) {
      case Success(:final data):
        final pinEnabled = data['pinEnabled'] == true;
        _normalizedPhone = phone;
        if (pinEnabled) {
          setState(() {
            _loading = false;
            _step = PhoneLoginStep.pin;
          });
        } else {
          setState(() => _step = PhoneLoginStep.otp);
          await _requestOtp(silent: true);
        }
      case Failure(:final error):
        setState(() {
          _loading = false;
          _error = error.message;
        });
    }
  }

  Future<void> _requestOtp({bool silent = false}) async {
    if (!silent) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    final phone = _normalizedPhone ?? MarketConfig.normalizePhone(_phoneController.text);
    if (!MarketConfig.validatePhone(phone)) {
      setState(() {
        _error = 'Numéro invalide. Format: +243XXXXXXXXX';
        _loading = false;
      });
      return;
    }
    _normalizedPhone = phone;
    final api = ref.read(apiClientProvider);
    final result = await api.post('/auth/otp/request', {'phone': phone});
    if (!mounted) return;
    setState(() {
      _loading = false;
      _step = PhoneLoginStep.otp;
      switch (result) {
        case Success(:final data):
          _mockHint = data['mockCode'] as String?;
        case Failure(:final error):
          _error = error.message;
      }
    });
  }

  Future<void> _loginWithPin() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final phone = _normalizedPhone;
    if (phone == null) return;
    final api = ref.read(apiClientProvider);
    final result = await api.post('/auth/pin/login', {
      'phone': phone,
      'pin': _pinController.text.trim(),
      'role': widget.appRole,
    });
    await _handleAuthResult(result, phone);
  }

  Future<void> _verifyOtp() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final phone = _normalizedPhone;
    if (phone == null) return;
    final api = ref.read(apiClientProvider);
    final result = await api.post('/auth/otp/verify', {
      'phone': phone,
      'code': _codeController.text.trim(),
      'role': widget.appRole,
    });
    await _handleAuthResult(result, phone);
  }

  Future<void> _handleAuthResult(Result<Map<String, dynamic>> result, String phone) async {
    if (!mounted) return;
    setState(() => _loading = false);
    switch (result) {
      case Success(:final data):
        final token = data['accessToken'] as String?;
        if (token == null) {
          setState(() => _error = 'Réponse serveur invalide (token manquant).');
          return;
        }
        final api = ref.read(apiClientProvider);
        await api.saveToken(token);
        await api.saveUserPhone(phone);
        if (data['pinConfigured'] != true && mounted) {
          await Navigator.of(context).push(
            MaterialPageRoute(
              builder: (_) => LocalPinSetupScreen(
                onCompleted: () async {
                  Navigator.of(context).pop();
                  await widget.onAuthenticated(data);
                },
              ),
            ),
          );
          return;
        }
        await widget.onAuthenticated(data);
      case Failure(:final error):
        setState(() => _error = error.message);
    }
  }

  void _switchToSms() {
    setState(() {
      _step = PhoneLoginStep.otp;
      _error = null;
      _pinController.clear();
    });
    _requestOtp();
  }

  void _backToPhone() {
    setState(() {
      _step = PhoneLoginStep.phone;
      _error = null;
      _mockHint = null;
      _codeController.clear();
      _pinController.clear();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          widget.subtitle,
          textAlign: TextAlign.center,
          style: const TextStyle(color: MovaColors.textSecondary),
        ),
        const SizedBox(height: 24),
        TextField(
          controller: _phoneController,
          keyboardType: TextInputType.phone,
          decoration: const InputDecoration(
            labelText: 'Téléphone',
            prefixIcon: Icon(Icons.phone),
          ),
          enabled: _step == PhoneLoginStep.phone && !_loading,
        ),
        if (_step == PhoneLoginStep.pin) ...[
          const SizedBox(height: 16),
          SixDigitPinField(
            controller: _pinController,
            label: 'Code PIN MOVA',
            autofocus: true,
            enabled: !_loading,
          ),
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerRight,
            child: TextButton(
              onPressed: _loading ? null : _switchToSms,
              child: const Text('Connexion par SMS'),
            ),
          ),
        ],
        if (_step == PhoneLoginStep.otp) ...[
          const SizedBox(height: 16),
          SixDigitPinField(
            controller: _codeController,
            label: 'Code OTP reçu par SMS',
            autofocus: true,
            enabled: !_loading,
          ),
          if (_mockHint != null) ...[
            const SizedBox(height: 8),
            Text(
              'Code test : $_mockHint',
              style: const TextStyle(color: MovaColors.orange, fontSize: 13),
            ),
          ],
        ],
        if (_error != null) ...[
          const SizedBox(height: 16),
          MovaErrorBanner(message: _error!),
        ],
        const SizedBox(height: 24),
        MovaButton(
          label: switch (_step) {
            PhoneLoginStep.phone => 'Continuer',
            PhoneLoginStep.pin => 'Se connecter',
            PhoneLoginStep.otp => 'Vérifier le code',
          },
          isLoading: _loading,
          onPressed: switch (_step) {
            PhoneLoginStep.phone => _continueFromPhone,
            PhoneLoginStep.pin => _loginWithPin,
            PhoneLoginStep.otp => _verifyOtp,
          },
          icon: switch (_step) {
            PhoneLoginStep.phone => Icons.arrow_forward,
            PhoneLoginStep.pin => Icons.login,
            PhoneLoginStep.otp => Icons.check,
          },
        ),
        if (_step != PhoneLoginStep.phone) ...[
          const SizedBox(height: 8),
          TextButton(
            onPressed: _loading ? null : _backToPhone,
            child: const Text('Changer de numéro'),
          ),
        ],
      ],
    );
  }
}

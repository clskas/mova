import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/auth/google_sign_in.dart';
import '../../core/config/market_config.dart';
import '../../core/api/api_client.dart';
import '../../core/error/result.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_widgets.dart';
import 'local_pin_setup_screen.dart';
import 'widgets/six_digit_pin_field.dart';

enum PhoneLoginStep { phone, pin, forgot, otp, googleOtp }

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
  bool _forgotPinRecovery = false;
  String? _error;
  String? _mockHint;
  String? _normalizedPhone;
  String? _googleChallengeId;
  String? _googleOtpChannel;
  String? _googleDestinationMasked;

  @override
  void initState() {
    super.initState();
    if (widget.phoneHint != '+243') {
      _phoneController.text = widget.phoneHint;
    }
    _restoreSavedPhone();
  }

  Future<void> _restoreSavedPhone() async {
    final api = ref.read(apiClientProvider);
    final savedPhone = await api.loadUserPhone();
    if (!mounted || savedPhone == null || savedPhone.isEmpty) return;
    _phoneController.text = savedPhone;
    _normalizedPhone = savedPhone;
    setState(() => _loading = true);
    final result = await api.post('/auth/login/options', {
      'phone': savedPhone,
      'role': widget.appRole,
    });
    if (!mounted) return;
    switch (result) {
      case Success(:final data):
        if (data['pinEnabled'] == true) {
          setState(() {
            _loading = false;
            _step = PhoneLoginStep.pin;
          });
        } else {
          setState(() => _loading = false);
        }
      case Failure():
        setState(() => _loading = false);
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
        if (pinEnabled && !_forgotPinRecovery) {
          setState(() {
            _loading = false;
            _forgotPinRecovery = false;
            _step = PhoneLoginStep.pin;
          });
        } else {
          setState(() => _step = PhoneLoginStep.otp);
          await _requestOtp(silent: true);
        }
      case Failure():
        // Backend sans route PIN (déploiement auth en retard) → SMS OTP.
        _normalizedPhone = phone;
        setState(() => _step = PhoneLoginStep.otp);
        await _requestOtp(silent: true);
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
    final result = await api.post('/auth/otp/request', {
      'phone': phone,
      'role': widget.appRole,
    });
    if (!mounted) return;
    switch (result) {
      case Success(:final data):
        setState(() {
          _loading = false;
          _step = PhoneLoginStep.otp;
          _error = null;
          _mockHint = kDebugMode ? data['mockCode'] as String? : null;
        });
      case Failure(:final error):
        setState(() {
          _loading = false;
          _error = error.message;
        });
    }
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

  Future<void> _loginWithGoogle() async {
    setState(() {
      _loading = true;
      _error = null;
      _forgotPinRecovery = false;
    });
    try {
      final idToken = await signInWithGoogleIdToken();
      if (!mounted) return;
      if (idToken == null || idToken.isEmpty) {
        setState(() {
          _loading = false;
          _error = 'Connexion Google annulée.';
        });
        return;
      }
      final api = ref.read(apiClientProvider);
      await api.checkHealth();
      final result = await api.post('/auth/google', {
        'idToken': idToken,
        'role': widget.appRole,
      });
      if (!mounted) return;
      switch (result) {
        case Success(:final data):
          if (data['otpRequired'] == true) {
            setState(() {
              _loading = false;
              _googleChallengeId = data['challengeId']?.toString();
              _googleOtpChannel = data['otpChannel']?.toString();
              _googleDestinationMasked = data['destinationMasked']?.toString();
              _step = PhoneLoginStep.googleOtp;
              _codeController.clear();
              _mockHint = kDebugMode ? data['mockCode'] as String? : null;
              _error = null;
            });
            return;
          }
          final phone = _normalizedPhone ?? MarketConfig.normalizePhone(_phoneController.text);
          await _handleAuthResult(result, phone);
        case Failure(:final error):
          setState(() {
            _loading = false;
            _error = error.message;
          });
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = googleSignInErrorMessage(e);
      });
    }
  }

  Future<void> _verifyGoogleOtp() async {
    final challengeId = _googleChallengeId;
    if (challengeId == null || challengeId.isEmpty) {
      setState(() => _error = 'Session Google expirée. Recommencez.');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    final api = ref.read(apiClientProvider);
    final result = await api.post('/auth/google/verify', {
      'challengeId': challengeId,
      'code': _codeController.text.trim(),
      'role': widget.appRole,
    });
    final phone = _normalizedPhone ?? MarketConfig.normalizePhone(_phoneController.text);
    await _handleAuthResult(result, phone);
  }

  Future<void> _handleAuthResult(Result<Map<String, dynamic>> result, String phone) async {
    if (!mounted) return;
    setState(() => _loading = false);
    switch (result) {
      case Success(:final data):
        // Fermer le clavier avant toute navigation pour éviter l'assertion
        // Flutter `InheritedElement._dependents.isEmpty` (champ focalisé détruit
        // pendant la transition de route).
        FocusManager.instance.primaryFocus?.unfocus();
        final token = data['accessToken'] as String?;
        if (token == null) {
          setState(() => _error = 'Connexion impossible. Veuillez réessayer.');
          return;
        }
        final api = ref.read(apiClientProvider);
        await api.saveToken(token);
        if (MarketConfig.validatePhone(phone)) {
          await api.saveUserPhone(phone);
        }
        final seedDemo = RegExp(r'^\+2439000000\d{2}$').hasMatch(phone);
        final mustSetupPin = !seedDemo &&
            MarketConfig.validatePhone(phone) &&
            (_forgotPinRecovery || data['pinConfigured'] != true);
        if (mustSetupPin && mounted) {
          await Navigator.of(context).push(
            MaterialPageRoute(
              builder: (_) => LocalPinSetupScreen(
                title: _forgotPinRecovery
                    ? 'Définir un nouveau code PIN'
                    : 'Créer votre code PIN',
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

  void _openForgotOptions() {
    setState(() {
      _forgotPinRecovery = true;
      _step = PhoneLoginStep.forgot;
      _error = null;
      _pinController.clear();
    });
  }

  void _backToPin() {
    setState(() {
      _forgotPinRecovery = false;
      _step = PhoneLoginStep.pin;
      _error = null;
    });
  }

  Future<void> _sendForgotSms() async {
    final phone = MarketConfig.normalizePhone(_phoneController.text);
    if (!MarketConfig.validatePhone(phone)) {
      setState(() => _error = 'Numéro invalide. Format: +243XXXXXXXXX');
      return;
    }
    _normalizedPhone = phone;
    _forgotPinRecovery = true;
    await _requestOtp();
  }

  void _backToPhone() {
    setState(() {
      _step = PhoneLoginStep.phone;
      _forgotPinRecovery = false;
      _error = null;
      _mockHint = null;
      _googleChallengeId = null;
      _googleOtpChannel = null;
      _googleDestinationMasked = null;
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
          _step == PhoneLoginStep.pin
              ? 'Entrez votre code PIN à 6 chiffres'
              : _step == PhoneLoginStep.forgot
                  ? 'PIN oublié : SMS, autre numéro, ou Google.'
                  : widget.subtitle,
          textAlign: TextAlign.center,
          style: const TextStyle(color: MovaColors.textSecondary),
        ),
        const SizedBox(height: 24),
        if (_step == PhoneLoginStep.phone || _step == PhoneLoginStep.forgot) ...[
          TextField(
            controller: _phoneController,
            keyboardType: TextInputType.phone,
            decoration: InputDecoration(
              labelText: _step == PhoneLoginStep.forgot ? 'Numéro pour le SMS' : 'Téléphone',
              prefixIcon: const Icon(Icons.phone),
            ),
            enabled: !_loading,
          ),
          if (_step == PhoneLoginStep.forgot) ...[
            const SizedBox(height: 8),
            TextButton(
              onPressed: _loading
                  ? null
                  : () {
                      _phoneController.clear();
                      setState(() => _error = null);
                    },
              child: const Text('Utiliser un autre numéro'),
            ),
          ],
        ],
        if (_step == PhoneLoginStep.pin) ...[
          const SizedBox(height: 16),
          SixDigitPinField(
            controller: _pinController,
            label: 'Code PIN SENGA',
            autofocus: true,
            enabled: !_loading,
          ),
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerRight,
            child: TextButton(
              onPressed: _loading ? null : _openForgotOptions,
              child: const Text('PIN oublié'),
            ),
          ),
          TextButton(
            onPressed: _loading ? null : _backToPhone,
            child: const Text('Ce n\'est pas moi'),
          ),
        ],
        if (_step == PhoneLoginStep.otp || _step == PhoneLoginStep.googleOtp) ...[
          const SizedBox(height: 16),
          if (_step == PhoneLoginStep.otp && _forgotPinRecovery) ...[
            Text(
              'Un code SMS vous permet de vous reconnecter et de définir un nouveau PIN.',
              textAlign: TextAlign.center,
              style: TextStyle(color: MovaColors.textSecondary.withValues(alpha: 0.9), fontSize: 13),
            ),
            const SizedBox(height: 12),
          ],
          if (_step == PhoneLoginStep.googleOtp) ...[
            Text(
              _googleOtpChannel == 'email'
                  ? 'Un code a été envoyé par e-mail${_googleDestinationMasked != null && _googleDestinationMasked!.isNotEmpty ? ' ($_googleDestinationMasked)' : ''}. Vérifiez votre boîte de réception.'
                  : 'Un code SMS a été envoyé${_googleDestinationMasked != null && _googleDestinationMasked!.isNotEmpty ? ' ($_googleDestinationMasked)' : ''}.',
              textAlign: TextAlign.center,
              style: TextStyle(color: MovaColors.textSecondary.withValues(alpha: 0.9), fontSize: 13),
            ),
            const SizedBox(height: 12),
          ],
          SixDigitPinField(
            controller: _codeController,
            label: _step == PhoneLoginStep.googleOtp && _googleOtpChannel == 'email'
                ? 'Code OTP reçu par e-mail'
                : 'Code OTP reçu par SMS',
            autofocus: true,
            enabled: !_loading,
          ),
          if (kDebugMode && _mockHint != null) ...[
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
            PhoneLoginStep.forgot => 'Recevoir un SMS',
            PhoneLoginStep.otp || PhoneLoginStep.googleOtp => 'Vérifier le code',
          },
          isLoading: _loading,
          onPressed: switch (_step) {
            PhoneLoginStep.phone => _continueFromPhone,
            PhoneLoginStep.pin => _loginWithPin,
            PhoneLoginStep.forgot => _sendForgotSms,
            PhoneLoginStep.otp => _verifyOtp,
            PhoneLoginStep.googleOtp => _verifyGoogleOtp,
          },
          icon: switch (_step) {
            PhoneLoginStep.phone => Icons.arrow_forward,
            PhoneLoginStep.pin => Icons.login,
            PhoneLoginStep.forgot => Icons.sms,
            PhoneLoginStep.otp || PhoneLoginStep.googleOtp => Icons.check,
          },
        ),
        if (_step == PhoneLoginStep.forgot) ...[
          const SizedBox(height: 8),
          TextButton(
            onPressed: _loading ? null : _backToPin,
            child: const Text('Retour au PIN'),
          ),
        ],
        if (_step != PhoneLoginStep.phone && _step != PhoneLoginStep.pin && _step != PhoneLoginStep.forgot) ...[
          const SizedBox(height: 8),
          TextButton(
            onPressed: _loading ? null : _backToPhone,
            child: Text(_step == PhoneLoginStep.googleOtp ? 'Retour' : 'Changer de numéro'),
          ),
        ],
        if (_step == PhoneLoginStep.phone ||
            _step == PhoneLoginStep.forgot ||
            _step == PhoneLoginStep.pin) ...[
          const SizedBox(height: 20),
          Row(
            children: [
              const Expanded(child: Divider()),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                child: Text(
                  'ou',
                  style: TextStyle(color: MovaColors.textSecondary.withValues(alpha: 0.9), fontSize: 13),
                ),
              ),
              const Expanded(child: Divider()),
            ],
          ),
          const SizedBox(height: 16),
          MovaButton(
            label: 'Continuer avec Google',
            isSecondary: true,
            isLoading: _loading,
            onPressed: _loginWithGoogle,
            icon: Icons.g_mobiledata,
          ),
        ],
      ],
    );
  }
}

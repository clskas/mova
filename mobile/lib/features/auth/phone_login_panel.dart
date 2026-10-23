import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/auth/apple_sign_in.dart';
import '../../core/auth/google_sign_in.dart';
import '../../core/config/market_config.dart';
import '../../core/api/api_client.dart';
import '../../core/error/result.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_widgets.dart';
import '../help/legal_screen.dart';
import 'local_pin_setup_screen.dart';
import 'otp_sms_autofill.dart';
import 'pin_session.dart';
import 'widgets/pin_digit_pad.dart';
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
  /// `google` | `apple` — which provider issued the email OTP challenge.
  String _socialProvider = 'google';
  bool _pinSubmitLock = false;
  bool _legalAccepted = false;

  /// Google Sign-In on phone / forgot. On iOS, shown only with Apple (Guideline 4.8).
  bool get _showGoogleSignIn =>
      (_step == PhoneLoginStep.phone || _step == PhoneLoginStep.forgot);

  /// Sign in with Apple — iOS only (App Store Guideline 4.8).
  bool get _showAppleSignIn =>
      !kIsWeb &&
      defaultTargetPlatform == TargetPlatform.iOS &&
      (_step == PhoneLoginStep.phone || _step == PhoneLoginStep.forgot);

  @override
  void initState() {
    super.initState();
    if (widget.phoneHint != '+243') {
      _phoneController.text = widget.phoneHint;
    }
    _restoreSavedPhone();
    _pinController.addListener(_onPinOrOtpChanged);
    _codeController.addListener(_onPinOrOtpChanged);
  }

  void _applyAutofilledOtp(String six) {
    if (!mounted) return;
    if (_step != PhoneLoginStep.otp && _step != PhoneLoginStep.googleOtp) return;
    if (_codeController.text == six) return;
    _codeController.value = TextEditingValue(
      text: six,
      selection: TextSelection.collapsed(offset: six.length),
    );
  }

  /// CGU / confidentialité : uniquement à la 1ʳᵉ connexion (téléphone / social), pas PIN ni oubli.
  bool get _needsLegalGate => _step == PhoneLoginStep.phone;

  bool _ensureLegalAccepted() {
    if (!_needsLegalGate || _legalAccepted) return true;
    setState(() => _error = 'Acceptez les CGU et la Politique de confidentialité pour continuer.');
    return false;
  }

  void _onPinOrOtpChanged() {
    if (!mounted) return;
    setState(() {});
    if (_step == PhoneLoginStep.pin &&
        _pinController.text.trim().length == 6 &&
        !_loading &&
        !_pinSubmitLock) {
      _loginWithPin();
    }
    // Autofill SMS / saisie : valider dès 6 chiffres (comme WhatsApp).
    if (!_loading && _codeController.text.trim().length == 6) {
      if (_step == PhoneLoginStep.otp) {
        _verifyOtp();
      } else if (_step == PhoneLoginStep.googleOtp) {
        _verifyGoogleOtp();
      }
    }
  }

  /// Android User Consent — start before the SMS is requested.
  void _armOtpAutofill() {
    stopOtpSmsListen();
    unawaited(startOtpSmsListen(onCode: _applyAutofilledOtp));
  }

  Future<void> _restoreSavedPhone() async {
    final api = ref.read(apiClientProvider);
    final savedPhone = await api.loadUserPhone();
    if (!mounted || savedPhone == null || !isRememberedLoginIdentity(savedPhone)) return;
    _phoneController.text = savedPhone;
    _normalizedPhone = savedPhone;
    setState(() => _loading = true);
    final result = await api.post('/auth/login/options', {
      'phone': savedPhone,
      'role': widget.appRole,
    });
    if (!mounted) return;
    // Ne pas écraser un flux PIN oublié / OTP déjà en cours (course async).
    if (_forgotPinRecovery ||
        _step == PhoneLoginStep.forgot ||
        _step == PhoneLoginStep.otp ||
        _step == PhoneLoginStep.googleOtp) {
      setState(() => _loading = false);
      return;
    }
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
    stopOtpSmsListen();
    _pinController.removeListener(_onPinOrOtpChanged);
    _codeController.removeListener(_onPinOrOtpChanged);
    _phoneController.dispose();
    _codeController.dispose();
    _pinController.dispose();
    super.dispose();
  }

  Future<void> _continueFromPhone() async {
    if (!_ensureLegalAccepted()) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    final api = ref.read(apiClientProvider);
    await api.checkHealth();
    final raw = _phoneController.text.trim();
    String identity;
    if (isEmailIdentity(raw)) {
      identity = raw.toLowerCase();
    } else {
      final phone = MarketConfig.normalizePhone(raw);
      if (!MarketConfig.validatePhone(phone)) {
        setState(() {
          _loading = false;
          _error = 'Numéro invalide. Format: +243XXXXXXXXX';
        });
        return;
      }
      identity = phone;
    }
    _normalizedPhone = identity;
    final result = await api.post('/auth/login/options', {
      'phone': identity,
      'role': widget.appRole,
    });
    if (!mounted) return;
    switch (result) {
      case Success(:final data):
        final pinEnabled = data['pinEnabled'] == true;
        _normalizedPhone = identity;
        if (pinEnabled && !_forgotPinRecovery) {
          setState(() {
            _loading = false;
            _forgotPinRecovery = false;
            _step = PhoneLoginStep.pin;
          });
        } else if (isEmailIdentity(identity)) {
          setState(() {
            _loading = false;
            _error = 'Aucun PIN pour cet e-mail. Connectez-vous avec Google.';
          });
        } else {
          setState(() => _step = PhoneLoginStep.otp);
          await _requestOtp(silent: true);
        }
      case Failure():
        if (isEmailIdentity(identity)) {
          setState(() {
            _loading = false;
            _error = 'Impossible de vérifier le PIN. Utilisez Continuer avec Google.';
          });
          return;
        }
        _normalizedPhone = identity;
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
    // Show OTP field + focus before the SMS arrives (iOS QuickType / Android Consent).
    _codeController.clear();
    setState(() {
      _loading = true;
      _error = null;
      _step = PhoneLoginStep.otp;
    });
    _armOtpAutofill();
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
    final pin = _pinController.text.trim();
    if (!RegExp(r'^\d{6}$').hasMatch(pin)) {
      setState(() => _error = 'Le code PIN doit contenir 6 chiffres.');
      return;
    }
    if (_pinSubmitLock) return;
    _pinSubmitLock = true;
    setState(() {
      _loading = true;
      _error = null;
    });
    final phone = _normalizedPhone;
    if (phone == null) {
      _pinSubmitLock = false;
      setState(() => _loading = false);
      return;
    }
    final api = ref.read(apiClientProvider);
    final result = await api.post('/auth/pin/login', {
      'phone': phone,
      'pin': pin,
      'role': widget.appRole,
    });
    await _handleAuthResult(result, phone, fromPin: true);
  }

  Future<void> _verifyOtp() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final phone = _normalizedPhone;
    if (phone == null) {
      setState(() {
        _loading = false;
        _error = 'Numéro manquant. Recommencez.';
      });
      return;
    }
    final api = ref.read(apiClientProvider);
    final result = await api.post('/auth/otp/verify', {
      'phone': phone,
      'code': _codeController.text.trim(),
      'role': widget.appRole,
    });
    await _handleAuthResult(result, phone);
  }

  Future<void> _loginWithGoogle() async {
    if (!_ensureLegalAccepted()) return;
    // Conserver le mode « PIN oublié » si on part de cet écran (nouveau PIN après Google).
    final keepForgot = _forgotPinRecovery || _step == PhoneLoginStep.forgot;
    setState(() {
      _loading = true;
      _error = null;
      _forgotPinRecovery = keepForgot;
      _socialProvider = 'google';
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
      await _handleSocialAuthResult(result);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = googleSignInErrorMessage(e);
      });
    }
  }

  Future<void> _loginWithApple() async {
    if (!_ensureLegalAccepted()) return;
    final keepForgot = _forgotPinRecovery || _step == PhoneLoginStep.forgot;
    setState(() {
      _loading = true;
      _error = null;
      _forgotPinRecovery = keepForgot;
      _socialProvider = 'apple';
    });
    try {
      final apple = await signInWithAppleIdentityToken();
      if (!mounted) return;
      if (apple == null || apple.identityToken.isEmpty) {
        setState(() {
          _loading = false;
          _error = 'Connexion Apple annulée.';
        });
        return;
      }
      final api = ref.read(apiClientProvider);
      await api.checkHealth();
      final body = <String, dynamic>{
        'identityToken': apple.identityToken,
        'role': widget.appRole,
      };
      if (apple.givenName != null && apple.givenName!.isNotEmpty) {
        body['givenName'] = apple.givenName;
      }
      if (apple.familyName != null && apple.familyName!.isNotEmpty) {
        body['familyName'] = apple.familyName;
      }
      final result = await api.post('/auth/apple', body);
      if (!mounted) return;
      await _handleSocialAuthResult(result);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = appleSignInErrorMessage(e);
      });
    }
  }

  Future<void> _handleSocialAuthResult(Result<Map<String, dynamic>> result) async {
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
          if (data['otpChannel']?.toString() == 'sms') {
            _armOtpAutofill();
          }
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
  }

  Future<void> _verifyGoogleOtp() async {
    final challengeId = _googleChallengeId;
    final providerLabel = _socialProvider == 'apple' ? 'Apple' : 'Google';
    if (challengeId == null || challengeId.isEmpty) {
      setState(() => _error = 'Session $providerLabel expirée. Recommencez.');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    final api = ref.read(apiClientProvider);
    final path = _socialProvider == 'apple' ? '/auth/apple/verify' : '/auth/google/verify';
    final result = await api.post(path, {
      'challengeId': challengeId,
      'code': _codeController.text.trim(),
      'role': widget.appRole,
    });
    final phone = _normalizedPhone ?? MarketConfig.normalizePhone(_phoneController.text);
    await _handleAuthResult(result, phone);
  }

  Future<void> _handleAuthResult(
    Result<Map<String, dynamic>> result,
    String phone, {
    bool fromPin = false,
  }) async {
    if (!mounted) return;
    _pinSubmitLock = false;
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
        final user = data['user'];
        final accountPhone = user is Map
            ? (user['phone']?.toString() ?? '').trim()
            : (data['phone']?.toString() ?? '').trim();
        final accountEmail = user is Map
            ? (user['email']?.toString() ?? '').trim()
            : (data['email']?.toString() ?? '').trim();
        final identity = loginIdentityFromAuth(
          accountPhone: accountPhone,
          accountEmail: accountEmail,
          fallback: phone,
        );
        if (identity.isNotEmpty) {
          await api.saveUserPhone(identity);
          _normalizedPhone = identity;
          if (isRdcPhoneIdentity(identity)) {
            _phoneController.text = identity;
          }
        }
        final seedDemo = isSeedDemoPhone(accountPhone.isNotEmpty ? accountPhone : phone);
        final pinConfigured = data['pinConfigured'] == true;
        if (!fromPin && !seedDemo && pinConfigured && !_forgotPinRecovery) {
          await api.clearToken(keepPhone: true);
          if (!mounted) return;
          setState(() {
            _step = PhoneLoginStep.pin;
            _pinController.clear();
            _codeController.clear();
            _googleChallengeId = null;
            _error = null;
          });
          return;
        }
        await api.saveToken(token);
        await api.markSessionUnlocked();
        // Capturer avant les awaits UI — évite de perdre le mode reset.
        final resetPin = _forgotPinRecovery;
        final mustSetupPin = !seedDemo && (resetPin || !pinConfigured);
        if (mustSetupPin && mounted) {
          await _presentPinSetupScreen(data: data, reset: resetPin);
          return;
        }
        await widget.onAuthenticated(data);
      case Failure(:final error):
        setState(() => _error = error.message);
    }
  }

  /// Plein écran via root navigator — fiable même si le panel est dans un scroll/Center.
  Future<void> _presentPinSetupScreen({
    required Map<String, dynamic> data,
    required bool reset,
  }) async {
    if (!mounted) return;
    // Laisser le unfocus/clavier se terminer avant d'empiler la route.
    await Future<void>.delayed(Duration.zero);
    if (!mounted) return;
    await Navigator.of(context, rootNavigator: true).push<void>(
      MaterialPageRoute<void>(
        fullscreenDialog: true,
        builder: (routeContext) => LocalPinSetupScreen(
          title: reset ? pinResetHeadingFr : connectionPinHeadingFr,
          reset: reset,
          onCompleted: () async {
            if (Navigator.of(routeContext).canPop()) {
              Navigator.of(routeContext).pop();
            }
            if (!mounted) return;
            _forgotPinRecovery = false;
            await widget.onAuthenticated(data);
          },
        ),
      ),
    );
  }

  void _openForgotOptions() {
    setState(() {
      _forgotPinRecovery = true;
      _step = PhoneLoginStep.forgot;
      _error = null;
      _pinController.clear();
      _codeController.clear();
      _loading = false;
      // SMS needs a +243 number — clear leftover Google e-mail from the field.
      if (isEmailIdentity(_phoneController.text) ||
          isEmailIdentity(_normalizedPhone ?? '')) {
        _phoneController.clear();
      }
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
    final raw = _phoneController.text.trim();
    // Only the SMS destination matters — do not block on a stale Google e-mail
    // left in `_normalizedPhone` after the user typed a real +243 number.
    if (isEmailIdentity(raw)) {
      setState(() => _error = 'Pas de SMS pour un e-mail. Utilisez Continuer avec Google.');
      return;
    }
    final phone = MarketConfig.normalizePhone(raw);
    if (!MarketConfig.validatePhone(phone)) {
      setState(() => _error = 'Numéro invalide. Format: +243XXXXXXXXX');
      return;
    }
    _normalizedPhone = phone;
    setState(() {
      _forgotPinRecovery = true;
      _error = null;
    });
    await _requestOtp();
  }

  void _backToPhone() {
    stopOtpSmsListen();
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
      if (_phoneController.text.contains('@')) {
        _phoneController.clear();
        _normalizedPhone = null;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          _step == PhoneLoginStep.pin
              ? connectionPinPrompt(_normalizedPhone ?? _phoneController.text)
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
          const SizedBox(height: 8),
          Text(
            connectionLoginTitleFr,
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w700,
              color: MovaColors.midnight,
            ),
          ),
          const SizedBox(height: 16),
          PinDigitPad(
            value: _pinController.text,
            disabled: _loading,
            onChanged: (next) {
              _pinController.value = TextEditingValue(
                text: next,
                selection: TextSelection.collapsed(offset: next.length),
              );
            },
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
                  ? 'Un code a été envoyé par e-mail${_googleDestinationMasked != null && _googleDestinationMasked!.isNotEmpty ? ' ($_googleDestinationMasked)' : ''} (objet « Votre accès SENGA »). Vérifiez votre boîte de réception.'
                  : 'Un code SMS a été envoyé${_googleDestinationMasked != null && _googleDestinationMasked!.isNotEmpty ? ' ($_googleDestinationMasked)' : ''}.',
              textAlign: TextAlign.center,
              style: TextStyle(color: MovaColors.textSecondary.withValues(alpha: 0.9), fontSize: 13),
            ),
            const SizedBox(height: 12),
          ],
          SixDigitPinField(
            controller: _codeController,
            label: _step == PhoneLoginStep.googleOtp && _googleOtpChannel == 'email'
                ? 'Code reçu par e-mail'
                : 'Code reçu par SMS',
            autofocus: true,
            enabled: !_loading,
            forOneTimeCode: true,
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
        if (_needsLegalGate) ...[
          const SizedBox(height: 16),
          _LegalAcceptRow(
            accepted: _legalAccepted,
            onChanged: (v) => setState(() {
              _legalAccepted = v;
              if (v && _error != null && _error!.contains('CGU')) {
                _error = null;
              }
            }),
          ),
        ],
        const SizedBox(height: 16),
          MovaButton(
          label: switch (_step) {
            PhoneLoginStep.phone => 'Continuer',
            PhoneLoginStep.pin => 'Se connecter',
            PhoneLoginStep.forgot => 'Recevoir un SMS',
            PhoneLoginStep.otp || PhoneLoginStep.googleOtp => 'Vérifier le code',
          },
          isLoading: _loading,
          onPressed: (_needsLegalGate && !_legalAccepted)
              ? null
              : switch (_step) {
                  PhoneLoginStep.phone => _continueFromPhone,
                  PhoneLoginStep.pin =>
                    _pinController.text.trim().length == 6 ? _loginWithPin : null,
                  PhoneLoginStep.forgot => _sendForgotSms,
                  PhoneLoginStep.otp =>
                    _codeController.text.trim().length == 6 ? _verifyOtp : null,
                  PhoneLoginStep.googleOtp =>
                    _codeController.text.trim().length == 6 ? _verifyGoogleOtp : null,
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
        if (_showAppleSignIn || _showGoogleSignIn) ...[
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
          if (_showAppleSignIn) ...[
            const SizedBox(height: 16),
            MovaButton(
              label: 'Continuer avec Apple',
              isSecondary: true,
              isLoading: _loading,
              onPressed: (_needsLegalGate && !_legalAccepted) ? null : _loginWithApple,
              icon: Icons.apple,
            ),
          ],
          if (_showGoogleSignIn) ...[
            const SizedBox(height: 16),
            MovaButton(
              label: 'Continuer avec Google',
              isSecondary: true,
              isLoading: _loading,
              onPressed: (_needsLegalGate && !_legalAccepted) ? null : _loginWithGoogle,
              icon: Icons.g_mobiledata,
            ),
          ],
        ],
      ],
    );
  }
}

class _LegalAcceptRow extends StatelessWidget {
  const _LegalAcceptRow({required this.accepted, required this.onChanged});

  final bool accepted;
  final ValueChanged<bool> onChanged;

  void _openLegal(BuildContext context, {required String title, required String asset, String? apiPath}) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => LegalScreen(title: title, asset: asset, apiPath: apiPath),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 24,
          height: 24,
          child: Checkbox(
            value: accepted,
            onChanged: (v) => onChanged(v ?? false),
            activeColor: MovaColors.violet,
            materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Wrap(
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Text(
                "J'ai lu et j'accepte les ",
                style: TextStyle(fontSize: 13, color: MovaColors.textSecondary.withValues(alpha: 0.95)),
              ),
              GestureDetector(
                onTap: () => _openLegal(
                  context,
                  title: 'CGU',
                  asset: 'assets/legal/cgu_fr.md',
                  apiPath: '/public/cgu',
                ),
                child: const Text(
                  'CGU',
                  style: TextStyle(
                    fontSize: 13,
                    color: MovaColors.violet,
                    decoration: TextDecoration.underline,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              Text(
                ' et la ',
                style: TextStyle(fontSize: 13, color: MovaColors.textSecondary.withValues(alpha: 0.95)),
              ),
              GestureDetector(
                onTap: () => _openLegal(
                  context,
                  title: 'Confidentialité',
                  asset: 'assets/legal/privacy_fr.md',
                  apiPath: '/public/privacy',
                ),
                child: const Text(
                  'Politique de confidentialité',
                  style: TextStyle(
                    fontSize: 13,
                    color: MovaColors.violet,
                    decoration: TextDecoration.underline,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              Text(
                '.',
                style: TextStyle(fontSize: 13, color: MovaColors.textSecondary.withValues(alpha: 0.95)),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

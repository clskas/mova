import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/auth/apple_sign_in.dart';
import '../../core/auth/google_sign_in.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_widgets.dart';
import '../auth/local_pin_setup_screen.dart';
import '../auth/otp_sms_autofill.dart';
import '../auth/pin_session.dart';
import '../auth/widgets/six_digit_pin_field.dart';

const _linkedSnack = 'Compte lié. Vous pouvez vous connecter avec le téléphone, Google ou Apple.';

/// Bloc « Compte et connexion » : lier Google ou le numéro +243 au même compte.
class AccountLinkCard extends ConsumerStatefulWidget {
  const AccountLinkCard({
    super.key,
    required this.profile,
    required this.onChanged,
  });

  final Map<String, dynamic> profile;
  final Future<void> Function() onChanged;

  @override
  ConsumerState<AccountLinkCard> createState() => _AccountLinkCardState();
}

class _AccountLinkCardState extends ConsumerState<AccountLinkCard> {
  final _phoneCtrl = TextEditingController();
  final _otpCtrl = TextEditingController();
  bool _busy = false;
  bool _otpSent = false;
  String? _error;

  @override
  void dispose() {
    stopOtpSmsListen();
    _phoneCtrl.dispose();
    _otpCtrl.dispose();
    super.dispose();
  }

  bool get _googleLinked => widget.profile['googleLinked'] == true;
  bool get _appleLinked => widget.profile['appleLinked'] == true;
  bool get _hasPhone {
    if (widget.profile['hasPhone'] == true) return true;
    final phone = widget.profile['phone']?.toString() ?? '';
    return phone.isNotEmpty;
  }

  bool get _canUnlinkGoogle => widget.profile['canUnlinkGoogle'] == true;
  bool get _canUnlinkApple => widget.profile['canUnlinkApple'] == true;
  bool get _canUnlinkPhone => widget.profile['canUnlinkPhone'] == true;
  bool get _pinConfigured => widget.profile['pinConfigured'] == true;
  bool get _showAppleLink =>
      !kIsWeb && defaultTargetPlatform == TargetPlatform.iOS;

  String get _phoneLabel {
    final masked = widget.profile['phoneMasked']?.toString();
    if (masked != null && masked.isNotEmpty) return masked;
    final phone = widget.profile['phone']?.toString() ?? '';
    return phone.isEmpty ? 'Aucun numéro' : phone;
  }

  String get _emailLabel {
    final masked = widget.profile['emailMasked']?.toString();
    if (masked != null && masked.isNotEmpty) return masked;
    final email = widget.profile['email']?.toString() ?? '';
    return email.isEmpty ? 'Aucun e-mail Google' : email;
  }

  Future<void> _applyAuth(Map<String, dynamic> data) async {
    final token = data['accessToken'] as String?;
    if (token != null && token.isNotEmpty) {
      await ref.read(apiClientProvider).saveToken(token);
    }
    final phone = data['user'] is Map
        ? (data['user'] as Map)['phone']?.toString()
        : data['phone']?.toString();
    if (phone != null && MarketConfig.validatePhone(phone)) {
      await ref.read(apiClientProvider).saveUserPhone(phone);
    }
  }

  void _snack(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _linkGoogle() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final idToken = await signInWithGoogleIdToken();
      if (!mounted) return;
      if (idToken == null || idToken.isEmpty) {
        setState(() {
          _busy = false;
          _error = 'Liaison Google annulée.';
        });
        return;
      }
      final result = await ref.read(apiClientProvider).post('/auth/link-google', {
        'idToken': idToken,
      });
      if (!mounted) return;
      switch (result) {
        case Success(:final data):
          await _applyAuth(data);
          setState(() => _busy = false);
          _snack(data['message']?.toString() ?? _linkedSnack);
          await widget.onChanged();
        case Failure(:final error):
          setState(() {
            _busy = false;
            _error = error.message;
          });
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = googleSignInErrorMessage(e);
      });
    }
  }

  Future<void> _linkApple() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final apple = await signInWithAppleIdentityToken();
      if (!mounted) return;
      if (apple == null || apple.identityToken.isEmpty) {
        setState(() {
          _busy = false;
          _error = 'Liaison Apple annulée.';
        });
        return;
      }
      final body = <String, dynamic>{'identityToken': apple.identityToken};
      if (apple.givenName != null && apple.givenName!.isNotEmpty) {
        body['givenName'] = apple.givenName;
      }
      if (apple.familyName != null && apple.familyName!.isNotEmpty) {
        body['familyName'] = apple.familyName;
      }
      final result = await ref.read(apiClientProvider).post('/auth/link-apple', body);
      if (!mounted) return;
      switch (result) {
        case Success(:final data):
          await _applyAuth(data);
          setState(() => _busy = false);
          _snack(data['message']?.toString() ?? _linkedSnack);
          await widget.onChanged();
        case Failure(:final error):
          setState(() {
            _busy = false;
            _error = error.message;
          });
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = appleSignInErrorMessage(e);
      });
    }
  }

  Future<void> _requestOtp() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final phone = MarketConfig.normalizePhone(_phoneCtrl.text);
    if (!MarketConfig.validatePhone(phone)) {
      setState(() {
        _busy = false;
        _error = 'Numéro invalide. Format: +243XXXXXXXXX';
      });
      return;
    }
    stopOtpSmsListen();
    unawaited(
      startOtpSmsListen(
        onCode: (six) {
          if (!mounted) return;
          if (_otpCtrl.text == six) return;
          _otpCtrl.value = TextEditingValue(
            text: six,
            selection: TextSelection.collapsed(offset: six.length),
          );
        },
      ),
    );
    final result = await ref.read(apiClientProvider).post('/auth/otp/request', {
      'phone': phone,
    });
    if (!mounted) return;
    switch (result) {
      case Success():
        setState(() {
          _busy = false;
          _otpSent = true;
        });
      case Failure(:final error):
        setState(() {
          _busy = false;
          _error = error.message;
        });
    }
  }

  Future<void> _linkPhone() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final phone = MarketConfig.normalizePhone(_phoneCtrl.text);
    final result = await ref.read(apiClientProvider).post('/auth/link-phone', {
      'phone': phone,
      'otpCode': _otpCtrl.text.trim(),
    });
    if (!mounted) return;
    switch (result) {
      case Success(:final data):
        await _applyAuth(data);
        setState(() {
          _busy = false;
          _otpSent = false;
        });
        _phoneCtrl.clear();
        _otpCtrl.clear();
        _snack(data['message']?.toString() ?? _linkedSnack);
        await widget.onChanged();
        if (data['pinConfigured'] != true && mounted) {
          await Navigator.of(context).push(
            MaterialPageRoute(
              builder: (_) => LocalPinSetupScreen(
                title: connectionPinHeadingFr,
                onCompleted: () async {
                  Navigator.of(context).pop();
                },
              ),
            ),
          );
        }
      case Failure(:final error):
        setState(() {
          _busy = false;
          _error = error.message;
        });
    }
  }

  Future<void> _unlink({required String kind}) async {
    final label = switch (kind) {
      'google' => 'Google',
      'apple' => 'Apple',
      _ => 'ce numéro',
    };
    final remaining = switch (kind) {
      'google' => 'votre numéro ou Apple',
      'apple' => 'votre numéro ou Google',
      _ => 'Google ou Apple',
    };
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Détacher $label ?'),
        content: Text(
          'Vous pourrez encore vous connecter avec $remaining. '
          'Détacher $label ?',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Annuler')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Détacher')),
        ],
      ),
    );
    if (confirm != true || !mounted) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    final path = switch (kind) {
      'google' => '/auth/unlink-google',
      'apple' => '/auth/unlink-apple',
      _ => '/auth/unlink-phone',
    };
    final result = await ref.read(apiClientProvider).post(path, {});
    if (!mounted) return;
    switch (result) {
      case Success(:final data):
        await _applyAuth(data);
        setState(() => _busy = false);
        _snack(data['message']?.toString() ?? 'Compte mis à jour.');
        await widget.onChanged();
      case Failure(:final error):
        setState(() {
          _busy = false;
          _error = error.message;
        });
    }
  }

  @override
  Widget build(BuildContext context) {
    final linkedSocialAndPhone = (_googleLinked || _appleLinked) && _hasPhone;

    return MovaCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Compte et connexion',
            style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 4),
          Text(
            _showAppleLink
                ? 'Optionnel. Téléphone, Google et/ou Apple pour le même compte.'
                : 'Optionnel. Vous pouvez utiliser seulement le téléphone, seulement Google, ou les deux pour le même compte.',
            style: const TextStyle(color: MovaColors.textSecondary, fontSize: 12),
          ),
          const SizedBox(height: 12),
          _Row(
            icon: Icons.phone_outlined,
            label: 'Téléphone',
            value: _hasPhone ? 'lié · $_phoneLabel' : 'non lié',
          ),
          const SizedBox(height: 8),
          _Row(
            icon: Icons.g_mobiledata,
            label: 'Google',
            value: _googleLinked ? 'lié · $_emailLabel' : 'non lié',
          ),
          if (_showAppleLink) ...[
            const SizedBox(height: 8),
            _Row(
              icon: Icons.apple,
              label: 'Apple',
              value: _appleLinked ? 'lié' : 'non lié',
            ),
          ],
          if (_error != null) ...[
            const SizedBox(height: 12),
            MovaErrorBanner(message: _error!),
          ],
          if (!_googleLinked) ...[
            const SizedBox(height: 16),
            MovaButton(
              label: 'Lier Google',
              icon: Icons.link,
              isSecondary: true,
              isLoading: _busy,
              onPressed: _busy ? null : _linkGoogle,
            ),
          ],
          if (_showAppleLink && !_appleLinked) ...[
            const SizedBox(height: 12),
            MovaButton(
              label: 'Lier Apple',
              icon: Icons.apple,
              isSecondary: true,
              isLoading: _busy,
              onPressed: _busy ? null : _linkApple,
            ),
          ],
          if (!_hasPhone) ...[
            const SizedBox(height: 16),
            TextField(
              controller: _phoneCtrl,
              keyboardType: TextInputType.phone,
              enabled: !_busy && !_otpSent,
              decoration: const InputDecoration(
                labelText: 'Lier un numéro',
                hintText: '+243 8XX XXX XXX',
                prefixIcon: Icon(Icons.phone_outlined),
              ),
            ),
            if (_otpSent) ...[
              const SizedBox(height: 12),
              SixDigitPinField(
                controller: _otpCtrl,
                label: 'Code OTP reçu par SMS',
                enabled: !_busy,
                forOneTimeCode: true,
                onCompleted: (_) {
                  if (!_busy) _linkPhone();
                },
              ),
            ],
            const SizedBox(height: 12),
            MovaButton(
              label: _otpSent ? 'Confirmer le numéro' : 'Lier mon numéro',
              icon: _otpSent ? Icons.check : Icons.sms_outlined,
              isLoading: _busy,
              onPressed: _busy ? null : (_otpSent ? _linkPhone : _requestOtp),
            ),
            if (_otpSent)
              TextButton(
                onPressed: _busy
                    ? null
                    : () => setState(() {
                        _otpSent = false;
                        _otpCtrl.clear();
                      }),
                child: const Text('Changer de numéro'),
              ),
          ],
          if (linkedSocialAndPhone) ...[
            const SizedBox(height: 8),
            const Text(
              'Plusieurs méthodes liées. Un seul portefeuille.',
              style: TextStyle(color: MovaColors.textSecondary, fontSize: 12),
            ),
            if (_canUnlinkGoogle)
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton(
                  onPressed: _busy ? null : () => _unlink(kind: 'google'),
                  child: const Text('Détacher Google'),
                ),
              ),
            if (_canUnlinkApple)
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton(
                  onPressed: _busy ? null : () => _unlink(kind: 'apple'),
                  child: const Text('Détacher Apple'),
                ),
              ),
            if (_canUnlinkPhone)
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton(
                  onPressed: _busy ? null : () => _unlink(kind: 'phone'),
                  child: const Text('Détacher le numéro'),
                ),
              ),
          ],
          if (_hasPhone && !_pinConfigured && (_googleLinked || _appleLinked)) ...[
            const SizedBox(height: 8),
            TextButton.icon(
              onPressed: _busy
                  ? null
                  : () {
                      Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (_) => LocalPinSetupScreen(
                            onCompleted: () async {
                              Navigator.of(context).pop();
                              await widget.onChanged();
                            },
                          ),
                        ),
                      );
                    },
              icon: const Icon(Icons.lock_outline, size: 18),
              label: const Text('Créer un code PIN'),
            ),
          ],
        ],
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.icon, required this.label, required this.value});

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 20, color: MovaColors.violet),
        const SizedBox(width: 8),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: const TextStyle(color: MovaColors.textSecondary, fontSize: 11)),
              Text(value, style: const TextStyle(fontWeight: FontWeight.w600)),
            ],
          ),
        ),
      ],
    );
  }
}

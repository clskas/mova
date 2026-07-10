import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/cache/profile_cache.dart';
import '../../core/error/result.dart';
import '../../core/theme/mova_colors.dart';
import '../driver/driver_home_screen.dart';
import '../driver/driver_onboarding_screen.dart';
import '../driver/driver_otp_screen.dart';
import '../home/home_screen.dart';
import 'otp_screen.dart';

enum AuthSessionRole { passenger, driver }

/// Restaure la session JWT au démarrage ou affiche l'écran de connexion.
class AuthSessionGate extends ConsumerStatefulWidget {
  const AuthSessionGate({super.key, required this.role});

  final AuthSessionRole role;

  @override
  ConsumerState<AuthSessionGate> createState() => _AuthSessionGateState();
}

class _AuthSessionGateState extends ConsumerState<AuthSessionGate> {
  bool _checking = true;
  bool _authenticated = false;

  @override
  void initState() {
    super.initState();
    _restoreSession();
  }

  Future<void> _restoreSession() async {
    final api = ref.read(apiClientProvider);
    await api.loadToken();
    if (!api.hasToken) {
      if (mounted) setState(() => _checking = false);
      return;
    }
    final result = await api.get('/users/me');
    if (!mounted) return;
    switch (result) {
      case Success():
        setState(() {
          _checking = false;
          _authenticated = true;
        });
      case Failure():
        await api.clearToken(keepPhone: true);
        if (widget.role == AuthSessionRole.driver) {
          await ProfileCache.clear();
        }
        if (mounted) setState(() => _checking = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_checking) {
      return const Scaffold(
        body: Center(
          child: CircularProgressIndicator(color: MovaColors.violet),
        ),
      );
    }
    if (_authenticated) {
      return widget.role == AuthSessionRole.passenger
          ? const HomeScreen()
          : const _DriverHomeResolver();
    }
    return widget.role == AuthSessionRole.passenger
        ? const OtpScreen()
        : const DriverOtpScreen();
  }
}

class _DriverHomeResolver extends ConsumerStatefulWidget {
  const _DriverHomeResolver();

  @override
  ConsumerState<_DriverHomeResolver> createState() => _DriverHomeResolverState();
}

class _DriverHomeResolverState extends ConsumerState<_DriverHomeResolver> {
  bool _loading = true;
  bool _onboardingDone = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final api = ref.read(apiClientProvider);
    final onboarding = await api.get('/drivers/onboarding');
    if (!mounted) return;
    var done = false;
    if (onboarding case Success(:final data)) {
      done = data['profile']?['onboardingCompleted'] == true;
    }
    setState(() {
      _loading = false;
      _onboardingDone = done;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(
        body: Center(
          child: CircularProgressIndicator(color: MovaColors.green),
        ),
      );
    }
    return _onboardingDone
        ? const DriverHomeScreen()
        : const DriverOnboardingScreen(canSkipToHome: true);
  }
}

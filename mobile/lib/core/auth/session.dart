import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_client.dart';
import 'google_sign_in.dart';
import '../../features/auth/otp_screen.dart';
import '../../features/driver/driver_otp_screen.dart';

/// Déconnexion complète : token, caches locaux, retour à l'écran OTP.
Future<void> logoutPassenger(BuildContext context, WidgetRef ref) async {
  final api = ref.read(apiClientProvider);
  await api.clearToken(keepPhone: true);
  await signOutGoogle();
  if (!context.mounted) return;
  Navigator.of(context).pushAndRemoveUntil(
    MaterialPageRoute(builder: (_) => const OtpScreen()),
    (_) => false,
  );
}

Future<void> logoutDriver(BuildContext context, WidgetRef ref) async {
  final api = ref.read(apiClientProvider);
  await api.clearToken(keepPhone: true);
  await signOutGoogle();
  if (!context.mounted) return;
  Navigator.of(context).pushAndRemoveUntil(
    MaterialPageRoute(builder: (_) => const DriverOtpScreen()),
    (_) => false,
  );
}

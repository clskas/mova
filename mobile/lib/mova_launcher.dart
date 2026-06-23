import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/offline/mova_bootstrap.dart';
import 'core/offline/sync_queue.dart';
import 'core/theme/mova_theme.dart';
import 'core/widgets/offline_shell.dart';
import 'features/auth/otp_screen.dart';
import 'features/driver/driver_job_alert_service.dart';
import 'features/driver/driver_otp_screen.dart';

/// Point d'entrée partagé — évite SyncQueue non initialisé si le mauvais main.dart est ciblé.
Future<void> runMovaPassengerApp() async {
  WidgetsFlutterBinding.ensureInitialized();
  await SyncQueue.init();
  runApp(
    const ProviderScope(
      child: MovaPassengerApp(),
    ),
  );
}

Future<void> runMovaDriverApp() async {
  WidgetsFlutterBinding.ensureInitialized();
  await SyncQueue.init();
  await DriverJobAlertService.init();
  runApp(
    const ProviderScope(
      child: MovaDriverApp(),
    ),
  );
}

class MovaPassengerApp extends ConsumerStatefulWidget {
  const MovaPassengerApp({super.key});

  @override
  ConsumerState<MovaPassengerApp> createState() => _MovaPassengerAppState();
}

class _MovaPassengerAppState extends ConsumerState<MovaPassengerApp> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() => bootstrapMovaApp(ref));
  }

  @override
  Widget build(BuildContext context) {
    return movaMediaQueryWrapper(
      child: MaterialApp(
        title: 'MOVA Passager',
        theme: buildMovaTheme(),
        home: const OtpScreen(),
        debugShowCheckedModeBanner: false,
        builder: (context, child) => MovaOfflineShell(child: child),
      ),
    );
  }
}

class MovaDriverApp extends ConsumerStatefulWidget {
  const MovaDriverApp({super.key});

  @override
  ConsumerState<MovaDriverApp> createState() => _MovaDriverAppState();
}

class _MovaDriverAppState extends ConsumerState<MovaDriverApp> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() => bootstrapMovaApp(ref));
  }

  @override
  Widget build(BuildContext context) {
    return movaMediaQueryWrapper(
      child: MaterialApp(
        title: 'MOVA Chauffeur',
        theme: buildMovaTheme(),
        home: const DriverOtpScreen(),
        debugShowCheckedModeBanner: false,
        builder: (context, child) => MovaOfflineShell(child: child),
      ),
    );
  }
}

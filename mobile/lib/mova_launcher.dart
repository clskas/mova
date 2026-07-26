import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/api/api_client.dart';
import 'core/offline/mova_app_lifecycle.dart';
import 'core/offline/sync_queue.dart';
import 'core/theme/mova_theme.dart';
import 'core/widgets/offline_shell.dart';
import 'features/auth/auth_session_gate.dart';
import 'features/chat/chat_alert_service.dart';
import 'features/chat/chat_poll_service.dart';
import 'features/driver/driver_job_alert_service.dart';
import 'features/passenger/passenger_alert_service.dart';
import 'features/splash/mova_splash_screen.dart';

/// Point d'entrée partagé — évite SyncQueue non initialisé si le mauvais main.dart est ciblé.
Future<void> runMovaPassengerApp() async {
  WidgetsFlutterBinding.ensureInitialized();
  await SyncQueue.init();
  await PassengerAlertService.init();
  await ChatAlertService.init();
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
  await ChatAlertService.init();
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

class _MovaPassengerAppState extends ConsumerState<MovaPassengerApp>
    with WidgetsBindingObserver, MovaAppLifecycleMixin {
  ChatPollService? _chatPoll;

  @override
  void initState() {
    super.initState();
    _chatPoll = ChatPollService(ref.read(apiClientProvider))..start();
  }

  @override
  void dispose() {
    _chatPoll?.stop();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    super.didChangeAppLifecycleState(state);
    if (state == AppLifecycleState.resumed) _chatPoll?.poke();
  }

  @override
  Widget build(BuildContext context) {
    return movaMediaQueryWrapper(
      child: MaterialApp(
        title: 'Senga',
        theme: buildMovaTheme(),
        home: MovaSplashScreen(
          role: MovaSplashRole.passenger,
          nextScreen: const AuthSessionGate(role: AuthSessionRole.passenger),
        ),
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

class _MovaDriverAppState extends ConsumerState<MovaDriverApp>
    with WidgetsBindingObserver, MovaAppLifecycleMixin {
  ChatPollService? _chatPoll;

  @override
  void initState() {
    super.initState();
    _chatPoll = ChatPollService(ref.read(apiClientProvider))..start();
  }

  @override
  void dispose() {
    _chatPoll?.stop();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    super.didChangeAppLifecycleState(state);
    if (state == AppLifecycleState.resumed) _chatPoll?.poke();
  }

  @override
  Widget build(BuildContext context) {
    return movaMediaQueryWrapper(
      child: MaterialApp(
        title: 'SENGA Driver',
        theme: buildMovaTheme(),
        home: MovaSplashScreen(
          role: MovaSplashRole.driver,
          nextScreen: const AuthSessionGate(role: AuthSessionRole.driver),
        ),
        debugShowCheckedModeBanner: false,
        builder: (context, child) => MovaOfflineShell(child: child),
      ),
    );
  }
}

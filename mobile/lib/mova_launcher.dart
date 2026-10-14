import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/api/api_client.dart';
import 'core/api/ride_chat_socket.dart';
import 'core/api/ride_socket.dart';
import 'core/config/app_version.dart';
import 'core/navigation/mova_navigator.dart';
import 'core/offline/mova_app_lifecycle.dart';
import 'core/offline/sync_queue.dart';
import 'core/theme/mova_theme.dart';
import 'core/update/app_update_service.dart';
import 'core/widgets/offline_shell.dart';
import 'core/widgets/maintenance_gate.dart';
import 'features/auth/auth_session_gate.dart';
import 'features/chat/call_ring_service.dart';
import 'features/chat/chat_alert_service.dart';
import 'features/chat/chat_poll_service.dart';
import 'features/chat/incoming_call_overlay.dart';
import 'features/driver/driver_job_alert_service.dart';
import 'features/driver/driver_push_service.dart';
import 'features/passenger/passenger_alert_service.dart';
import 'features/sos/notification_tap_router.dart';
import 'features/splash/mova_splash_screen.dart';

export 'core/navigation/mova_navigator.dart' show movaNavigatorKey;

void _wireCallRingSocketHooks() {
  RideSocket.onCallEventHook = CallRingService.handleRealtimeCallEvent;
  RideChatSocket.onCallEventHook = CallRingService.handleRealtimeCallEvent;
}

/// Point d'entrée partagé — évite SyncQueue non initialisé si le mauvais main.dart est ciblé.
Future<void> runMovaPassengerApp() async {
  WidgetsFlutterBinding.ensureInitialized();
  AppFlavor.current = MovaAppFlavor.passenger;
  await SyncQueue.init();
  await PassengerAlertService.init();
  await ChatAlertService.init();
  await CallRingService.init();
  _wireCallRingSocketHooks();
  runApp(
    const ProviderScope(
      child: MovaPassengerApp(),
    ),
  );
}

Future<void> runMovaDriverApp() async {
  WidgetsFlutterBinding.ensureInitialized();
  AppFlavor.current = MovaAppFlavor.driver;
  await SyncQueue.init();
  await DriverPushService.registerBackgroundHandlerEarly();
  await DriverJobAlertService.init();
  await ChatAlertService.init();
  await CallRingService.init();
  _wireCallRingSocketHooks();
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
    ref.read(appUpdateServiceProvider.notifier).start();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      NotificationTapRouter.flushPendingAndLaunchDetails();
    });
  }

  @override
  void dispose() {
    _chatPoll?.stop();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    super.didChangeAppLifecycleState(state);
    if (state == AppLifecycleState.resumed) {
      _chatPoll?.poke();
      ref.read(appUpdateServiceProvider.notifier).onAppResumed();
      NotificationTapRouter.flushPendingAndLaunchDetails();
    }
  }

  @override
  Widget build(BuildContext context) {
    return movaMediaQueryWrapper(
      child: MaterialApp(
        title: 'Senga',
        navigatorKey: movaNavigatorKey,
        theme: buildMovaTheme(),
        home: MovaSplashScreen(
          role: MovaSplashRole.passenger,
          nextScreen: const AuthSessionGate(role: AuthSessionRole.passenger),
        ),
        debugShowCheckedModeBanner: false,
        builder: (context, child) => MaintenanceGate(
          child: MovaOfflineShell(
            child: IncomingCallOverlay(
              navigatorKey: movaNavigatorKey,
              child: child ?? const SizedBox.shrink(),
            ),
          ),
        ),
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
    ref.read(appUpdateServiceProvider.notifier).start();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      NotificationTapRouter.flushPendingAndLaunchDetails();
    });
  }

  @override
  void dispose() {
    _chatPoll?.stop();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    super.didChangeAppLifecycleState(state);
    if (state == AppLifecycleState.resumed) {
      _chatPoll?.poke();
      ref.read(appUpdateServiceProvider.notifier).onAppResumed();
      NotificationTapRouter.flushPendingAndLaunchDetails();
    }
  }

  @override
  Widget build(BuildContext context) {
    return movaMediaQueryWrapper(
      child: MaterialApp(
        title: 'SENGA Driver',
        navigatorKey: movaNavigatorKey,
        theme: buildMovaTheme(),
        home: MovaSplashScreen(
          role: MovaSplashRole.driver,
          nextScreen: const AuthSessionGate(role: AuthSessionRole.driver),
        ),
        debugShowCheckedModeBanner: false,
        builder: (context, child) => MaintenanceGate(
          child: MovaOfflineShell(
            child: IncomingCallOverlay(
              navigatorKey: movaNavigatorKey,
              child: child ?? const SizedBox.shrink(),
            ),
          ),
        ),
      ),
    );
  }
}

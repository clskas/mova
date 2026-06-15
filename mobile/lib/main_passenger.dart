import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/offline/mova_bootstrap.dart';
import 'core/offline/sync_queue.dart';
import 'core/theme/mova_theme.dart';
import 'core/widgets/offline_shell.dart';
import 'features/auth/otp_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await SyncQueue.init();
  runApp(
    const ProviderScope(
      child: MovaPassengerApp(),
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

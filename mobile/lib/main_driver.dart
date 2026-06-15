import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/offline/mova_bootstrap.dart';
import 'core/offline/sync_queue.dart';
import 'core/theme/mova_theme.dart';
import 'core/widgets/offline_shell.dart';
import 'features/driver/driver_otp_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await SyncQueue.init();
  runApp(
    const ProviderScope(
      child: MovaDriverApp(),
    ),
  );
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

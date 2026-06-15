import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/api/api_client.dart';
import 'core/theme/mova_theme.dart';
import 'features/driver/driver_otp_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
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
    ref.read(apiClientProvider).loadToken();
  }

  @override
  Widget build(BuildContext context) {
    return movaMediaQueryWrapper(
      child: MaterialApp(
        title: 'MOVA Chauffeur',
        theme: buildMovaTheme(),
        home: const DriverOtpScreen(),
        debugShowCheckedModeBanner: false,
      ),
    );
  }
}

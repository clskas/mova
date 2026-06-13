import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/api/api_client.dart';
import 'core/theme/mova_theme.dart';
import 'features/auth/otp_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(
    const ProviderScope(
      child: MovaApp(),
    ),
  );
}

class MovaApp extends ConsumerStatefulWidget {
  const MovaApp({super.key});

  @override
  ConsumerState<MovaApp> createState() => _MovaAppState();
}

class _MovaAppState extends ConsumerState<MovaApp> {
  @override
  void initState() {
    super.initState();
    ref.read(apiClientProvider).loadToken();
  }

  @override
  Widget build(BuildContext context) {
    return movaMediaQueryWrapper(
      child: MaterialApp(
        title: 'MOVA',
        theme: buildMovaTheme(),
        home: const OtpScreen(),
        debugShowCheckedModeBanner: false,
      ),
    );
  }
}

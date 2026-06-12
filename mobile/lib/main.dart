import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/theme/mova_theme.dart';
import 'features/auth/otp_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(
    ProviderScope(
      child: movaMediaQueryWrapper(
        child: MaterialApp(
          title: 'MOVA',
          theme: buildMovaTheme(),
          home: const OtpScreen(),
          debugShowCheckedModeBanner: false,
        ),
      ),
    ),
  );
}

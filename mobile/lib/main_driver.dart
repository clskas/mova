import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/theme/mova_theme.dart';
import 'features/driver/driver_otp_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(
    ProviderScope(
      child: movaMediaQueryWrapper(
        child: MaterialApp(
          title: 'MOVA Chauffeur',
          theme: buildMovaTheme(),
          home: const DriverOtpScreen(),
          debugShowCheckedModeBanner: false,
        ),
      ),
    ),
  );
}

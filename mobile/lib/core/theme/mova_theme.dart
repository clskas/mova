import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'mova_colors.dart';

ThemeData buildMovaTheme() {
  return ThemeData(
    useMaterial3: true,
    brightness: Brightness.light,
    scaffoldBackgroundColor: MovaColors.cloud,
    colorScheme: const ColorScheme.light(
      primary: MovaColors.midnight,
      secondary: MovaColors.violet,
      tertiary: MovaColors.green,
      error: MovaColors.error,
      surface: MovaColors.white,
      onPrimary: MovaColors.white,
      onSecondary: MovaColors.white,
      onSurface: MovaColors.midnight,
    ),
    textTheme: GoogleFonts.interTextTheme().apply(
      bodyColor: MovaColors.midnight,
      displayColor: MovaColors.midnight,
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: MovaColors.midnight,
      foregroundColor: MovaColors.white,
      elevation: 0,
      titleTextStyle: GoogleFonts.inter(
        fontSize: 18,
        fontWeight: FontWeight.w600,
        color: MovaColors.white,
      ),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: MovaColors.violet,
        foregroundColor: MovaColors.white,
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        textStyle: GoogleFonts.inter(fontWeight: FontWeight.w600),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: MovaColors.white,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide.none,
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
    ),
    cardTheme: CardThemeData(
      color: MovaColors.white,
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
    ),
  );
}

/// Caps text scale factor at 1.3 to prevent overflow
Widget movaMediaQueryWrapper({required Widget child}) {
  return Builder(
    builder: (context) {
      final mediaQuery = MediaQuery.of(context);
      final cappedScale = mediaQuery.textScaler.scale(1.0).clamp(1.0, 1.3);
      return MediaQuery(
        data: mediaQuery.copyWith(
          textScaler: TextScaler.linear(cappedScale),
        ),
        child: child,
      );
    },
  );
}

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'mova_colors.dart';

ThemeData buildMovaTheme() {
  final baseText = GoogleFonts.plusJakartaSansTextTheme();
  return ThemeData(
    useMaterial3: true,
    brightness: Brightness.light,
    scaffoldBackgroundColor: MovaColors.cloud,
    colorScheme: const ColorScheme.light(
      primary: MovaColors.violet,
      secondary: MovaColors.violetLight,
      tertiary: MovaColors.green,
      error: MovaColors.error,
      surface: MovaColors.white,
      onPrimary: MovaColors.white,
      onSecondary: MovaColors.white,
      onSurface: MovaColors.midnight,
    ),
    textTheme: baseText.apply(
      bodyColor: MovaColors.midnight,
      displayColor: MovaColors.midnight,
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: MovaColors.midnight,
      foregroundColor: MovaColors.white,
      elevation: 0,
      centerTitle: false,
      titleTextStyle: GoogleFonts.plusJakartaSans(
        fontSize: 18,
        fontWeight: FontWeight.w700,
        color: MovaColors.white,
        letterSpacing: -0.2,
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: MovaColors.white,
      indicatorColor: MovaColors.violet.withValues(alpha: 0.12),
      labelTextStyle: WidgetStateProperty.resolveWith((states) {
        return GoogleFonts.plusJakartaSans(
          fontSize: 11,
          fontWeight: states.contains(WidgetState.selected) ? FontWeight.w700 : FontWeight.w500,
        );
      }),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: MovaColors.violet,
        foregroundColor: MovaColors.white,
        elevation: 0,
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        textStyle: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700, fontSize: 15),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: MovaColors.violet,
        side: const BorderSide(color: MovaColors.border),
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        textStyle: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w600),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: MovaColors.white,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: MovaColors.border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: MovaColors.border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: MovaColors.violet, width: 1.5),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      hintStyle: GoogleFonts.plusJakartaSans(color: MovaColors.textMuted, fontSize: 14),
    ),
    cardTheme: CardThemeData(
      color: MovaColors.white,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: const BorderSide(color: MovaColors.border, width: 0.5),
      ),
    ),
    dividerTheme: const DividerThemeData(color: MovaColors.border, thickness: 0.5),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      backgroundColor: MovaColors.midnight,
      contentTextStyle: GoogleFonts.plusJakartaSans(color: MovaColors.white, fontSize: 14),
    ),
  );
}

/// Limite le zoom texte pour éviter les débordements sur petits écrans.
Widget movaMediaQueryWrapper({required Widget child}) {
  return Builder(
    builder: (context) {
      final mediaQuery = MediaQuery.of(context);
      final cappedScale = mediaQuery.textScaler.scale(1.0).clamp(1.0, 1.25);
      return MediaQuery(
        data: mediaQuery.copyWith(textScaler: TextScaler.linear(cappedScale)),
        child: child,
      );
    },
  );
}

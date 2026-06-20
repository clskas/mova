import 'package:flutter/material.dart';

/// Palette MOVA — identité premium mobilité RDC.
class MovaColors {
  MovaColors._();

  static const midnight = Color(0xFF0D0D1A);
  static const midnightSoft = Color(0xFF1A1A2E);
  static const violet = Color(0xFF6366F1);
  static const violetLight = Color(0xFF8B5CF6);
  static const green = Color(0xFF10B981);
  static const orange = Color(0xFFF97316);
  static const gold = Color(0xFFFBBF24);
  static const cloud = Color(0xFFF4F3FF);
  static const cloudDeep = Color(0xFFE8E6FF);
  static const white = Color(0xFFFFFFFF);
  static const textSecondary = Color(0xFF64748B);
  static const textMuted = Color(0xFF94A3B8);
  static const error = Color(0xFFEF4444);
  static const red = error;
  static const border = Color(0xFFE2E8F0);

  static const primaryGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [violet, violetLight],
  );

  static const heroGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [midnight, Color(0xFF2D2B55), violet],
  );

  static const cardShadow = [
    BoxShadow(
      color: Color(0x140D0D1A),
      blurRadius: 20,
      offset: Offset(0, 8),
    ),
  ];
}

import 'package:flutter/material.dart';

/// Helpers de mise en page pour petits terminaux (SUNMI, phones compacts).
abstract final class MovaLayout {
  static bool isCompact(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    return size.height < 700 || size.width < 360;
  }

  static bool isVeryCompact(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    return size.height < 580 || size.width < 320;
  }

  static double gap(BuildContext context, {double normal = 16, double compact = 10}) {
    return isCompact(context) ? compact : normal;
  }

  static EdgeInsets formPadding(BuildContext context, {EdgeInsets normal = const EdgeInsets.all(16)}) {
    if (!isCompact(context)) return normal;
    return EdgeInsets.fromLTRB(
      normal.left.clamp(0, 12),
      normal.top.clamp(0, 10),
      normal.right.clamp(0, 12),
      normal.bottom.clamp(0, 10),
    );
  }
}

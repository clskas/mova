import 'package:flutter/material.dart';

/// Branded stroke icons aligned with web `ServiceIcons.tsx`.
class MovaServiceIcon extends StatelessWidget {
  const MovaServiceIcon._(this.painter, {this.color, this.size = 24});

  final CustomPainter painter;
  final Color? color;
  final double size;

  factory MovaServiceIcon.taxi({Color? color, double size = 24}) =>
      MovaServiceIcon._(_TaxiIconPainter(color), color: color, size: size);

  factory MovaServiceIcon.parcel({Color? color, double size = 24}) =>
      MovaServiceIcon._(_ParcelIconPainter(color), color: color, size: size);

  factory MovaServiceIcon.wallet({Color? color, double size = 24}) =>
      MovaServiceIcon._(_WalletIconPainter(color), color: color, size: size);

  factory MovaServiceIcon.history({Color? color, double size = 24}) =>
      MovaServiceIcon._(_HistoryIconPainter(color), color: color, size: size);

  factory MovaServiceIcon.calendar({Color? color, double size = 24}) =>
      MovaServiceIcon._(_CalendarIconPainter(color), color: color, size: size);

  factory MovaServiceIcon.food({Color? color, double size = 24}) =>
      MovaServiceIcon._(_FoodIconPainter(color), color: color, size: size);

  factory MovaServiceIcon.errand({Color? color, double size = 24}) =>
      MovaServiceIcon._(_ErrandIconPainter(color), color: color, size: size);

  factory MovaServiceIcon.carpool({Color? color, double size = 24}) =>
      MovaServiceIcon._(_CarpoolIconPainter(color), color: color, size: size);

  factory MovaServiceIcon.location({Color? color, double size = 24}) =>
      MovaServiceIcon._(_LocationIconPainter(color), color: color, size: size);

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      height: size,
      child: CustomPaint(painter: painter),
    );
  }
}

abstract class _StrokeIconPainter extends CustomPainter {
  _StrokeIconPainter(this.color);

  final Color? color;

  Color get strokeColor => color ?? const Color(0xFF1A1A2E);

  Paint get stroke => Paint()
    ..color = strokeColor
    ..style = PaintingStyle.stroke
    ..strokeWidth = 1.75
    ..strokeCap = StrokeCap.round
    ..strokeJoin = StrokeJoin.round;

  Paint get fill => Paint()
    ..color = strokeColor
    ..style = PaintingStyle.fill;

  @override
  bool shouldRepaint(covariant _StrokeIconPainter oldDelegate) =>
      oldDelegate.color != color;
}

class _TaxiIconPainter extends _StrokeIconPainter {
  _TaxiIconPainter(super.color);

  @override
  void paint(Canvas canvas, Size size) {
    final s = size.width / 24;
    canvas.save();
    canvas.scale(s);
    canvas.drawRRect(RRect.fromRectAndRadius(const Rect.fromLTWH(3, 10, 18, 8), const Radius.circular(2)), stroke);
    canvas.drawPath(Path()..moveTo(5, 10)..lineTo(7, 6)..lineTo(17, 6)..lineTo(19, 10), stroke);
    canvas.drawCircle(const Offset(7.5, 18), 1.5, fill);
    canvas.drawCircle(const Offset(16.5, 18), 1.5, fill);
    canvas.restore();
  }
}

class _ParcelIconPainter extends _StrokeIconPainter {
  _ParcelIconPainter(super.color);

  @override
  void paint(Canvas canvas, Size size) {
    final s = size.width / 24;
    canvas.save();
    canvas.scale(s);
    canvas.drawPath(Path()..moveTo(12, 3)..lineTo(20, 7.5)..lineTo(20, 16.5)..lineTo(12, 21)..lineTo(4, 16.5)..lineTo(4, 7.5)..close(), stroke);
    canvas.drawLine(const Offset(12, 12), const Offset(20, 7.5), stroke);
    canvas.drawLine(const Offset(12, 12), const Offset(12, 21), stroke);
    canvas.drawLine(const Offset(12, 12), const Offset(4, 7.5), stroke);
    canvas.restore();
  }
}

class _WalletIconPainter extends _StrokeIconPainter {
  _WalletIconPainter(super.color);

  @override
  void paint(Canvas canvas, Size size) {
    final s = size.width / 24;
    canvas.save();
    canvas.scale(s);
    canvas.drawRRect(RRect.fromRectAndRadius(const Rect.fromLTWH(3, 6, 18, 13), const Radius.circular(2)), stroke);
    canvas.drawLine(const Offset(3, 10), const Offset(21, 10), stroke);
    canvas.drawCircle(const Offset(16, 14), 1, fill);
    canvas.restore();
  }
}

class _HistoryIconPainter extends _StrokeIconPainter {
  _HistoryIconPainter(super.color);

  @override
  void paint(Canvas canvas, Size size) {
    final s = size.width / 24;
    canvas.save();
    canvas.scale(s);
    canvas.drawCircle(const Offset(12, 12), 9, stroke);
    canvas.drawPath(Path()..moveTo(12, 7)..lineTo(12, 12)..lineTo(15, 14), stroke);
    canvas.restore();
  }
}

class _CalendarIconPainter extends _StrokeIconPainter {
  _CalendarIconPainter(super.color);

  @override
  void paint(Canvas canvas, Size size) {
    final s = size.width / 24;
    canvas.save();
    canvas.scale(s);
    canvas.drawRRect(RRect.fromRectAndRadius(const Rect.fromLTWH(4, 5, 16, 16), const Radius.circular(2)), stroke);
    canvas.drawLine(const Offset(8, 3), const Offset(8, 7), stroke);
    canvas.drawLine(const Offset(16, 3), const Offset(16, 7), stroke);
    canvas.drawLine(const Offset(4, 10), const Offset(20, 10), stroke);
    canvas.drawPath(Path()..moveTo(9, 14)..lineTo(11, 16)..lineTo(15, 12), stroke);
    canvas.restore();
  }
}

class _FoodIconPainter extends _StrokeIconPainter {
  _FoodIconPainter(super.color);

  @override
  void paint(Canvas canvas, Size size) {
    final s = size.width / 24;
    canvas.save();
    canvas.scale(s);
    canvas.drawLine(const Offset(6, 3), const Offset(6, 11), stroke);
    canvas.drawArc(const Rect.fromLTWH(3, 8, 6, 6), 0, 3.14, false, stroke);
    canvas.drawLine(const Offset(9, 11), const Offset(9, 21), stroke);
    canvas.drawLine(const Offset(18, 3), const Offset(18, 21), stroke);
    canvas.restore();
  }
}

class _ErrandIconPainter extends _StrokeIconPainter {
  _ErrandIconPainter(super.color);

  @override
  void paint(Canvas canvas, Size size) {
    final s = size.width / 24;
    canvas.save();
    canvas.scale(s);
    canvas.drawPath(Path()..moveTo(7, 7)..lineTo(21, 7)..lineTo(19.5, 16)..lineTo(8.5, 16)..close(), stroke);
    canvas.drawPath(Path()..moveTo(7, 7)..lineTo(6, 3)..lineTo(3, 3), stroke);
    canvas.drawCircle(const Offset(10, 20), 1.5, fill);
    canvas.drawCircle(const Offset(18, 20), 1.5, fill);
    canvas.restore();
  }
}

class _CarpoolIconPainter extends _StrokeIconPainter {
  _CarpoolIconPainter(super.color);

  @override
  void paint(Canvas canvas, Size size) {
    final s = size.width / 24;
    canvas.save();
    canvas.scale(s);
    canvas.drawCircle(const Offset(8, 8), 3, stroke);
    canvas.drawCircle(const Offset(16, 8), 3, stroke);
    canvas.drawPath(Path()..moveTo(4, 20)..lineTo(4, 19)..arcToPoint(const Offset(12, 15), radius: const Radius.circular(4))..arcToPoint(const Offset(20, 19), radius: const Radius.circular(4))..lineTo(20, 20), stroke);
    canvas.restore();
  }
}

class _LocationIconPainter extends _StrokeIconPainter {
  _LocationIconPainter(super.color);

  @override
  void paint(Canvas canvas, Size size) {
    final s = size.width / 24;
    canvas.save();
    canvas.scale(s);
    canvas.drawPath(Path()..moveTo(12, 21)..cubicTo(12, 21, 18, 15.8, 18, 11)..arcToPoint(const Offset(12, 5), radius: const Radius.circular(6), clockwise: false)..arcToPoint(const Offset(6, 11), radius: const Radius.circular(6), clockwise: false)..cubicTo(6, 15.8, 12, 21, 12, 21)..close(), stroke);
    canvas.drawCircle(const Offset(12, 11), 2, fill);
    canvas.restore();
  }
}

/// MOVA brand mark from `assets/icon/movaicone.png`.
class MovaBrandIcon extends StatelessWidget {
  const MovaBrandIcon({super.key, this.size = 28});

  final double size;

  @override
  Widget build(BuildContext context) {
    return Image.asset(
      'assets/icon/movaicone.png',
      width: size,
      height: size,
      fit: BoxFit.contain,
    );
  }
}

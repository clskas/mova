import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/location/service_area_gps.dart';
import '../../core/offline/mova_bootstrap.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_service_icons.dart';
import '../../core/widgets/passenger_service_icons.dart';
import 'mova_splash_content.dart';

enum MovaSplashRole { passenger, driver }

/// Écran d'accueil animé (mobilité + tous les services) avant connexion OTP.
class MovaSplashScreen extends ConsumerStatefulWidget {
  const MovaSplashScreen({
    super.key,
    required this.role,
    required this.nextScreen,
  });

  final MovaSplashRole role;
  final Widget nextScreen;

  @override
  ConsumerState<MovaSplashScreen> createState() => _MovaSplashScreenState();
}

class _MovaSplashScreenState extends ConsumerState<MovaSplashScreen>
    with TickerProviderStateMixin {
  static const _secondsPerService = 4;

  late final Duration _splashDuration;
  late final AnimationController _main;
  late final AnimationController _road;
  late final AnimationController _pulse;
  late final Animation<double> _logoScale;
  late final Animation<double> _headerFade;
  late final Animation<double> _orbitTurn;

  bool _bootstrapDone = false;
  bool _userSkipped = false;
  bool _navigated = false;

  List<MovaSplashService> get _services =>
      widget.role == MovaSplashRole.passenger
          ? passengerSplashServices
          : driverSplashServices;

  bool get _isPassenger => widget.role == MovaSplashRole.passenger;

  @override
  void initState() {
    super.initState();
    _splashDuration = Duration(seconds: _services.length * _secondsPerService);
    _main = AnimationController(vsync: this, duration: _splashDuration);
    _road = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    )..repeat();
    _pulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1800),
    )..repeat(reverse: true);

    _logoScale = CurvedAnimation(
      parent: _main,
      curve: const Interval(0, 0.35, curve: Curves.easeOutBack),
    );
    _headerFade = CurvedAnimation(
      parent: _main,
      curve: const Interval(0.1, 0.5, curve: Curves.easeOut),
    );
    _orbitTurn = CurvedAnimation(
      parent: _main,
      curve: Curves.linear,
    );

    _main.addStatusListener((status) {
      if (status == AnimationStatus.completed) _maybeNavigate();
    });

    _launch();
  }

  Future<void> _launch() async {
    unawaited(_runBootstrap());
    await _main.forward();
    _maybeNavigate();
  }

  Future<void> _runBootstrap() async {
    await bootstrapMovaApp(ref);
    await ServiceAreaGps.sync(ref);
    if (!mounted) return;
    setState(() => _bootstrapDone = true);
    _maybeNavigate();
  }

  void _skip() {
    if (_navigated) return;
    setState(() => _userSkipped = true);
    _maybeNavigate();
  }

  void _maybeNavigate() {
    if (_navigated || !mounted) return;
    if (!_bootstrapDone) return;
    if (!_userSkipped && !_main.isCompleted) return;

    _navigated = true;
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (_) => widget.nextScreen),
    );
  }

  int _secondsRemaining(double t) {
    final left = (_splashDuration.inMilliseconds * (1 - t)).ceil();
    return (left / 1000).ceil().clamp(0, _splashDuration.inSeconds);
  }

  @override
  void dispose() {
    _main.dispose();
    _road.dispose();
    _pulse.dispose();
    super.dispose();
  }

  int _highlightIndex(double t) {
    final n = _services.length;
    if (n == 0) return 0;
    return (t * n).floor().clamp(0, n - 1);
  }

  @override
  Widget build(BuildContext context) {
    final title = _isPassenger ? 'MOVA Passager' : 'MOVA Chauffeur';
    final subtitle = _isPassenger
        ? 'Mobilité · Livraisons · Paiements — 32 villes RDC'
        : 'Courses · Livraisons · Missions — partout en RDC';

    return Scaffold(
      body: AnimatedBuilder(
        animation: Listenable.merge([_main, _road, _pulse]),
        builder: (context, _) {
          final t = _main.value;
          final highlight = _highlightIndex(t);
          final featured = _services[highlight];

          return Container(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment(
                  math.sin(t * math.pi) * 0.15,
                  0.88 + 0.06 * math.sin(t * math.pi * 2),
                ),
                colors: _isPassenger
                    ? [
                        MovaColors.midnight,
                        const Color(0xFF252347),
                        MovaColors.violet.withValues(alpha: 0.95),
                        const Color(0xFF4F46E5),
                      ]
                    : [
                        MovaColors.midnight,
                        const Color(0xFF14281F),
                        MovaColors.green.withValues(alpha: 0.75),
                        const Color(0xFF065F46),
                      ],
              ),
            ),
            child: SafeArea(
              child: Stack(
                children: [
                  Positioned.fill(
                    child: GestureDetector(
                      behavior: HitTestBehavior.opaque,
                      onTap: _skip,
                      child: const SizedBox.expand(),
                    ),
                  ),
                  Positioned.fill(
                    child: IgnorePointer(
                      child: CustomPaint(
                        painter: _CitySkylinePainter(
                          progress: t,
                          isPassenger: _isPassenger,
                        ),
                      ),
                    ),
                  ),
                  Positioned.fill(
                    child: IgnorePointer(
                      child: CustomPaint(
                        painter: _RoadPainter(
                          progress: _road.value,
                          laneCount: _isPassenger ? 2 : 1,
                        ),
                      ),
                    ),
                  ),
                  ..._buildFloatingVehicles(t),
                  Positioned(
                    top: 8,
                    right: 12,
                    child: TextButton(
                      onPressed: _skip,
                      style: TextButton.styleFrom(
                        foregroundColor: Colors.white,
                        backgroundColor: Colors.white.withValues(alpha: 0.14),
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                      ),
                      child: Text(
                        _bootstrapDone
                            ? 'Passer${_userSkipped ? '' : ' · ${_secondsRemaining(t)}s'}'
                            : 'Chargement…',
                        style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
                      ),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 20),
                    child: IgnorePointer(
                      child: Column(
                      children: [
                        const SizedBox(height: 12),
                        FadeTransition(
                          opacity: _headerFade,
                          child: ScaleTransition(
                            scale: Tween<double>(begin: 0.55, end: 1).animate(_logoScale),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                ScaleTransition(
                                  scale: Tween<double>(begin: 1, end: 1.06)
                                      .animate(_pulse),
                                  child: const MovaBrandIcon(size: 52),
                                ),
                                const SizedBox(width: 12),
                                Flexible(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        title,
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: Theme.of(context)
                                            .textTheme
                                            .titleLarge
                                            ?.copyWith(
                                              color: Colors.white,
                                              fontWeight: FontWeight.w800,
                                            ),
                                      ),
                                      Text(
                                        subtitle,
                                        maxLines: 2,
                                        overflow: TextOverflow.ellipsis,
                                        style: Theme.of(context)
                                            .textTheme
                                            .bodySmall
                                            ?.copyWith(
                                              color: Colors.white.withValues(alpha: 0.8),
                                              height: 1.25,
                                            ),
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(height: 20),
                        Expanded(
                          child: _ServiceOrbit(
                            services: _services,
                            turn: _orbitTurn.value,
                            highlightIndex: highlight,
                          ),
                        ),
                        _FeaturedServiceCard(
                          service: featured,
                          key: ValueKey(featured.label),
                        ),
                        const SizedBox(height: 14),
                        _ServiceStrip(
                          services: _services,
                          highlightIndex: highlight,
                        ),
                        const SizedBox(height: 16),
                        FadeTransition(
                          opacity: _headerFade,
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              SizedBox(
                                width: 22,
                                height: 22,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2.2,
                                  color: Colors.white.withValues(alpha: 0.85),
                                ),
                              ),
                              const SizedBox(width: 10),
                              Text(
                                'Chargement de vos services…',
                                style: TextStyle(
                                  color: Colors.white.withValues(alpha: 0.75),
                                  fontSize: 12,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 16),
                        Text(
                          'Touchez l\'écran ou Passer pour continuer',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            color: Colors.white.withValues(alpha: 0.65),
                            fontSize: 11,
                          ),
                        ),
                        const SizedBox(height: 8),
                      ],
                    ),
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  List<Widget> _buildFloatingVehicles(double t) {
    final h = MediaQuery.sizeOf(context).height;
    final w = MediaQuery.sizeOf(context).width;
    final roadY = h * 0.72;

    if (_isPassenger) {
      return [
        _vehicleBubble(
          left: w * (-0.1 + t * 1.15),
          top: roadY - 42,
          child: PassengerServiceIcon.taxi(size: 26),
        ),
        _vehicleBubble(
          left: w * (0.05 + ((t + 0.35) % 1.0) * 1.05),
          top: roadY - 8,
          small: true,
          child: PassengerServiceIcon.delivery(size: 20),
        ),
      ];
    }

    return [
      _vehicleBubble(
        left: w * (-0.08 + t * 1.12),
        top: roadY - 40,
        child: const Icon(Icons.local_shipping_outlined, color: Colors.white, size: 28),
      ),
      _vehicleBubble(
        left: w * (0.1 + ((t + 0.4) % 1.0) * 0.95),
        top: roadY - 6,
        small: true,
        child: MovaServiceIcon.taxi(color: Colors.white, size: 20),
      ),
    ];
  }

  Widget _vehicleBubble({
    required double left,
    required double top,
    required Widget child,
    bool small = false,
  }) {
    return Positioned(
      left: left,
      top: top,
      child: Container(
        padding: EdgeInsets.all(small ? 8 : 10),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.14),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: Colors.white.withValues(alpha: 0.2)),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.2),
              blurRadius: 12,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: child,
      ),
    );
  }
}

class _ServiceOrbit extends StatelessWidget {
  const _ServiceOrbit({
    required this.services,
    required this.turn,
    required this.highlightIndex,
  });

  final List<MovaSplashService> services;
  final double turn;
  final int highlightIndex;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final cx = constraints.maxWidth / 2;
        final cy = constraints.maxHeight / 2;
        final radius = math.min(cx, cy) * 0.82;

        return Stack(
          clipBehavior: Clip.none,
          children: [
            for (var i = 0; i < services.length; i++)
              _orbitChip(
                service: services[i],
                active: i == highlightIndex,
                angle: (i / services.length) * math.pi * 2 + turn * math.pi * 2,
                cx: cx,
                cy: cy,
                radius: radius,
              ),
          ],
        );
      },
    );
  }

  Widget _orbitChip({
    required MovaSplashService service,
    required bool active,
    required double angle,
    required double cx,
    required double cy,
    required double radius,
  }) {
    final x = cx + math.cos(angle) * radius - (active ? 28 : 22);
    final y = cy + math.sin(angle) * radius * 0.55 - (active ? 28 : 22);
    final scale = active ? 1.15 : 0.82;

    final chipSize = active ? 56.0 : 44.0;
    final iconSize = service.brandedIcon
        ? chipSize
        : (active ? 26.0 : 18.0);

    return AnimatedPositioned(
      duration: const Duration(milliseconds: 280),
      curve: Curves.easeOutCubic,
      left: x,
      top: y,
      child: AnimatedScale(
        scale: scale,
        duration: const Duration(milliseconds: 280),
        child: AnimatedOpacity(
          opacity: active ? 1 : 0.55,
          duration: const Duration(milliseconds: 280),
          child: Container(
            width: chipSize,
            height: chipSize,
            decoration: service.brandedIcon
                ? BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: Colors.white.withValues(alpha: active ? 0.45 : 0.2),
                      width: active ? 2 : 1,
                    ),
                    boxShadow: active
                        ? [
                            BoxShadow(
                              color: service.color.withValues(alpha: 0.35),
                              blurRadius: 14,
                              spreadRadius: 1,
                            ),
                          ]
                        : null,
                  )
                : BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: LinearGradient(
                      colors: [
                        service.color.withValues(alpha: active ? 0.95 : 0.5),
                        service.color.withValues(alpha: active ? 0.55 : 0.25),
                      ],
                    ),
                    border: Border.all(
                      color: Colors.white.withValues(alpha: active ? 0.5 : 0.2),
                      width: active ? 2 : 1,
                    ),
                    boxShadow: active
                        ? [
                            BoxShadow(
                              color: service.color.withValues(alpha: 0.45),
                              blurRadius: 16,
                              spreadRadius: 1,
                            ),
                          ]
                        : null,
                  ),
            child: Center(
              child: service.brandedIcon
                  ? ClipOval(
                      child: SizedBox(
                        width: iconSize,
                        height: iconSize,
                        child: FittedBox(fit: BoxFit.cover, child: service.icon),
                      ),
                    )
                  : SizedBox(
                      width: iconSize,
                      height: iconSize,
                      child: FittedBox(child: service.icon),
                    ),
            ),
          ),
        ),
      ),
    );
  }
}

class _FeaturedServiceCard extends StatelessWidget {
  const _FeaturedServiceCard({super.key, required this.service});

  final MovaSplashService service;

  @override
  Widget build(BuildContext context) {
    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 350),
      switchInCurve: Curves.easeOutCubic,
      switchOutCurve: Curves.easeInCubic,
      child: Container(
        key: ValueKey(service.label),
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: Colors.white.withValues(alpha: 0.18)),
        ),
        child: Row(
          children: [
            service.brandedIcon
                ? ClipRRect(
                    borderRadius: BorderRadius.circular(14),
                    child: SizedBox(
                      width: 52,
                      height: 52,
                      child: FittedBox(fit: BoxFit.cover, child: service.icon),
                    ),
                  )
                : Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: service.color.withValues(alpha: 0.35),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: service.icon,
                  ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    service.label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                      fontSize: 16,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    service.description,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.82),
                      fontSize: 12,
                      height: 1.3,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ServiceStrip extends StatelessWidget {
  const _ServiceStrip({
    required this.services,
    required this.highlightIndex,
  });

  final List<MovaSplashService> services;
  final int highlightIndex;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 6,
      child: Row(
        children: [
          for (var i = 0; i < services.length; i++) ...[
            if (i > 0) const SizedBox(width: 4),
            Expanded(
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 250),
                height: 4,
                decoration: BoxDecoration(
                  color: i == highlightIndex
                      ? services[i].color
                      : Colors.white.withValues(alpha: 0.25),
                  borderRadius: BorderRadius.circular(4),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _RoadPainter extends CustomPainter {
  _RoadPainter({required this.progress, this.laneCount = 1});

  final double progress;
  final int laneCount;

  @override
  void paint(Canvas canvas, Size size) {
    final roadTop = size.height * 0.58;
    final roadH = size.height * 0.22;
    final roadRect = Rect.fromLTWH(0, roadTop, size.width, roadH);
    canvas.drawRRect(
      RRect.fromRectAndRadius(roadRect, const Radius.circular(10)),
      Paint()..color = Colors.white.withValues(alpha: 0.07),
    );

    const dashWidth = 24.0;
    const gap = 20.0;
    for (var lane = 0; lane < laneCount; lane++) {
      final y = roadTop + roadH * (0.35 + lane * 0.35);
      final dashPaint = Paint()
        ..color = Colors.white.withValues(alpha: lane == 0 ? 0.4 : 0.22)
        ..strokeWidth = 2.5
        ..strokeCap = StrokeCap.round;
      var x = -((progress * (dashWidth + gap) * (1 + lane * 0.3)) % (dashWidth + gap));
      while (x < size.width) {
        canvas.drawLine(Offset(x, y), Offset(x + dashWidth, y), dashPaint);
        x += dashWidth + gap;
      }
    }
  }

  @override
  bool shouldRepaint(covariant _RoadPainter oldDelegate) =>
      oldDelegate.progress != progress || oldDelegate.laneCount != laneCount;
}

class _CitySkylinePainter extends CustomPainter {
  _CitySkylinePainter({required this.progress, required this.isPassenger});

  final double progress;
  final bool isPassenger;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = Colors.white.withValues(alpha: 0.06)
      ..style = PaintingStyle.fill;

    final baseY = size.height * 0.56;
    final path = Path()..moveTo(0, baseY);

    for (var x = 0.0; x <= size.width; x += 28) {
      final h = 12 + (math.sin((x / size.width + progress) * math.pi * 4) * 0.5 + 0.5) * 36;
      path.lineTo(x, baseY - h);
      path.lineTo(x + 14, baseY - h * 0.7);
    }
    path.lineTo(size.width, baseY);
    path.close();
    canvas.drawPath(path, paint);

    if (isPassenger) {
      final dotPaint = Paint()..color = MovaColors.gold.withValues(alpha: 0.35);
      for (var i = 0; i < 8; i++) {
        final dx = (size.width * (i / 8) + progress * 40) % size.width;
        final dy = 40.0 + (i % 3) * 18.0;
        canvas.drawCircle(Offset(dx, dy), 1.5, dotPaint);
      }
    }
  }

  @override
  bool shouldRepaint(covariant _CitySkylinePainter oldDelegate) =>
      oldDelegate.progress != progress;
}

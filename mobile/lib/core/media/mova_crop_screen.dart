import 'dart:io';
import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';

/// Écran de rognage Flutter (remplace uCrop) :
/// croix + titre « Rogner » centrés ; Valider en haut et en bas au centre.
class MovaCropScreen extends StatefulWidget {
  const MovaCropScreen({super.key, required this.sourcePath});

  final String sourcePath;

  @override
  State<MovaCropScreen> createState() => _MovaCropScreenState();
}

class _MovaCropScreenState extends State<MovaCropScreen> {
  final TransformationController _transform = TransformationController();
  ui.Image? _decoded;
  Uint8List? _bytes;
  /// Taille réelle de la zone InteractiveViewer (pas une estimation chrome).
  Size? _viewportSize;
  bool _busy = false;
  String? _error;

  static const _accent = Color(0xFF6366F1);
  static const _frameFraction = 0.86;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _transform.dispose();
    _decoded?.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      // XFile lit file:// et content:// (Android galerie) — File() échoue souvent.
      final bytes = await XFile(widget.sourcePath).readAsBytes();
      final codec = await ui.instantiateImageCodec(bytes);
      final frame = await codec.getNextFrame();
      if (!mounted) {
        frame.image.dispose();
        return;
      }
      final previous = _decoded;
      setState(() {
        _bytes = bytes;
        _decoded = frame.image;
        _error = null;
      });
      previous?.dispose();
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = 'Impossible de charger l\'image.');
    }
  }

  Future<void> _validate() async {
    if (_busy || _decoded == null) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final cropped = await _exportCrop();
      if (!mounted) return;
      if (cropped == null) {
        setState(() {
          _busy = false;
          _error = 'Échec du rognage. Réessayez.';
        });
        return;
      }
      Navigator.of(context).pop(cropped);
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = 'Échec du rognage. Réessayez.';
      });
    }
  }

  /// Zone visible dans le cadre central → pixels source.
  Future<XFile?> _exportCrop() async {
    final image = _decoded;
    final viewport = _viewportSize;
    if (image == null || viewport == null) return null;

    final viewW = viewport.width;
    final viewH = viewport.height;
    if (viewW <= 0 || viewH <= 0) return null;

    final frameSide = math.min(viewW, viewH) * _frameFraction;
    final frameLeft = (viewW - frameSide) / 2;
    final frameTop = (viewH - frameSide) / 2;

    final imgW = image.width.toDouble();
    final imgH = image.height.toDouble();
    final fitted = applyBoxFit(BoxFit.contain, Size(imgW, imgH), Size(viewW, viewH));
    final display = fitted.destination;
    final baseLeft = (viewW - display.width) / 2;
    final baseTop = (viewH - display.height) / 2;

    final matrix = _transform.value;
    Matrix4 inv;
    try {
      inv = Matrix4.inverted(matrix);
    } catch (_) {
      inv = Matrix4.identity();
    }

    Offset toImage(Offset viewPoint) {
      final local = MatrixUtils.transformPoint(inv, viewPoint);
      final dx = (local.dx - baseLeft) / display.width * imgW;
      final dy = (local.dy - baseTop) / display.height * imgH;
      return Offset(dx, dy);
    }

    final a = toImage(Offset(frameLeft, frameTop));
    final b = toImage(Offset(frameLeft + frameSide, frameTop + frameSide));
    var left = math.min(a.dx, b.dx);
    var top = math.min(a.dy, b.dy);
    var right = math.max(a.dx, b.dx);
    var bottom = math.max(a.dy, b.dy);

    // Si le cadre sort trop hors image (zoom/pan), clamp puis fallback centre.
    left = left.clamp(0.0, imgW);
    top = top.clamp(0.0, imgH);
    right = right.clamp(0.0, imgW);
    bottom = bottom.clamp(0.0, imgH);

    if (right - left < 8 || bottom - top < 8) {
      // Fallback : carré centré sur l'image (évite un Valider mort sur Android).
      final side = math.min(imgW, imgH);
      left = (imgW - side) / 2;
      top = (imgH - side) / 2;
      right = left + side;
      bottom = top + side;
    }

    final cropW = right - left;
    final cropH = bottom - top;
    if (cropW < 1 || cropH < 1) return null;

    const maxSide = 1024.0;
    final scale = math.min(1.0, maxSide / math.max(cropW, cropH));
    final outW = math.max(1, (cropW * scale).round());
    final outH = math.max(1, (cropH * scale).round());

    final recorder = ui.PictureRecorder();
    final canvas = Canvas(recorder);
    canvas.drawImageRect(
      image,
      Rect.fromLTRB(left, top, right, bottom),
      Rect.fromLTWH(0, 0, outW.toDouble(), outH.toDouble()),
      Paint()..filterQuality = FilterQuality.high,
    );
    final picture = recorder.endRecording();
    final out = await picture.toImage(outW, outH);
    final byteData = await out.toByteData(format: ui.ImageByteFormat.png);
    out.dispose();
    if (byteData == null) return null;

    final dir = await getTemporaryDirectory();
    final file = File('${dir.path}/mova_crop_${DateTime.now().millisecondsSinceEpoch}.png');
    await file.writeAsBytes(byteData.buffer.asUint8List(), flush: true);
    return XFile(file.path, mimeType: 'image/png');
  }

  Widget _validateButton({required bool compact}) {
    return FilledButton(
      onPressed: _busy || _decoded == null ? null : _validate,
      style: FilledButton.styleFrom(
        backgroundColor: _accent,
        foregroundColor: Colors.white,
        minimumSize: Size(compact ? 140 : 180, compact ? 48 : 54),
        padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 12),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        elevation: 3,
      ),
      child: _busy
          ? const SizedBox(
              width: 22,
              height: 22,
              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
            )
          : Text(
              'Valider',
              style: TextStyle(
                fontSize: compact ? 16 : 18,
                fontWeight: FontWeight.w700,
              ),
            ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Column(
          children: [
            SizedBox(
              height: 56,
              child: Stack(
                alignment: Alignment.center,
                children: [
                  Align(
                    alignment: Alignment.centerLeft,
                    child: IconButton(
                      onPressed: _busy ? null : () => Navigator.of(context).pop(),
                      icon: const Icon(Icons.close, color: Colors.white, size: 28),
                      tooltip: 'Annuler',
                    ),
                  ),
                  const Text(
                    'Rogner',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Center(child: _validateButton(compact: true)),
            ),
            Expanded(
              child: _error != null && _decoded == null
                  ? Center(
                      child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              _error!,
                              textAlign: TextAlign.center,
                              style: const TextStyle(color: Colors.white70),
                            ),
                            const SizedBox(height: 16),
                            TextButton(
                              onPressed: _load,
                              child: const Text('Réessayer', style: TextStyle(color: Colors.white)),
                            ),
                          ],
                        ),
                      ),
                    )
                  : _decoded == null || _bytes == null
                      ? const Center(child: CircularProgressIndicator(color: _accent))
                      : LayoutBuilder(
                          builder: (context, constraints) {
                            // Sync — utilisé au Valider ; pas de setState pendant le build.
                            _viewportSize = Size(constraints.maxWidth, constraints.maxHeight);
                            final side =
                                math.min(constraints.maxWidth, constraints.maxHeight) * _frameFraction;
                            return Stack(
                              fit: StackFit.expand,
                              children: [
                                InteractiveViewer(
                                  transformationController: _transform,
                                  minScale: 1,
                                  maxScale: 5,
                                  boundaryMargin: const EdgeInsets.all(120),
                                  child: SizedBox(
                                    width: constraints.maxWidth,
                                    height: constraints.maxHeight,
                                    child: Image.memory(
                                      _bytes!,
                                      fit: BoxFit.contain,
                                      gaplessPlayback: true,
                                    ),
                                  ),
                                ),
                                IgnorePointer(
                                  child: CustomPaint(
                                    painter: _CropFramePainter(frameSide: side, color: _accent),
                                  ),
                                ),
                                if (_error != null)
                                  Positioned(
                                    left: 16,
                                    right: 16,
                                    bottom: 8,
                                    child: Text(
                                      _error!,
                                      textAlign: TextAlign.center,
                                      style: const TextStyle(color: Colors.orangeAccent, fontSize: 13),
                                    ),
                                  ),
                              ],
                            );
                          },
                        ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 16),
              child: Column(
                children: [
                  Text(
                    'Pincez pour zoomer, glissez pour cadrer',
                    style: TextStyle(color: Colors.white.withValues(alpha: 0.7), fontSize: 13),
                  ),
                  const SizedBox(height: 12),
                  Center(child: _validateButton(compact: false)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CropFramePainter extends CustomPainter {
  _CropFramePainter({required this.frameSide, required this.color});

  final double frameSide;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final left = (size.width - frameSide) / 2;
    final top = (size.height - frameSide) / 2;
    final rect = Rect.fromLTWH(left, top, frameSide, frameSide);
    final overlay = Paint()..color = Colors.black.withValues(alpha: 0.55);
    final path = Path()
      ..addRect(Offset.zero & size)
      ..addRRect(RRect.fromRectAndRadius(rect, const Radius.circular(12)))
      ..fillType = PathFillType.evenOdd;
    canvas.drawPath(path, overlay);
    canvas.drawRRect(
      RRect.fromRectAndRadius(rect, const Radius.circular(12)),
      Paint()
        ..color = color
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.5,
    );
  }

  @override
  bool shouldRepaint(covariant _CropFramePainter oldDelegate) =>
      oldDelegate.frameSide != frameSide || oldDelegate.color != color;
}

Future<XFile?> showMovaCropScreen(BuildContext context, String sourcePath) {
  return Navigator.of(context).push<XFile?>(
    MaterialPageRoute(
      fullscreenDialog: true,
      builder: (_) => MovaCropScreen(sourcePath: sourcePath),
    ),
  );
}

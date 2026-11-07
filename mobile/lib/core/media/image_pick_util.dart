import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_cropper/image_cropper.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../api/api_client.dart';
import '../navigation/mova_navigator.dart';
import 'mova_crop_screen.dart';
import '../../core/i18n/i18n.dart';

/// Paramètres adaptés aux appareils à faible mémoire (évite le kill processus caméra).
const int kMovaPickMaxSide = 1024;
const int kMovaPickQuality = 65;

/// Stamp session + camera guard before OS camera/gallery (Android often kills the process).
Future<void> markExternalCaptureSessionGuard() async {
  final prefs = await SharedPreferences.getInstance();
  final now = DateTime.now().millisecondsSinceEpoch;
  await prefs.setInt(ApiClient.sessionUnlockedAtKey, now);
  await prefs.setInt(ApiClient.cameraCaptureGuardKey, now);
}

/// uCrop / TOCrop exigent un vrai chemin fichier (pas content://).
Future<String> _localPathForCrop(XFile source) async {
  final path = source.path;
  if (!path.startsWith('content:') && !path.startsWith('content://')) {
    final f = File(path);
    if (await f.exists()) return path;
  }
  final bytes = await source.readAsBytes();
  final dir = await getTemporaryDirectory();
  final ext = source.mimeType?.contains('png') == true ? 'png' : 'jpg';
  final file = File('${dir.path}/mova_pick_${DateTime.now().millisecondsSinceEpoch}.$ext');
  await file.writeAsBytes(bytes, flush: true);
  return file.path;
}

Future<XFile?> pickMovaImage(
  ImagePicker picker,
  ImageSource source, {
  CameraDevice preferredCameraDevice = CameraDevice.rear,
  bool allowCrop = true,
}) async {
  try {
    await markExternalCaptureSessionGuard();
    final picked = await picker.pickImage(
      source: source,
      maxWidth: kMovaPickMaxSide.toDouble(),
      maxHeight: kMovaPickMaxSide.toDouble(),
      imageQuality: kMovaPickQuality,
      requestFullMetadata: false,
      preferredCameraDevice: preferredCameraDevice,
    );
    if (picked == null) return null;
    if (!allowCrop) return picked;
    return await cropMovaImage(picked);
  } catch (_) {
    return null;
  }
}

/// Rogne via uCrop (Android) / TOCrop (iOS).
/// Sur Android le ✓ toolbar est masqué et réaffiché en bas au centre (natif).
Future<XFile?> cropMovaImage(XFile source) async {
  try {
    await markExternalCaptureSessionGuard();
    final localPath = await _localPathForCrop(source);
    const presets = <CropAspectRatioPresetData>[
      CropAspectRatioPreset.original,
      CropAspectRatioPreset.square,
      CropAspectRatioPreset.ratio4x3,
      CropAspectRatioPreset.ratio16x9,
    ];
    final cropped = await ImageCropper().cropImage(
      sourcePath: localPath,
      compressFormat: ImageCompressFormat.jpg,
      compressQuality: kMovaPickQuality,
      maxWidth: kMovaPickMaxSide,
      maxHeight: kMovaPickMaxSide,
      uiSettings: [
        AndroidUiSettings(
          toolbarTitle: tr('Rogner'),
          toolbarColor: const Color(0xFF6366F1),
          toolbarWidgetColor: Colors.white,
          activeControlsWidgetColor: const Color(0xFF6366F1),
          statusBarLight: false,
          initAspectRatio: CropAspectRatioPreset.original,
          lockAspectRatio: false,
          aspectRatioPresets: presets,
          // Pas de barre bas uCrop (rotate/scale) — seul le ✓ bas-centre injecté.
          hideBottomControls: true,
          dimmedLayerColor: const Color(0x99000000),
          cropFrameColor: const Color(0xFF6366F1),
          cropGridColor: const Color(0x66FFFFFF),
        ),
        IOSUiSettings(
          title: tr('Rogner'),
          cancelButtonTitle: tr('Annuler'),
          doneButtonTitle: tr('Valider'),
          aspectRatioPresets: presets,
        ),
      ],
    );
    if (cropped != null) return XFile(cropped.path, mimeType: 'image/jpeg');
    return null;
  } catch (_) {
    return _cropWithFlutterFallback(source);
  }
}

Future<XFile?> _cropWithFlutterFallback(XFile source) async {
  try {
    await markExternalCaptureSessionGuard();
    final nav = movaNavigatorKey.currentState;
    if (nav == null || !nav.mounted) return source;
    final localPath = await _localPathForCrop(source);
    final cropped = await nav.push<XFile?>(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (_) => MovaCropScreen(sourcePath: localPath),
      ),
    );
    if (cropped == null) return null;
    return cropped;
  } catch (_) {
    return source;
  }
}

void showImagePickError(BuildContext context, {String? message}) {
  if (!context.mounted) return;
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(
      content: Text(
        message ??
            tr('Impossible d\'accéder à la caméra ou à la galerie. Réessayez.'),
      ),
    ),
  );
}

Future<ImageSource?> showMovaImageSourceSheet(BuildContext context) {
  return showModalBottomSheet<ImageSource>(
    context: context,
    builder: (ctx) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ListTile(
            leading: const Icon(Icons.camera_alt),
            title: Text(tr('Prendre une photo')),
            onTap: () => Navigator.pop(ctx, ImageSource.camera),
          ),
          ListTile(
            leading: const Icon(Icons.photo_library),
            title: Text(tr('Galerie')),
            onTap: () => Navigator.pop(ctx, ImageSource.gallery),
          ),
        ],
      ),
    ),
  );
}

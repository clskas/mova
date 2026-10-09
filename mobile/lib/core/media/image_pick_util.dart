import 'package:flutter/material.dart';
import 'package:image_cropper/image_cropper.dart';
import 'package:image_picker/image_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../api/api_client.dart';

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

/// Ouvre l'UI de rognage après sélection (KYC, véhicule, colis, déménagement, preuves).
Future<XFile?> cropMovaImage(XFile source) async {
  try {
    await markExternalCaptureSessionGuard();
    const presets = <CropAspectRatioPresetData>[
      CropAspectRatioPreset.original,
      CropAspectRatioPreset.square,
      CropAspectRatioPreset.ratio4x3,
      CropAspectRatioPreset.ratio16x9,
    ];
    final cropped = await ImageCropper().cropImage(
      sourcePath: source.path,
      compressFormat: ImageCompressFormat.jpg,
      compressQuality: kMovaPickQuality,
      maxWidth: kMovaPickMaxSide,
      maxHeight: kMovaPickMaxSide,
      uiSettings: [
        AndroidUiSettings(
          toolbarTitle: 'Rogner',
          toolbarColor: const Color(0xFF6366F1),
          toolbarWidgetColor: Colors.white,
          activeControlsWidgetColor: const Color(0xFF6366F1),
          initAspectRatio: CropAspectRatioPreset.original,
          lockAspectRatio: false,
          aspectRatioPresets: presets,
        ),
        IOSUiSettings(
          title: 'Rogner',
          cancelButtonTitle: 'Annuler',
          doneButtonTitle: 'OK',
          aspectRatioPresets: presets,
        ),
      ],
    );
    if (cropped == null) return null;
    return XFile(cropped.path);
  } catch (_) {
    // Si le crop échoue (plugin / activité), garder l'image d'origine.
    return source;
  }
}

void showImagePickError(BuildContext context, {String? message}) {
  if (!context.mounted) return;
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(
      content: Text(
        message ??
            'Impossible d\'accéder à la caméra ou à la galerie. Réessayez.',
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
            title: const Text('Prendre une photo'),
            onTap: () => Navigator.pop(ctx, ImageSource.camera),
          ),
          ListTile(
            leading: const Icon(Icons.photo_library),
            title: const Text('Galerie'),
            onTap: () => Navigator.pop(ctx, ImageSource.gallery),
          ),
        ],
      ),
    ),
  );
}

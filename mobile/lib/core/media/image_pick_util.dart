import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

/// Paramètres adaptés aux appareils à faible mémoire (évite le kill processus caméra).
const int kMovaPickMaxSide = 1024;
const int kMovaPickQuality = 65;

Future<XFile?> pickMovaImage(
  ImagePicker picker,
  ImageSource source, {
  CameraDevice preferredCameraDevice = CameraDevice.rear,
}) async {
  try {
    return await picker.pickImage(
      source: source,
      maxWidth: kMovaPickMaxSide.toDouble(),
      maxHeight: kMovaPickMaxSide.toDouble(),
      imageQuality: kMovaPickQuality,
      requestFullMetadata: false,
      preferredCameraDevice: preferredCameraDevice,
    );
  } catch (_) {
    return null;
  }
}

void showImagePickError(BuildContext context) {
  if (!context.mounted) return;
  ScaffoldMessenger.of(context).showSnackBar(
    const SnackBar(
      content: Text('Impossible d\'accéder à la caméra ou à la galerie. Réessayez.'),
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

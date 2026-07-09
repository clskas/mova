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

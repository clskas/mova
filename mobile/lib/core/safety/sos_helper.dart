import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import '../../core/api/api_client.dart';
import '../../core/error/result.dart';
import '../../core/theme/mova_colors.dart';

/// Resolve GPS for SOS (high accuracy, then optional fallback).
Future<({double? lat, double? lng})> resolveSosPosition({
  double? fallbackLat,
  double? fallbackLng,
}) async {
  try {
    if (await Geolocator.isLocationServiceEnabled()) {
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.whileInUse ||
          permission == LocationPermission.always) {
        final pos = await Geolocator.getCurrentPosition(
          locationSettings: const LocationSettings(
            accuracy: LocationAccuracy.high,
            timeLimit: Duration(seconds: 12),
          ),
        );
        return (lat: pos.latitude, lng: pos.longitude);
      }
    }
  } catch (_) {
    /* fallback below */
  }
  if (fallbackLat != null && fallbackLng != null) {
    return (lat: fallbackLat, lng: fallbackLng);
  }
  return (lat: null, lng: null);
}

/// Confirm + send SOS (passager / chauffeur). Notifie l'équipe SENGA.
Future<void> triggerSosAlert(
  WidgetRef ref,
  BuildContext context, {
  required String description,
  String? rideId,
  String? referenceType,
  String? referenceId,
  double? fallbackLat,
  double? fallbackLng,
}) async {
  final confirm = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: const Text('Alerte SOS'),
      content: const Text(
        'SENGA transmettra votre position à l\'équipe support. '
        'En cas de danger immédiat, appelez aussi les secours locaux.',
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Annuler')),
        TextButton(
          onPressed: () => Navigator.pop(ctx, true),
          child: const Text('Envoyer SOS', style: TextStyle(color: MovaColors.red)),
        ),
      ],
    ),
  );
  if (confirm != true || !context.mounted) return;

  final sosPos = await resolveSosPosition(
    fallbackLat: fallbackLat,
    fallbackLng: fallbackLng,
  );
  if (!context.mounted) return;

  final api = ref.read(apiClientProvider);
  final result = await api.reportSos(
    description: description,
    rideId: rideId,
    referenceType: referenceType,
    referenceId: referenceId,
    lat: sosPos.lat,
    lng: sosPos.lng,
  );
  if (!context.mounted) return;
  switch (result) {
    case Success():
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Alerte SOS envoyée — l\'équipe SENGA a été notifiée')),
      );
    case Failure(:final error):
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.message)));
  }
}

/// Red SOS icon for app bars (driver / passenger active jobs).
Widget sosAppBarButton({
  required VoidCallback onPressed,
}) {
  return IconButton(
    icon: const Icon(Icons.emergency_share, color: MovaColors.red),
    tooltip: 'SOS',
    onPressed: onPressed,
  );
}

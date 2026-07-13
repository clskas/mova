import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';

import '../theme/mova_colors.dart';

/// État GPS / permissions au démarrage ou au retour sur l'app.
enum GpsReadiness {
  ready,
  serviceDisabled,
  permissionDenied,
  permissionDeniedForever,
}

/// Invite l'utilisateur à activer le GPS ou autoriser la localisation.
class GpsEnablePrompt {
  GpsEnablePrompt._();

  static Future<GpsReadiness> assess() async {
    if (!await Geolocator.isLocationServiceEnabled()) {
      return GpsReadiness.serviceDisabled;
    }
    final permission = await Geolocator.checkPermission();
    return switch (permission) {
      LocationPermission.always || LocationPermission.whileInUse => GpsReadiness.ready,
      LocationPermission.denied => GpsReadiness.permissionDenied,
      LocationPermission.deniedForever => GpsReadiness.permissionDeniedForever,
      LocationPermission.unableToDetermine => GpsReadiness.permissionDenied,
    };
  }

  /// Affiche un dialogue si le GPS ou la permission n'est pas prêt.
  static Future<void> promptIfNeeded(BuildContext context) async {
    final readiness = await assess();
    if (readiness == GpsReadiness.ready || !context.mounted) return;
    await showDialog<void>(
      context: context,
      barrierDismissible: readiness != GpsReadiness.serviceDisabled,
      builder: (ctx) => _GpsDialog(readiness: readiness),
    );
  }
}

class _GpsDialog extends StatelessWidget {
  const _GpsDialog({required this.readiness});

  final GpsReadiness readiness;

  String get _title => switch (readiness) {
        GpsReadiness.serviceDisabled => 'Activez le GPS',
        GpsReadiness.permissionDenied => 'Autorisez la localisation',
        GpsReadiness.permissionDeniedForever => 'Localisation bloquée',
        GpsReadiness.ready => '',
      };

  String get _message => switch (readiness) {
        GpsReadiness.serviceDisabled =>
          'MOVA a besoin du GPS pour localiser les courses, les livraisons et votre position sur la carte. '
          'Activez la localisation dans les paramètres de votre téléphone.',
        GpsReadiness.permissionDenied =>
          'Autorisez MOVA à accéder à votre position pour proposer des adresses précises, '
          'estimer les prix et suivre les courses en temps réel.',
        GpsReadiness.permissionDeniedForever =>
          'L\'accès à la position a été refusé définitivement. '
          'Ouvrez les paramètres de l\'application et autorisez la localisation pour utiliser MOVA.',
        GpsReadiness.ready => '',
      };

  Future<void> _primaryAction(BuildContext context) async {
    switch (readiness) {
      case GpsReadiness.serviceDisabled:
        await Geolocator.openLocationSettings();
      case GpsReadiness.permissionDenied:
        final result = await Geolocator.requestPermission();
        if (result == LocationPermission.deniedForever && context.mounted) {
          await Geolocator.openAppSettings();
        }
      case GpsReadiness.permissionDeniedForever:
        await Geolocator.openAppSettings();
      case GpsReadiness.ready:
        break;
    }
    if (context.mounted) Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      icon: const Icon(Icons.location_off_outlined, color: MovaColors.violet, size: 32),
      title: Text(_title),
      content: Text(_message),
      actions: [
        if (readiness != GpsReadiness.serviceDisabled)
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Plus tard'),
          ),
        TextButton(
          onPressed: () => _primaryAction(context),
          child: Text(
            readiness == GpsReadiness.serviceDisabled
                ? 'Ouvrir les paramètres'
                : 'Autoriser',
          ),
        ),
      ],
    );
  }
}

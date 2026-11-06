import 'package:flutter/material.dart';

/// Clé Navigator globale — partagée (SOS, appels, overlays).
final movaNavigatorKey = GlobalKey<NavigatorState>();

/// Home screen of the running app (set by each launcher), used to restart the UI
/// after a language change. Kept here so shared screens never reference the other
/// flavor's screens: the passenger build must not contain driver UI.
Widget Function()? movaAppHomeBuilder;

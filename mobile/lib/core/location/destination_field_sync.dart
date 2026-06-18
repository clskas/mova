import 'package:flutter/material.dart';

/// Met à jour un champ destination sans déclencher le listener (évite de réinitialiser le pin carte).
class DestinationFieldSync {
  DestinationFieldSync._();

  static void setText(
    TextEditingController controller,
    VoidCallback listener,
    String text,
  ) {
    controller.removeListener(listener);
    controller.text = text;
    controller.addListener(listener);
  }
}

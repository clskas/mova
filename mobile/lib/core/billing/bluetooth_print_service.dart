import 'dart:convert';
import 'dart:typed_data';

import 'package:blue_thermal_printer/blue_thermal_printer.dart';
import 'package:flutter/material.dart';

class BluetoothPrintService {
  BluetoothPrintService._();
  static final BluetoothPrintService instance = BluetoothPrintService._();

  final BlueThermalPrinter _printer = BlueThermalPrinter.instance;

  Future<List<BluetoothDevice>> bondedDevices() async {
    try {
      return await _printer.getBondedDevices() ?? [];
    } catch (_) {
      return [];
    }
  }

  Future<bool> isConnected() async {
    try {
      return await _printer.isConnected ?? false;
    } catch (_) {
      return false;
    }
  }

  Future<void> printEscPosBytes(Uint8List bytes, {BluetoothDevice? device}) async {
    if (device != null) {
      await _printer.connect(device);
    } else if (!await isConnected()) {
      throw StateError('Aucune imprimante Bluetooth connectée.');
    }
    await _printer.writeBytes(bytes);
  }

  Future<void> printEscPosBase64(String escPosBase64, BuildContext context) async {
    final bytes = base64Decode(escPosBase64);
    final devices = await bondedDevices();
    if (!context.mounted) return;

    if (devices.isEmpty) {
      throw StateError('Aucune imprimante Bluetooth appairée. Appairez votre imprimante dans les réglages Android.');
    }

    BluetoothDevice? selected = devices.length == 1 ? devices.first : await showDialog<BluetoothDevice>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Imprimante Bluetooth'),
        content: SizedBox(
          width: double.maxFinite,
          child: ListView(
            shrinkWrap: true,
            children: devices
                .map(
                  (d) => ListTile(
                    title: Text(d.name ?? 'Imprimante'),
                    subtitle: Text(d.address ?? ''),
                    onTap: () => Navigator.pop(ctx, d),
                  ),
                )
                .toList(),
          ),
        ),
        actions: [TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Annuler'))],
      ),
    );

    if (selected == null) return;
    await printEscPosBytes(bytes, device: selected);
  }
}

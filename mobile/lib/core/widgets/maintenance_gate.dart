import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_client.dart';
import '../config/app_version.dart';
import '../error/result.dart';
import '../theme/mova_colors.dart';

/// Écran plein page quand l’app est en maintenance (message admin FR).
class MaintenanceGate extends ConsumerStatefulWidget {
  const MaintenanceGate({super.key, required this.child});

  final Widget child;

  @override
  ConsumerState<MaintenanceGate> createState() => _MaintenanceGateState();
}

class _MaintenanceGateState extends ConsumerState<MaintenanceGate> {
  String? _message;
  bool _checked = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final api = ref.read(apiClientProvider);
    final result = await api.get('/public/client-config');
    if (!mounted) return;
    switch (result) {
      case Success(:final data):
        final root = data is Map ? Map<String, dynamic>.from(data as Map) : <String, dynamic>{};
        final maintenance = root['maintenance'];
        if (maintenance is Map) {
          final apps = maintenance['apps'];
          final appKey = AppFlavor.isDriver ? 'senga_driver' : 'senga';
          final active = apps is Map && apps[appKey] == true;
          final msg = maintenance['messageFr']?.toString().trim();
          setState(() {
            _message = active
                ? (msg != null && msg.isNotEmpty
                    ? msg
                    : 'SENGA est actuellement en maintenance. Merci pour votre patience.')
                : null;
            _checked = true;
          });
          return;
        }
      case Failure():
        break;
    }
    if (mounted) setState(() => _checked = true);
  }

  @override
  Widget build(BuildContext context) {
    if (!_checked) return widget.child;
    final message = _message;
    if (message == null) return widget.child;
    return Scaffold(
      backgroundColor: MovaColors.cloud,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  'Maintenance',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 1.2,
                    color: MovaColors.violet,
                  ),
                ),
                const SizedBox(height: 12),
                const Text(
                  'SENGA',
                  style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 16),
                Text(
                  message,
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 15, height: 1.45, color: MovaColors.textSecondary),
                ),
                const SizedBox(height: 24),
                TextButton(onPressed: _load, child: const Text('Réessayer')),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

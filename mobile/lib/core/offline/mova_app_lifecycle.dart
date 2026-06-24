import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_client.dart';
import '../location/service_area_gps.dart';
import 'connectivity_service.dart';

/// Réessaie la passerelle et la ville GPS à chaque reprise de l'app (évite « Serveur indisponible » fantôme).
mixin MovaAppLifecycleMixin<T extends ConsumerStatefulWidget>
    on ConsumerState<T>, WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _onMovaAppResumed();
    }
  }

  void _onMovaAppResumed() {
    final connectivity = ref.read(connectivityServiceProvider);
    connectivity.prepareReconnect();
    ref.read(apiClientProvider).checkHealth(resetFailures: true);
    ServiceAreaGps.sync(ref);
  }
}

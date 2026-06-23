import 'dart:async';

import 'package:mova/core/config/test_runtime_config.dart';

Future<void> testExecutable(FutureOr<void> Function() testMain) async {
  movaMapTilesEnabled = false;
  movaDisableAutoGps = true;
  movaSkipMatchingAutoTracking = true;
  await testMain();
}

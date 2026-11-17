import 'package:flutter/material.dart';

import 'app_update_service.dart';

/// Installed version, e.g. « v1.0.79 (395) », shown at the bottom of the help screens so a
/// user or a tester can tell support which version they run.
class AppVersionLabel extends StatelessWidget {
  const AppVersionLabel({super.key});

  static Future<String> load() async {
    final name = await AppUpdateService.resolveLocalVersion();
    final build = await AppUpdateService.resolveLocalBuild();
    return build > 0 ? 'v$name ($build)' : 'v$name';
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<String>(
      future: load(),
      builder: (context, snap) => Padding(
        padding: const EdgeInsets.only(top: 12, bottom: 8),
        child: Center(
          child: Text(
            snap.data ?? '',
            style: TextStyle(fontSize: 12, color: Theme.of(context).hintColor),
          ),
        ),
      ),
    );
  }
}

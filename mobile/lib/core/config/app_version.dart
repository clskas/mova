/// Version client — doit suivre `pubspec.yaml` / Play (`--build-name`).
/// Le versionCode Play est `pubspec` / CI (`--build-number` + `--dart-define=APP_BUILD`).
/// defaultValue must match pubspec `+N` so a missing dart-define cannot leave
/// the in-app update banner stuck after a Play install.
class AppVersion {
  static const name = '1.0.12';
  static const build = int.fromEnvironment('APP_BUILD', defaultValue: 96);

  static int compare(String a, String b) {
    List<int> parts(String raw) => raw
        .split('+')
        .first
        .split('.')
        .map((p) => int.tryParse(p.trim()) ?? 0)
        .toList();
    final left = parts(a);
    final right = parts(b);
    final len = left.length > right.length ? left.length : right.length;
    for (var i = 0; i < len; i++) {
      final l = i < left.length ? left[i] : 0;
      final r = i < right.length ? right[i] : 0;
      if (l != r) return l.compareTo(r);
    }
    return 0;
  }
}

enum MovaAppFlavor { passenger, driver }

class AppFlavor {
  static MovaAppFlavor current = MovaAppFlavor.passenger;
  static bool get isDriver => current == MovaAppFlavor.driver;
}

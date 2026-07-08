import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Incrémenté après annulation / clôture d'une livraison ou course active.
final activeShipmentsRefreshTickProvider = StateProvider<int>((ref) => 0);

void refreshActiveShipmentsHome(WidgetRef ref) {
  ref.read(activeShipmentsRefreshTickProvider.notifier).state++;
}

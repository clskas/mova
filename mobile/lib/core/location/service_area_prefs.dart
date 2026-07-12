import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'service_areas.dart';

const _prefKey = 'mova_service_area_id';

class ServiceAreaPrefs {
  ServiceAreaPrefs(this._prefs);

  final SharedPreferences _prefs;

  String? get selectedAreaId => _prefs.getString(_prefKey);

  ServiceArea get selectedArea =>
      (selectedAreaId != null ? ServiceAreas.byId(selectedAreaId!) : null) ??
      ServiceAreas.byId('kinshasa') ??
      ServiceAreas.fallbackArea;

  Future<void> setSelectedAreaId(String areaId) async {
    await _prefs.setString(_prefKey, areaId);
  }
}

final serviceAreaPrefsProvider = FutureProvider<ServiceAreaPrefs>((ref) async {
  final prefs = await SharedPreferences.getInstance();
  return ServiceAreaPrefs(prefs);
});

final selectedServiceAreaProvider = Provider<ServiceArea>((ref) {
  final prefsAsync = ref.watch(serviceAreaPrefsProvider);
  return prefsAsync.maybeWhen(
    data: (prefs) => prefs.selectedArea,
    orElse: () => ServiceAreas.byId('kinshasa') ?? ServiceAreas.fallbackArea,
  );
});

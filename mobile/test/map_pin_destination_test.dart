import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';
import 'package:mova/core/location/saved_places_store.dart';
import 'package:mova/core/theme/mova_theme.dart';
import 'package:mova/core/widgets/map_pin_confirm_bar.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  test('pin destination accepted without POI name', () {
    expect(
      MapPinConfirmBar.isPinDestinationAccepted(lat: -4.32170, lng: 15.31250),
      isTrue,
    );
    expect(
      MapPinConfirmBar.isPinDestinationAccepted(lat: -4.32170, lng: 15.31250, name: null),
      isTrue,
    );
    expect(
      MapPinConfirmBar.isPinDestinationAccepted(lat: 99, lng: 15.31),
      isFalse,
    );
    expect(MapPinConfirmBar.coordsLabel(const LatLng(-4.32170, 15.31250)), '-4.32170, 15.31250');
  });

  testWidgets('shows Utiliser cet emplacement for a dropped pin', (tester) async {
    var used = false;
    await tester.pumpWidget(
      MaterialApp(
        theme: buildMovaTheme(),
        home: Scaffold(
          body: MapPinConfirmBar(
            coords: const LatLng(-4.3217, 15.3125),
            onUseLocation: () => used = true,
            onNamePlace: () {},
          ),
        ),
      ),
    );

    expect(find.text('Utiliser cet emplacement'), findsOneWidget);
    expect(find.text('Nommer ce lieu'), findsOneWidget);
    await tester.tap(find.text('Utiliser cet emplacement'));
    expect(used, isTrue);
  });

  test('user POI ranks above Mapbox in local autocomplete', () {
    final ranked = SavedPlacesStore.rankUserCatalogFirst([
      {
        'label': 'Hôpital Général, Kinshasa',
        'source': 'mapbox',
      },
      {
        'label': 'Chez Mama X, Kinshasa',
        'source': 'poi',
        'catalogSource': 'USER',
      },
    ]);
    expect(ranked.first['catalogSource'], 'USER');
    expect(ranked.first['label'], contains('Chez Mama X'));
    expect(ranked.last['source'], 'mapbox');
  });

  test('named informal place matches autocomplete query', () {
    final hits = SavedPlacesStore.autocomplete('mama', [
      const SavedPlace(
        id: 'n1',
        name: 'Chez Mama X',
        kind: 'named',
        lat: -4.32,
        lng: 15.31,
      ),
      const SavedPlace(
        id: 'h1',
        name: 'Hôpital Général',
        kind: 'named',
        lat: -4.34,
        lng: 15.30,
      ),
    ]);
    expect(hits, isNotEmpty);
    expect(hits.first['catalogSource'], 'USER');
    expect(hits.first['label'], 'Chez Mama X');
  });
}

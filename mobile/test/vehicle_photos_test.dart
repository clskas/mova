import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mova/core/config/client_apps_config.dart';
import 'package:mova/core/widgets/vehicle_photo_gallery.dart';

void main() {
  test('reads the photo list, or falls back to the single imageUrl', () {
    expect(vehiclePhotosFrom({'photoUrls': ['a', 'b', 'a', ''], 'imageUrl': 'a'}), ['a', 'b']);
    expect(vehiclePhotosFrom({'photoUrls': [], 'imageUrl': 'solo'}), ['solo']);
    expect(vehiclePhotosFrom({'imageUrl': ''}), isEmpty);
    expect(vehiclePhotosFrom(null), isEmpty);
    expect(vehiclePhotosFrom({'photoUrls': ['1', '2', '3', '4', '5', '6']}).length, kMaxVehiclePhotos);
  });

  testWidgets('gallery shows a counter when there are several photos', (tester) async {
    await tester.pumpWidget(const MaterialApp(
      home: Scaffold(body: VehiclePhotoGallery(photos: ['https://x/1.jpg', 'https://x/2.jpg', 'https://x/3.jpg'])),
    ));
    expect(find.byKey(const Key('vehiclePhotoGallery')), findsOneWidget);
    expect(find.text('1/3'), findsOneWidget);
  });

  testWidgets('gallery shows a placeholder without photos', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: Scaffold(body: VehiclePhotoGallery(photos: []))));
    expect(find.byIcon(Icons.directions_car), findsOneWidget);
  });
}

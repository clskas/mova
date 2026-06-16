import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mova/core/api/api_client.dart';
import 'package:mova/core/theme/mova_theme.dart';
import 'package:mova/features/delivery/delivery_hub_screen.dart';
import 'package:mova/features/delivery/express_delivery_screen.dart';
import 'package:mova/features/delivery/food_delivery_screen.dart';
import 'package:mova/features/delivery/food_tracking_screen.dart';
import 'package:mova/features/delivery/parcel_delivery_screen.dart';
import 'package:mova/features/delivery/parcel_tracking_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';

Widget _testApp(Widget home) => ProviderScope(
      overrides: [apiClientProvider.overrideWith((ref) => ApiClient.mock())],
      child: MaterialApp(
        theme: buildMovaTheme(),
        home: movaMediaQueryWrapper(child: home),
      ),
    );

void main() {
  final widths = [320.0, 360.0, 375.0, 390.0, 428.0];

  setUp(() {
    TestWidgetsFlutterBinding.ensureInitialized();
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets('Delivery screens render without overflow', (tester) async {
    for (final width in widths) {
      tester.view.physicalSize = Size(width, 900);
      tester.view.devicePixelRatio = 1.0;

      for (final screen in [
        const DeliveryHubScreen(),
        const FoodDeliveryScreen(),
        const ParcelDeliveryScreen(),
        const ExpressDeliveryScreen(),
        const FoodTrackingScreen(
          orderId: 'food-12345678',
          restaurantName: 'Chez Mamou Restaurant Très Long Nom',
          totalCdf: 25000,
          deliveryAddress: '123 Avenue de la Liberation, Kinshasa Gombe',
        ),
        const ParcelTrackingScreen(parcelId: 'parcel-12345678'),
      ]) {
        await tester.pumpWidget(_testApp(screen));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 800));
        expect(
          tester.takeException(),
          isNull,
          reason: '${screen.runtimeType} overflow at ${width.toInt()}px',
        );
      }
    }
  });

  testWidgets('FoodDeliveryScreen menu state renders without overflow', (tester) async {
    for (final width in widths) {
      tester.view.physicalSize = Size(width, 900);
      tester.view.devicePixelRatio = 1.0;

      await tester.pumpWidget(_testApp(const FoodDeliveryScreen()));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 800));

      await tester.tap(find.text('Chez Mamou'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));

      await tester.tap(find.byIcon(Icons.add_circle_outline).first);
      await tester.pump();

      expect(
        tester.takeException(),
        isNull,
        reason: 'FoodDeliveryScreen menu overflow at ${width.toInt()}px',
      );
    }
  });
}

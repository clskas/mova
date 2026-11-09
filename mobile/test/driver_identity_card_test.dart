import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mova/core/api/api_client.dart';
import 'package:mova/features/booking/widgets/driver_identity_card.dart';
import 'package:shared_preferences/shared_preferences.dart';

Widget _wrap(Map<String, dynamic> driver, {double width = 360}) => ProviderScope(
      overrides: [apiClientProvider.overrideWith((ref) => ApiClient.mock())],
      child: MaterialApp(
        home: Scaffold(
          body: Center(
            child: SizedBox(width: width, child: DriverIdentityCard(driver: driver)),
          ),
        ),
      ),
    );

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('shows the plate, the model and the colour', (tester) async {
    await tester.pumpWidget(_wrap({
      'name': 'Jean Mbuyi',
      'rating': 4.8,
      'totalRides': 120,
      'plateNumber': 'kin-4521',
      'vehicleModel': 'Toyota Corolla',
      'vehicleColor': 'Grise',
      'vehicleType': 'STANDARD',
    }));
    await tester.pump();
    expect(find.text('KIN-4521'), findsOneWidget);
    expect(find.text('Toyota Corolla · Grise'), findsOneWidget);
    expect(find.text('4.8'), findsOneWidget);
    expect(find.text('J'), findsOneWidget); // no photo: initial
  });

  testWidgets('falls back to the vehicle type and fits a small phone', (tester) async {
    await tester.pumpWidget(_wrap({
      'name': 'Aline',
      'plateNumber': 'AB-12-CD',
      'vehicleType': 'TRICYCLE',
      'vehiclePhotoUrl': 'https://example.com/v.jpg',
    }, width: 280));
    await tester.pump();
    expect(find.text('Tricycle'), findsOneWidget);
    expect(find.byKey(const Key('driverVehiclePhoto')), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}

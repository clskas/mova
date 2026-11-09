import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mova/features/driver/widgets/passenger_rating_badge.dart';

Widget _wrap(Widget child) => MaterialApp(home: Scaffold(body: Center(child: SizedBox(width: 260, child: child))));

void main() {
  testWidgets('shows the passenger note and the number of ratings', (tester) async {
    await tester.pumpWidget(_wrap(const PassengerRatingBadge(rating: 4.7, count: 12, name: 'Marie')));
    expect(find.text('Marie'), findsOneWidget);
    expect(find.text('4.7 · 12 notes'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a passenger never rated is « Nouveau passager »', (tester) async {
    await tester.pumpWidget(_wrap(const PassengerRatingBadge(rating: null, count: 0)));
    expect(find.text('Nouveau passager'), findsOneWidget);
  });

  test('reads the API fields', () {
    expect(PassengerRatingBadge.ratingFrom({'passengerRating': 3}), 3.0);
    expect(PassengerRatingBadge.countFrom({'passengerRatingCount': 2}), 2);
    expect(PassengerRatingBadge.countFrom(null), 0);
  });
}

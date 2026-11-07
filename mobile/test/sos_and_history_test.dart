import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mova/core/i18n/i18n.dart';
import 'package:mova/core/safety/sos_helper.dart';
import 'package:mova/features/history/history_format.dart';

void main() {
  tearDown(() => appLanguage.value = 'fr');

  group('history dates', () {
    test('local date and time, year only when not this year', () {
      final now = DateTime.now();
      final thisYear = DateTime(now.year, 3, 7, 14, 32).toUtc().toIso8601String();
      expect(formatHistoryDate(thisYear), '07/03 · 14:32');
      final older = DateTime(2024, 12, 1, 9, 5).toUtc().toIso8601String();
      expect(formatHistoryDate(older), '01/12/2024 · 09:05');
      expect(formatHistoryDate(null), '');
    });

    test('planned date wins for bookings', () {
      final item = {
        'createdAt': DateTime(2026, 1, 1, 8).toUtc().toIso8601String(),
        'meta': {'scheduledAt': DateTime(2026, 1, 3, 18, 30).toUtc().toIso8601String()},
      };
      expect(historyDateLabel(item), startsWith('03/01'));
    });

    test('month key and translated label', () {
      final item = {'createdAt': DateTime(2026, 11, 7, 10).toUtc().toIso8601String()};
      expect(historyMonthKey(item), '2026-11');
      expect(historyMonthLabel('2026-11'), 'Novembre 2026');
      appLanguage.value = 'en';
      expect(historyMonthLabel('2026-11'), 'November 2026');
    });
  });

  group('SOS button', () {
    Future<(int, int)> pump(WidgetTester tester, Future<void> Function() gesture) async {
      var taps = 0;
      var holds = 0;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Center(child: SosHoldButton(onTap: () => taps++, onHold: () => holds++)),
          ),
        ),
      );
      await gesture();
      return (taps, holds);
    }

    testWidgets('a quick tap opens the confirmation path', (tester) async {
      late (int, int) r;
      r = await pump(tester, () async {
        await tester.tap(find.byType(SosHoldButton));
        await tester.pump();
      });
      expect(r, (1, 0));
    });

    testWidgets('holding 3 seconds sends without confirmation', (tester) async {
      var taps = 0;
      var holds = 0;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(body: Center(child: SosHoldButton(onTap: () => taps++, onHold: () => holds++))),
        ),
      );
      final gesture = await tester.startGesture(tester.getCenter(find.byType(SosHoldButton)));
      await tester.pump(const Duration(milliseconds: 3100));
      await gesture.up();
      await tester.pump();
      expect(holds, 1);
      expect(taps, 0);
    });

    testWidgets('releasing after 1 second does nothing (no accidental SOS)', (tester) async {
      var taps = 0;
      var holds = 0;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(body: Center(child: SosHoldButton(onTap: () => taps++, onHold: () => holds++))),
        ),
      );
      final gesture = await tester.startGesture(tester.getCenter(find.byType(SosHoldButton)));
      await tester.pump(const Duration(seconds: 1));
      await gesture.up();
      await tester.pump();
      expect((taps, holds), (0, 0));
    });
  });
}

import 'package:flutter_test/flutter_test.dart';
import 'package:mova/features/growth/automation_widgets.dart';

void main() {
  test('opérateurs en panne lisibles', () {
    expect(degradedOperatorsLabel(['MPESA', 'AIRTEL_MONEY']), 'M-Pesa, Airtel Money');
    expect(degradedOperatorsLabel(['X']), 'X');
  });
}

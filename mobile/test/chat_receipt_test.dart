import 'package:flutter_test/flutter_test.dart';
import 'package:mova/features/chat/chat_receipt.dart';

void main() {
  test('parseReceiptChatRef reads metadata line', () {
    const text = '''📄 Reçu SENGA SENGA-DEL-ABC
Livraison — 12 000 FC
[mova-receipt:DELIVERY:del-uuid-123]''';
    final ref = parseReceiptChatRef(text);
    expect(ref?.type, 'DELIVERY');
    expect(ref?.id, 'del-uuid-123');
  });

  test('parseReceiptChatRef falls back to chat context', () {
    const text = '📄 Reçu SENGA SENGA-RIDE-1\nCourse — 5 000 FC';
    final ref = parseReceiptChatRef(text, fallbackType: 'RIDE', fallbackId: 'ride-1');
    expect(ref?.type, 'RIDE');
    expect(ref?.id, 'ride-1');
  });

  test('receiptChatDisplayText hides metadata', () {
    const text = 'Hello\n[mova-receipt:DELIVERY:x]';
    expect(receiptChatDisplayText(text), 'Hello');
  });
}

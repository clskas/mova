import 'package:flutter_test/flutter_test.dart';
import 'package:mova/features/help/assistant_screen.dart';

void main() {
  test('sends the last messages with API roles', () {
    final msgs = List.generate(15, (i) => AssistantMessage(fromUser: i.isEven, text: 'm$i'));
    final api = assistantHistoryForApi(msgs);
    expect(api.length, 12);
    expect(api.first, {'role': 'assistant', 'content': 'm3'});
    expect(api.last, {'role': 'user', 'content': 'm14'});
  });
}

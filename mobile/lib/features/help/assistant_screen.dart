import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/config/app_version.dart';
import '../../core/error/result.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/i18n/i18n.dart';

/// One chat bubble.
class AssistantMessage {
  const AssistantMessage({required this.fromUser, required this.text});
  final bool fromUser;
  final String text;

  Map<String, String> toApi() => {'role': fromUser ? 'user' : 'assistant', 'content': text};
}

/// Last messages sent to the server (it keeps 12 at most anyway).
List<Map<String, String>> assistantHistoryForApi(List<AssistantMessage> messages, {int max = 12}) {
  final start = messages.length > max ? messages.length - max : 0;
  return messages.sublist(start).map((m) => m.toApi()).toList();
}

/// SENGA support assistant (IA): answers from the user manual, in the user's language.
class AssistantScreen extends ConsumerStatefulWidget {
  const AssistantScreen({super.key});

  @override
  ConsumerState<AssistantScreen> createState() => _AssistantScreenState();
}

class _AssistantScreenState extends ConsumerState<AssistantScreen> {
  final _input = TextEditingController();
  final _scroll = ScrollController();
  final List<AssistantMessage> _messages = [
    AssistantMessage(
      fromUser: false,
      text: tr('Bonjour ! Je suis l\'assistant SENGA. Posez votre question en français, lingala, swahili ou anglais.'),
    ),
  ];
  bool _sending = false;

  @override
  void dispose() {
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final text = _input.text.trim();
    if (text.isEmpty || _sending) return;
    setState(() {
      _messages.add(AssistantMessage(fromUser: true, text: text));
      _sending = true;
      _input.clear();
    });
    _scrollToEnd();
    final result = await ref.read(apiClientProvider).post('/assistant/chat', {
      'app': AppFlavor.isDriver ? 'driver' : 'passenger',
      // Skip the greeting: the conversation sent to the server starts with the user.
      'messages': assistantHistoryForApi(_messages.skip(1).toList()),
    });
    if (!mounted) return;
    final reply = switch (result) {
      Success(:final data) => data['reply']?.toString() ?? '',
      Failure() => '',
    };
    setState(() {
      _sending = false;
      _messages.add(AssistantMessage(
        fromUser: false,
        text: reply.isNotEmpty
            ? reply
            : 'L\'assistant est indisponible pour le moment. Utilisez « Contacter le support » dans l\'Aide.',
      ));
    });
    _scrollToEnd();
  }

  void _scrollToEnd() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.animateTo(
          _scroll.position.maxScrollExtent,
          duration: const Duration(milliseconds: 250),
          curve: Curves.easeOut,
        );
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return MovaScreen(
      title: tr('Assistant SENGA'),
      scrollable: false,
      padding: EdgeInsets.zero,
      child: Column(
        children: [
          Expanded(
            child: ListView.builder(
              key: const Key('assistantMessages'),
              controller: _scroll,
              padding: const EdgeInsets.all(16),
              itemCount: _messages.length + (_sending ? 1 : 0),
              itemBuilder: (context, i) {
                if (i == _messages.length) {
                  return Align(
                    alignment: Alignment.centerLeft,
                    child: Padding(
                      padding: EdgeInsets.symmetric(vertical: 8),
                      child: Text(tr('L\'assistant écrit…'), style: TextStyle(color: MovaColors.textSecondary)),
                    ),
                  );
                }
                final m = _messages[i];
                return Align(
                  alignment: m.fromUser ? Alignment.centerRight : Alignment.centerLeft,
                  child: Container(
                    margin: const EdgeInsets.symmetric(vertical: 4),
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.8),
                    decoration: BoxDecoration(
                      color: m.fromUser ? MovaColors.violet : MovaColors.violet.withValues(alpha: 0.08),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: SelectableText(
                      m.text,
                      style: TextStyle(color: m.fromUser ? Colors.white : null, height: 1.35),
                    ),
                  ),
                );
              },
            ),
          ),
          Padding(
            padding: EdgeInsets.symmetric(horizontal: 16),
            child: Text(
              tr('Réponses générées par IA à partir du manuel SENGA. Pour un litige ou un paiement, contactez le support.'),
              style: TextStyle(fontSize: 11, color: MovaColors.textSecondary),
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      key: const Key('assistantInput'),
                      controller: _input,
                      minLines: 1,
                      maxLines: 4,
                      maxLength: 2000,
                      textInputAction: TextInputAction.send,
                      onSubmitted: (_) => _send(),
                      decoration: InputDecoration(
                        hintText: tr('Votre question…'),
                        counterText: '',
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton.filled(
                    key: const Key('assistantSend'),
                    onPressed: _sending ? null : _send,
                    icon: const Icon(Icons.send),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

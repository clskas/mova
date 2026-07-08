import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_client.dart';
import '../../core/error/result.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import 'chat_receipt.dart';
import 'ride_chat_screen.dart';

class ErrandChatScreen extends ConsumerStatefulWidget {
  const ErrandChatScreen({
    super.key,
    required this.errandId,
    required this.myRole,
    this.peerLabel = 'Livreur',
  });

  final String errandId;
  final String myRole;
  final String peerLabel;

  @override
  ConsumerState<ErrandChatScreen> createState() => _ErrandChatScreenState();
}

class _ErrandChatScreenState extends ConsumerState<ErrandChatScreen> {
  final _controller = TextEditingController();
  final _scrollController = ScrollController();
  final _messages = <RideChatMessage>[];
  bool _loading = true;
  bool _sending = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _controller.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final api = ref.read(apiClientProvider);
    final result = await api.getErrandChatMessages(widget.errandId);
    if (!mounted) return;
    setState(() {
      _loading = false;
      if (result case Success(:final data)) {
        _messages
          ..clear()
          ..addAll(
            data.map((m) {
              final role = m['senderRole']?.toString() ?? '';
              return RideChatMessage(
                id: m['id']?.toString() ?? '${m['ts']}',
                text: m['text']?.toString() ?? '',
                senderRole: role,
                ts: DateTime.fromMillisecondsSinceEpoch((m['ts'] as num?)?.toInt() ?? 0),
                isMine: role == widget.myRole,
              );
            }),
          );
      }
    });
  }

  Future<void> _send() async {
    final text = _controller.text.trim();
    if (text.isEmpty || _sending) return;
    setState(() => _sending = true);
    final api = ref.read(apiClientProvider);
    final result = await api.sendErrandChatMessage(widget.errandId, text);
    if (!mounted) return;
    setState(() => _sending = false);
    switch (result) {
      case Success(:final data):
        _controller.clear();
        setState(() {
          _messages.add(
            RideChatMessage(
              id: data['id']?.toString() ?? DateTime.now().millisecondsSinceEpoch.toString(),
              text: data['text']?.toString() ?? text,
              senderRole: widget.myRole,
              ts: DateTime.now(),
              isMine: true,
            ),
          );
        });
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (_scrollController.hasClients) {
            _scrollController.animateTo(
              _scrollController.position.maxScrollExtent,
              duration: const Duration(milliseconds: 200),
              curve: Curves.easeOut,
            );
          }
        });
      case Failure():
        break;
    }
  }

  @override
  Widget build(BuildContext context) {
    return MovaScreen(
      title: 'Chat · ${widget.peerLabel}',
      scrollable: false,
      child: Column(
        children: [
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator(color: MovaColors.violet))
                : ListView.builder(
                    controller: _scrollController,
                    padding: const EdgeInsets.all(12),
                    itemCount: _messages.length,
                    itemBuilder: (context, i) {
                      final m = _messages[i];
                      return buildChatMessageBubble(
                        context: context,
                        text: m.text,
                        isMine: m.isMine,
                        fallbackReceiptType: 'ERRAND',
                        fallbackReceiptId: widget.errandId,
                      );
                    },
                  ),
          ),
          Padding(
            padding: const EdgeInsets.all(8),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _controller,
                    decoration: const InputDecoration(
                      hintText: 'Votre message…',
                      isDense: true,
                    ),
                    onSubmitted: (_) => _send(),
                  ),
                ),
                IconButton(
                  icon: _sending
                      ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.send, color: MovaColors.violet),
                  onPressed: _sending ? null : _send,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

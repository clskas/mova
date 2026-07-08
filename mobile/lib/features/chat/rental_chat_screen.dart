import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/error/result.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import 'chat_receipt.dart';
import 'ride_chat_screen.dart';

class RentalChatScreen extends ConsumerStatefulWidget {
  const RentalChatScreen({
    super.key,
    required this.inquiryId,
    required this.myRole,
    this.peerLabel = 'Loueur',
  });

  final String inquiryId;
  final String myRole;
  final String peerLabel;

  @override
  ConsumerState<RentalChatScreen> createState() => _RentalChatScreenState();
}

class _RentalChatScreenState extends ConsumerState<RentalChatScreen> {
  final _controller = TextEditingController();
  final _scrollController = ScrollController();
  final _messages = <RideChatMessage>[];
  Timer? _pollTimer;
  bool _loading = true;
  bool _sending = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
    _pollTimer = Timer.periodic(const Duration(seconds: 4), (_) => _load());
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _controller.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final api = ref.read(apiClientProvider);
    final result = await api.getRentalChatMessages(widget.inquiryId);
    if (!mounted) return;
    if (result case Failure(:final error)) {
      setState(() {
        _loading = false;
        _error = error.message;
      });
      return;
    }
    if (result case Success(:final data)) {
      setState(() {
        _loading = false;
        _error = null;
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
      });
    }
  }

  Future<void> _send() async {
    final text = _controller.text.trim();
    if (text.isEmpty || _sending) return;
    setState(() => _sending = true);
    final api = ref.read(apiClientProvider);
    final result = await api.sendRentalChatMessage(widget.inquiryId, text);
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
      case Failure(:final error):
        setState(() => _error = error.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    return MovaScreen(
      title: 'Chat · ${widget.peerLabel}',
      scrollable: false,
      child: Column(
        children: [
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text(_error!, style: const TextStyle(color: Colors.red, fontSize: 12)),
            ),
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
                        fallbackReceiptType: 'RENTAL',
                        fallbackReceiptId: widget.inquiryId,
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
                    decoration: const InputDecoration(hintText: 'Votre message…', isDense: true),
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

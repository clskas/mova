import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/config/market_config.dart';
import '../../core/api/api_client.dart';
import '../../core/api/ride_chat_socket.dart';
import '../../core/error/result.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';

class RideChatMessage {
  RideChatMessage({
    required this.text,
    required this.senderRole,
    required this.ts,
    this.isMine = false,
  });

  final String text;
  final String senderRole;
  final DateTime ts;
  final bool isMine;
}

class RideChatScreen extends ConsumerStatefulWidget {
  const RideChatScreen({
    super.key,
    required this.rideId,
    required this.myRole,
    this.peerLabel = 'Contact',
  });

  final String rideId;
  /// `passenger` ou `driver`
  final String myRole;
  final String peerLabel;

  @override
  ConsumerState<RideChatScreen> createState() => _RideChatScreenState();
}

class _RideChatScreenState extends ConsumerState<RideChatScreen> {
  final _controller = TextEditingController();
  final _scrollController = ScrollController();
  final _messages = <RideChatMessage>[];
  RideChatSocket? _socket;
  bool _sending = false;
  bool _connecting = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  @override
  void dispose() {
    _socket?.clearHandlers();
    _controller.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _bootstrap() async {
    await _loadHistory();
    await _connectSocket();
  }

  Future<void> _loadHistory() async {
    final api = ref.read(apiClientProvider);
    final result = await api.getRideChatMessages(widget.rideId);
    if (!mounted) return;
    if (result case Success(:final data)) {
      setState(() {
        for (final raw in data) {
          _appendMessage(raw, fromHistory: true);
        }
      });
      _scrollToBottom();
    }
  }

  void _appendMessage(Map<String, dynamic> payload, {bool fromHistory = false}) {
    final role = payload['senderRole']?.toString() ?? 'unknown';
    final text = payload['text']?.toString() ?? '';
    if (text.isEmpty) return;
    final tsRaw = payload['ts'];
    final ts = tsRaw is num
        ? DateTime.fromMillisecondsSinceEpoch(tsRaw.toInt())
        : DateTime.now();
    final mine = role == widget.myRole;
    if (_messages.any((m) => m.text == text && m.senderRole == role && m.ts == ts)) return;
    if (!fromHistory && mine && _messages.any((m) => m.isMine && m.text == text)) return;
    _messages.add(RideChatMessage(text: text, senderRole: role, ts: ts, isMine: mine));
  }

  Future<void> _connectSocket({bool forceReconnect = false}) async {
    final api = ref.read(apiClientProvider);
    if (api.isMockMode) {
      if (mounted) setState(() => _connecting = false);
      return;
    }
    final token = await api.authToken();
    if (!mounted) return;
    setState(() {
      _connecting = true;
      _error = null;
    });
    final socket = ref.read(rideChatSocketProvider);
    _socket = socket;
    if (forceReconnect) socket.resetFailure();
    socket.connect(
      rideId: widget.rideId,
      token: token,
      forceReconnect: forceReconnect,
      onChat: _onIncomingChat,
      onConnected: () {
        if (mounted) {
          setState(() {
            _error = null;
            _connecting = false;
          });
        }
      },
      onDisconnected: () {
        if (mounted && socket.connectionFailed) {
          setState(() {
            _connecting = false;
            _error = 'Connexion chat indisponible (${MarketConfig.wsUrl}).';
          });
        }
      },
    );
    final ok = await socket.ensureConnected();
    if (!mounted) return;
    setState(() {
      _connecting = false;
      if (!ok && !api.isMockMode) {
        _error = 'Connexion temps réel limitée — les messages passent par le serveur.';
      }
    });
  }

  void _onIncomingChat(Map<String, dynamic> payload) {
    if (payload['rideId']?.toString() != widget.rideId) return;
    if (!mounted) return;
    setState(() => _appendMessage(payload));
    _scrollToBottom();
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scrollController.hasClients) return;
      _scrollController.animateTo(
        _scrollController.position.maxScrollExtent,
        duration: const Duration(milliseconds: 200),
        curve: Curves.easeOut,
      );
    });
  }

  Future<void> _send() async {
    final text = _controller.text.trim();
    if (text.isEmpty || _sending) return;
    setState(() {
      _sending = true;
      _error = null;
    });
    final api = ref.read(apiClientProvider);
    final result = await api.sendRideChatMessage(widget.rideId, text);
    if (!mounted) return;
    switch (result) {
      case Success(:final data):
        setState(() {
          _appendMessage(data);
          _controller.clear();
          _sending = false;
        });
        _socket?.subscribe(widget.rideId);
        _scrollToBottom();
      case Failure(:final error):
        setState(() {
          _sending = false;
          _error = error.message;
        });
    }
  }

  @override
  Widget build(BuildContext context) {
    return MovaScreen(
      title: 'Chat — ${widget.peerLabel}',
      child: Column(
        children: [
          if (_error != null) ...[
            MovaErrorBanner(
              message: _error!,
              onRetry: _connecting ? null : () => _connectSocket(forceReconnect: true),
            ),
            const SizedBox(height: 8),
          ],
          if (_connecting)
            const Padding(
              padding: EdgeInsets.all(8),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2, color: MovaColors.violet),
                  ),
                  SizedBox(width: 8),
                  Text('Connexion au chat…', style: TextStyle(color: MovaColors.textSecondary)),
                ],
              ),
            ),
          Expanded(
            child: _messages.isEmpty
                ? const Center(
                    child: Text(
                      'Échangez avec votre chauffeur ou passager pendant la course.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: MovaColors.textSecondary),
                    ),
                  )
                : ListView.builder(
                    controller: _scrollController,
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    itemCount: _messages.length,
                    itemBuilder: (context, index) {
                      final m = _messages[index];
                      return Align(
                        alignment: m.isMine ? Alignment.centerRight : Alignment.centerLeft,
                        child: Container(
                          margin: const EdgeInsets.symmetric(vertical: 4, horizontal: 4),
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                          constraints: BoxConstraints(
                            maxWidth: MediaQuery.sizeOf(context).width * 0.78,
                          ),
                          decoration: BoxDecoration(
                            color: m.isMine
                                ? MovaColors.violet.withValues(alpha: 0.15)
                                : MovaColors.cloud,
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(
                              color: m.isMine
                                  ? MovaColors.violet.withValues(alpha: 0.3)
                                  : MovaColors.textSecondary.withValues(alpha: 0.25),
                            ),
                          ),
                          child: Text(m.text),
                        ),
                      );
                    },
                  ),
          ),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _controller,
                  decoration: const InputDecoration(
                    hintText: 'Votre message…',
                    isDense: true,
                  ),
                  textInputAction: TextInputAction.send,
                  onSubmitted: (_) => _send(),
                  enabled: !_connecting,
                ),
              ),
              const SizedBox(width: 8),
              IconButton(
                icon: _sending
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.send, color: MovaColors.violet),
                onPressed: (_sending || _connecting) ? null : _send,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

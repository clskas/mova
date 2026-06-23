import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/config/market_config.dart';
import '../../core/api/api_client.dart';
import '../../core/api/ride_socket.dart';
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
  RideSocket? _socket;
  String? _userId;
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
    _controller.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _bootstrap() async {
    final api = ref.read(apiClientProvider);
    final profile = widget.myRole == 'driver'
        ? await api.getDriverProfile()
        : await api.get('/users/me');
    if (profile case Success(:final data)) {
      _userId = (data['userId'] ?? data['id'])?.toString();
    }
    await _connectSocket();
  }

  Future<void> _connectSocket() async {
    final api = ref.read(apiClientProvider);
    final token = await api.authToken();
    if (!mounted) return;
    setState(() {
      _connecting = true;
      _error = null;
    });
    final socket = ref.read(rideSocketProvider);
    _socket = socket;
    socket.connect(
      rideId: widget.rideId,
      token: token,
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
      if (!ok) {
        _error = 'Connexion chat indisponible (${MarketConfig.wsUrl}).';
      }
    });
  }

  void _onIncomingChat(Map<String, dynamic> payload) {
    if (payload['rideId']?.toString() != widget.rideId) return;
    final role = payload['senderRole']?.toString() ?? 'unknown';
    final text = payload['text']?.toString() ?? '';
    if (text.isEmpty) return;
    final tsRaw = payload['ts'];
    final ts = tsRaw is num
        ? DateTime.fromMillisecondsSinceEpoch(tsRaw.toInt())
        : DateTime.now();
    final mine = role == widget.myRole;
    if (mine && _messages.any((m) => m.isMine && m.text == text)) return;
    if (!mounted) return;
    setState(() {
      _messages.add(RideChatMessage(text: text, senderRole: role, ts: ts, isMine: mine));
    });
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
    final ts = DateTime.now();
    final payload = {
      'rideId': widget.rideId,
      'senderId': _userId ?? widget.myRole,
      'senderRole': widget.myRole,
      'text': text,
      'ts': ts.millisecondsSinceEpoch,
    };
    if (_socket == null || !_socket!.isConnected) {
      await _connectSocket();
      final ok = _socket != null && await _socket!.ensureConnected();
      if (!ok) {
        if (mounted) {
          setState(() {
            _sending = false;
            _error = 'Connexion chat indisponible. Vérifiez le réseau et réessayez.';
          });
        }
        return;
      }
    }
    _socket!.emitChat(payload);
    setState(() {
      _messages.add(RideChatMessage(
        text: text,
        senderRole: widget.myRole,
        ts: ts,
        isMine: true,
      ));
      _controller.clear();
      _sending = false;
    });
    _scrollToBottom();
  }

  @override
  Widget build(BuildContext context) {
    return MovaScreen(
      title: 'Chat — ${widget.peerLabel}',
      child: Column(
        children: [
          if (_error != null) ...[
            MovaErrorBanner(message: _error!),
            const SizedBox(height: 8),
            if (_connecting)
              const Center(child: Padding(
                padding: EdgeInsets.all(8),
                child: Text('Connexion au chat…', style: TextStyle(color: MovaColors.textSecondary)),
              )),
          ],
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
                onPressed: _sending ? null : _send,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

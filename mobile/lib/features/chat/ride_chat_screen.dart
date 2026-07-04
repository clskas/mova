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
    required this.id,
    required this.text,
    required this.senderRole,
    required this.ts,
    this.isMine = false,
  });

  final String id;
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
  final _knownIds = <String>{};
  RideChatSocket? _socket;
  Timer? _pollTimer;
  bool _sending = false;
  bool _loadingHistory = true;
  bool _socketLive = false;
  String? _error;
  String? _socketHint;

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _socket?.clearHandlers();
    _controller.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _bootstrap() async {
    await _loadHistory();
    if (!mounted) return;
    setState(() => _loadingHistory = false);
    unawaited(_connectSocket());
    _pollTimer?.cancel();
    _pollTimer = Timer.periodic(const Duration(seconds: 4), (_) => _loadHistory());
  }

  DateTime _parseTs(dynamic tsRaw) {
    if (tsRaw is num) return DateTime.fromMillisecondsSinceEpoch(tsRaw.toInt());
    if (tsRaw is String) {
      final parsed = int.tryParse(tsRaw);
      if (parsed != null) return DateTime.fromMillisecondsSinceEpoch(parsed);
    }
    return DateTime.now();
  }

  Future<void> _loadHistory() async {
    final api = ref.read(apiClientProvider);
    final result = await api.getRideChatMessages(widget.rideId);
    if (!mounted) return;
    if (result case Failure(:final error)) {
      setState(() => _error = error.message);
      return;
    }
    if (result case Success(:final data)) {
      var added = false;
      for (final raw in data) {
        final before = _messages.length;
        _appendMessage(raw, fromHistory: true);
        if (_messages.length > before) added = true;
      }
      if (added) {
        setState(() {});
        _scrollToBottom();
      }
    }
  }

  void _appendMessage(Map<String, dynamic> payload, {bool fromHistory = false}) {
    final role = payload['senderRole']?.toString() ?? 'unknown';
    final text = payload['text']?.toString() ?? '';
    if (text.isEmpty) return;
    final id = payload['id']?.toString() ??
        '${role}_${payload['ts']}_${text.hashCode}';
    if (_knownIds.contains(id)) return;
    final ts = _parseTs(payload['ts']);
    final mine = role == widget.myRole;
    if (!fromHistory && mine && _messages.any((m) => m.isMine && m.text == text)) return;
    _knownIds.add(id);
    _messages.add(RideChatMessage(id: id, text: text, senderRole: role, ts: ts, isMine: mine));
  }

  Future<void> _connectSocket({bool forceReconnect = false}) async {
    final api = ref.read(apiClientProvider);
    if (api.isMockMode) {
      if (mounted) setState(() => _socketHint = 'Mode démo — messages via le serveur uniquement.');
      return;
    }
    final token = await api.authToken();
    if (!mounted) return;
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
            _socketLive = true;
            _socketHint = null;
          });
        }
      },
      onDisconnected: () {
        if (mounted) {
          setState(() {
            _socketLive = false;
            if (socket.connectionFailed) {
              _socketHint = 'Temps réel indisponible — synchronisation toutes les 4 s.';
            }
          });
        }
      },
    );
    final ok = await socket.ensureConnected(timeout: const Duration(seconds: 8));
    if (!mounted) return;
    setState(() {
      _socketLive = ok;
      if (!ok) {
        _socketHint = 'Temps réel limité (${MarketConfig.wsUrl}) — les messages passent par le serveur.';
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
      scrollable: false,
      child: Column(
        children: [
          if (_error != null) ...[
            MovaErrorBanner(
              message: _error!,
              onRetry: () => _loadHistory(),
            ),
            const SizedBox(height: 8),
          ],
          if (_socketHint != null && !_socketLive)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(
                children: [
                  const Icon(Icons.info_outline, size: 16, color: MovaColors.textSecondary),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      _socketHint!,
                      style: const TextStyle(color: MovaColors.textSecondary, fontSize: 12),
                    ),
                  ),
                  TextButton(
                    onPressed: () => _connectSocket(forceReconnect: true),
                    child: const Text('Réessayer'),
                  ),
                ],
              ),
            ),
          if (_loadingHistory)
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
                  Text('Chargement des messages…', style: TextStyle(color: MovaColors.textSecondary)),
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
                  enabled: !_sending && !_loadingHistory,
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
                onPressed: (_sending || _loadingHistory) ? null : _send,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

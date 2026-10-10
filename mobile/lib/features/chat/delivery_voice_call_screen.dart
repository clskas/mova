import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:livekit_client/livekit_client.dart';
import 'package:permission_handler/permission_handler.dart';

import '../../core/api/api_client.dart';
import '../../core/error/result.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';

/// Appel vocal LiveKit sur une livraison (partenaire / livreur / client).
class DeliveryVoiceCallScreen extends ConsumerStatefulWidget {
  const DeliveryVoiceCallScreen({
    super.key,
    required this.deliveryId,
    this.peerLabel = 'Appel',
    this.announce = true,
  });

  final String deliveryId;
  final String peerLabel;
  final bool announce;

  @override
  ConsumerState<DeliveryVoiceCallScreen> createState() => _DeliveryVoiceCallScreenState();
}

class _DeliveryVoiceCallScreenState extends ConsumerState<DeliveryVoiceCallScreen> {
  Room? _room;
  bool _connecting = true;
  bool _muted = false;
  String? _error;
  List<String> _remoteNames = const [];

  @override
  void initState() {
    super.initState();
    _connect();
  }

  @override
  void dispose() {
    _room?.dispose();
    super.dispose();
  }

  Future<void> _connect() async {
    final mic = await Permission.microphone.request();
    if (!mic.isGranted) {
      if (!mounted) return;
      setState(() {
        _connecting = false;
        _error = 'Autorisez le microphone pour l\'appel vocal.';
      });
      return;
    }

    final api = ref.read(apiClientProvider);
    final tokenResult = await api.createDeliveryLiveKitToken(
      widget.deliveryId,
      announce: widget.announce,
    );
    if (!mounted) return;
    if (tokenResult case Failure(:final error)) {
      setState(() {
        _connecting = false;
        _error = error.message;
      });
      return;
    }
    final data = (tokenResult as Success<Map<String, dynamic>>).data;
    final url = data['url']?.toString() ?? '';
    final token = data['token']?.toString() ?? '';
    if (url.isEmpty || token.isEmpty) {
      setState(() {
        _connecting = false;
        _error = 'Configuration appel invalide.';
      });
      return;
    }

    try {
      final room = Room();
      room.addListener(_onRoomChange);
      await room.connect(url, token);
      await room.localParticipant?.setMicrophoneEnabled(true);
      if (!mounted) {
        await room.disconnect();
        room.dispose();
        return;
      }
      setState(() {
        _room = room;
        _connecting = false;
        _refreshRemotes();
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _connecting = false;
        _error = 'Connexion appel impossible.';
      });
    }
  }

  void _onRoomChange() {
    if (!mounted) return;
    _refreshRemotes();
  }

  void _refreshRemotes() {
    final room = _room;
    if (room == null) return;
    setState(() {
      _remoteNames = room.remoteParticipants.values
          .map((p) => p.name.isNotEmpty ? p.name : p.identity)
          .toList();
    });
  }

  Future<void> _toggleMute() async {
    final room = _room;
    if (room == null) return;
    final next = !_muted;
    await room.localParticipant?.setMicrophoneEnabled(!next);
    setState(() => _muted = next);
  }

  Future<void> _hangUp() async {
    final room = _room;
    _room = null;
    await room?.disconnect();
    room?.dispose();
    if (mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    return MovaScreen(
      title: 'Appel · ${widget.peerLabel}',
      scrollable: false,
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              '#${widget.deliveryId.length > 8 ? widget.deliveryId.substring(0, 8) : widget.deliveryId}',
              textAlign: TextAlign.center,
              style: const TextStyle(color: MovaColors.textSecondary),
            ),
            const Spacer(),
            if (_connecting)
              const Center(child: CircularProgressIndicator(color: MovaColors.violet))
            else if (_error != null)
              Text(_error!, textAlign: TextAlign.center, style: const TextStyle(color: Colors.red))
            else ...[
              const Icon(Icons.call, size: 64, color: MovaColors.violet),
              const SizedBox(height: 16),
              Text(
                _remoteNames.isEmpty
                    ? 'En attente des autres participants…'
                    : 'Avec : ${_remoteNames.join(', ')}',
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 16),
              ),
              const SizedBox(height: 8),
              const Text(
                'Appel via Internet (données)',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 12, color: MovaColors.textSecondary),
              ),
            ],
            const Spacer(),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: _room == null ? null : _toggleMute,
                    icon: Icon(_muted ? Icons.mic_off : Icons.mic),
                    label: Text(_muted ? 'Micro coupé' : 'Couper micro'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: FilledButton.icon(
                    style: FilledButton.styleFrom(backgroundColor: Colors.red),
                    onPressed: _hangUp,
                    icon: const Icon(Icons.call_end),
                    label: const Text('Raccrocher'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

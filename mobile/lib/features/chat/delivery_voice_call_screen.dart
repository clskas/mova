import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:livekit_client/livekit_client.dart';
import 'package:permission_handler/permission_handler.dart';

import '../../core/api/api_client.dart';
import '../../core/error/result.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import 'call_ring_service.dart';

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
  EventsListener<RoomEvent>? _listener;
  bool _connecting = true;
  bool _muted = false;
  bool _endedSignaled = false;
  String? _error;
  List<String> _remoteNames = const [];
  ApiClient? _api;

  @override
  void initState() {
    super.initState();
    _api = ref.read(apiClientProvider);
    CallRingService.markInCall(widget.deliveryId);
    unawaited(_prepareAndConnect());
  }

  @override
  void dispose() {
    unawaited(_signalEndAndStopRing());
    unawaited(_tearDownRoom());
    super.dispose();
  }

  Future<void> _prepareAndConnect() async {
    // Libérer la sonnerie (audioplayers) avant LiveKit — sinon audio à sens unique /
    // « permission denied » sur la session micro/haut-parleur.
    await CallRingService.forceStop();
    await Future<void>.delayed(const Duration(milliseconds: 350));
    if (!mounted) return;
    await _connect();
  }

  Future<void> _signalEndAndStopRing() async {
    if (_endedSignaled) return;
    _endedSignaled = true;
    CallRingService.clearInCall(widget.deliveryId);
    await CallRingService.forceStop();
    try {
      await _api?.endDeliveryLiveKitCall(widget.deliveryId);
    } catch (_) {
      /* best-effort */
    }
  }

  Future<void> _tearDownRoom() async {
    final listener = _listener;
    _listener = null;
    await listener?.cancelAll();
    await listener?.dispose();
    final room = _room;
    _room = null;
    room?.removeListener(_onRoomChange);
    try {
      await room?.disconnect();
    } catch (_) {
      /* ignore */
    }
    await room?.dispose();
  }

  Future<void> _connect() async {
    var mic = await Permission.microphone.status;
    if (!mic.isGranted) {
      mic = await Permission.microphone.request();
    }
    if (!mic.isGranted) {
      if (!mounted) return;
      setState(() {
        _connecting = false;
        _error = mic.isPermanentlyDenied
            ? 'Microphone refusé. Activez-le dans les réglages du téléphone.'
            : 'Autorisez le microphone pour l\'appel vocal.';
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
      final room = Room(
        roomOptions: const RoomOptions(
          adaptiveStream: true,
          dynacast: true,
          defaultAudioCaptureOptions: AudioCaptureOptions(
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          ),
          defaultAudioOutputOptions: AudioOutputOptions(speakerOn: true),
        ),
      );
      room.addListener(_onRoomChange);
      final listener = room.createListener();
      listener
        ..on<ParticipantConnectedEvent>((_) => _ensureRemoteAudio(room))
        ..on<TrackSubscribedEvent>((e) {
          if (e.track is! AudioTrack) return;
          _ensureRemoteAudio(room);
        })
        ..on<TrackPublishedEvent>((e) async {
          final pub = e.publication;
          if (pub.kind != TrackType.AUDIO) return;
          if (!pub.subscribed) {
            try {
              await pub.subscribe();
            } catch (err) {
              if (kDebugMode) debugPrint('LiveKit subscribe: $err');
            }
          }
          _ensureRemoteAudio(room);
        });
      _listener = listener;

      await room.connect(
        url,
        token,
        connectOptions: const ConnectOptions(autoSubscribe: true),
      );

      try {
        await Hardware.instance.setSpeakerphoneOn(true, forceSpeakerOutput: true);
      } catch (e) {
        if (kDebugMode) debugPrint('LiveKit speaker: $e');
      }

      try {
        await room.localParticipant?.setMicrophoneEnabled(true);
      } catch (e) {
        if (!mounted) {
          await room.disconnect();
          await room.dispose();
          return;
        }
        setState(() {
          _connecting = false;
          _error = _friendlyLiveKitError(e);
        });
        await room.disconnect();
        await room.dispose();
        return;
      }

      if (!mounted) {
        await room.disconnect();
        await room.dispose();
        return;
      }
      setState(() {
        _room = room;
        _connecting = false;
        _refreshRemotes();
      });
      // Second pass: certains appareils n’activent le micro qu’après le 1er frame.
      await Future<void>.delayed(const Duration(milliseconds: 200));
      if (!mounted || _room != room) return;
      if (room.localParticipant?.isMicrophoneEnabled() != true) {
        try {
          await room.localParticipant?.setMicrophoneEnabled(true);
        } catch (e) {
          if (kDebugMode) debugPrint('LiveKit mic retry: $e');
        }
      }
      await _ensureRemoteAudio(room);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _connecting = false;
        _error = _friendlyLiveKitError(e);
      });
    }
  }

  Future<void> _ensureRemoteAudio(Room room) async {
    for (final participant in room.remoteParticipants.values) {
      for (final pub in participant.audioTrackPublications) {
        if (!pub.subscribed) {
          try {
            await pub.subscribe();
          } catch (_) {
            /* ignore */
          }
        }
      }
    }
    if (!mounted) return;
    _refreshRemotes();
  }

  String _friendlyLiveKitError(Object e) {
    final raw = e.toString();
    final lower = raw.toLowerCase();
    if (lower.contains('permission') || lower.contains('not allowed')) {
      return 'Accès micro / salle refusé. Vérifiez la permission microphone et réessayez.';
    }
    if (lower.contains('timeout') || lower.contains('network')) {
      return 'Réseau insuffisant pour l\'appel. Réessayez avec une meilleure connexion.';
    }
    if (kDebugMode) return 'Connexion appel impossible ($raw)';
    return 'Connexion appel impossible. Réessayez.';
  }

  void _onRoomChange() {
    if (!mounted) return;
    final room = _room;
    if (room != null) unawaited(_ensureRemoteAudio(room));
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
    await _signalEndAndStopRing();
    await _tearDownRoom();
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
                'Appel via Internet (données) — haut-parleur activé',
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

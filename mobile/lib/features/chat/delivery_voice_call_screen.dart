import 'dart:async';
import 'dart:io' show Platform;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart' as rtc;
import 'package:livekit_client/livekit_client.dart';
import 'package:permission_handler/permission_handler.dart';

import '../../core/api/api_client.dart';
import '../../core/api/ride_chat_socket.dart';
import '../../core/api/ride_socket.dart';
import '../../core/error/result.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import 'call_ring_service.dart';

enum VoiceCallKind { ride, delivery }

enum _CallPhase { connecting, ringingOut, inCall, peerLeft, error }

enum _PeerLeftReason { hungUp, declined, noAnswer }

/// Appel vocal LiveKit (course ou livraison).
class DeliveryVoiceCallScreen extends ConsumerStatefulWidget {
  const DeliveryVoiceCallScreen({
    super.key,
    required this.threadId,
    this.kind = VoiceCallKind.delivery,
    this.peerLabel = 'Appel',
    this.announce = true,
  });

  /// Compat anciens appels `deliveryId:`.
  factory DeliveryVoiceCallScreen.delivery({
    Key? key,
    required String deliveryId,
    String peerLabel = 'Appel',
    bool announce = true,
  }) {
    return DeliveryVoiceCallScreen(
      key: key,
      threadId: deliveryId,
      kind: VoiceCallKind.delivery,
      peerLabel: peerLabel,
      announce: announce,
    );
  }

  final String threadId;
  final VoiceCallKind kind;
  final String peerLabel;
  final bool announce;

  /// Ancien nom de paramètre.
  String get deliveryId => threadId;

  @override
  ConsumerState<DeliveryVoiceCallScreen> createState() => _DeliveryVoiceCallScreenState();
}

class _DeliveryVoiceCallScreenState extends ConsumerState<DeliveryVoiceCallScreen> {
  Room? _room;
  EventsListener<RoomEvent>? _listener;
  bool _muted = false;
  bool _endedSignaled = false;
  _CallPhase _phase = _CallPhase.connecting;
  _PeerLeftReason _peerLeftReason = _PeerLeftReason.hungUp;
  String? _error;
  List<String> _remoteNames = const [];
  ApiClient? _api;
  Timer? _ringTimeout;
  late final void Function(Map<String, dynamic>) _socketCallListener;

  String get _scope => widget.kind == VoiceCallKind.ride ? 'ride' : 'delivery';

  @override
  void initState() {
    super.initState();
    _api = ref.read(apiClientProvider);
    CallRingService.markInCall(widget.threadId);
    CallRingService.peerEndedThreadId.addListener(_onPeerEndedSignal);
    _socketCallListener = _onSocketCallEvent;
    ref.read(rideSocketProvider).addCallListener(_socketCallListener);
    ref.read(rideChatSocketProvider).addCallListener(_socketCallListener);
    unawaited(_prepareAndConnect());
  }

  @override
  void dispose() {
    _ringTimeout?.cancel();
    CallRingService.peerEndedThreadId.removeListener(_onPeerEndedSignal);
    ref.read(rideSocketProvider).removeCallListener(_socketCallListener);
    ref.read(rideChatSocketProvider).removeCallListener(_socketCallListener);
    unawaited(_signalEndAndStopRing());
    unawaited(_tearDownRoom());
    super.dispose();
  }

  void _onSocketCallEvent(Map<String, dynamic> payload) {
    final id = payload['rideId']?.toString() ?? payload['deliveryId']?.toString();
    if (id != null && id != widget.threadId) return;
    final action = payload['action']?.toString() ?? 'start';
    if (action != 'end') return;
    // Refus / raccroché distant via socket — même si l'écran parent n'écoute plus.
    CallRingService.notifyPeerEnded(widget.threadId);
  }

  void _onPeerEndedSignal() {
    final ended = CallRingService.peerEndedThreadId.value;
    if (ended == null || ended != widget.threadId) return;
    if (CallRingService.peerEndedThreadId.value == ended) {
      CallRingService.peerEndedThreadId.value = null;
    }
    if (!mounted) return;
    if (_phase == _CallPhase.peerLeft || _phase == _CallPhase.error) return;
    final reason = _phase == _CallPhase.ringingOut || _phase == _CallPhase.connecting
        ? _PeerLeftReason.declined
        : _PeerLeftReason.hungUp;
    _ringTimeout?.cancel();
    setState(() {
      _peerLeftReason = reason;
      _phase = _CallPhase.peerLeft;
    });
    unawaited(_tearDownRoom());
  }

  void _armRingTimeout() {
    _ringTimeout?.cancel();
    if (!widget.announce) return;
    _ringTimeout = Timer(const Duration(seconds: 55), () {
      if (!mounted) return;
      if (_phase != _CallPhase.ringingOut && _phase != _CallPhase.connecting) return;
      setState(() {
        _peerLeftReason = _PeerLeftReason.noAnswer;
        _phase = _CallPhase.peerLeft;
      });
      unawaited(_signalEndAndStopRing());
      unawaited(_tearDownRoom());
    });
  }

  Future<void> _prepareAndConnect() async {
    await CallRingService.forceStop();
    // Laisser l'AudioPlayer abandonner le focus avant WebRTC.
    await Future<void>.delayed(const Duration(milliseconds: 700));
    if (!mounted) return;
    await _prepareAudioSession();
    if (!mounted) return;
    await _connect();
  }

  Future<void> _prepareAudioSession() async {
    try {
      if (!kIsWeb && Platform.isAndroid) {
        await rtc.Helper.setAndroidAudioConfiguration(
          rtc.AndroidAudioConfiguration.communication,
        );
      }
      await Hardware.instance.setSpeakerphoneOn(true, forceSpeakerOutput: true);
    } catch (e) {
      if (kDebugMode) debugPrint('LiveKit audio session: $e');
    }
  }

  Future<void> _signalEndAndStopRing() async {
    if (_endedSignaled) return;
    _endedSignaled = true;
    CallRingService.clearInCall(widget.threadId);
    await CallRingService.forceStop();
    try {
      await _api?.endLiveKitCall(scope: _scope, threadId: widget.threadId);
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
        _phase = _CallPhase.error;
        _error = mic.isPermanentlyDenied
            ? 'Microphone refusé. Activez-le dans les réglages du téléphone.'
            : 'Autorisez le microphone pour l\'appel vocal.';
      });
      return;
    }

    final api = ref.read(apiClientProvider);
    final tokenResult = await api.createLiveKitToken(
      scope: _scope,
      threadId: widget.threadId,
      announce: widget.announce,
    );
    if (!mounted) return;
    if (tokenResult case Failure(:final error)) {
      setState(() {
        _phase = _CallPhase.error;
        _error = error.message;
      });
      return;
    }
    final data = (tokenResult as Success<Map<String, dynamic>>).data;
    final url = data['url']?.toString() ?? '';
    final token = data['token']?.toString() ?? '';
    if (url.isEmpty || token.isEmpty) {
      setState(() {
        _phase = _CallPhase.error;
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
        ..on<ParticipantConnectedEvent>((_) {
          _onPeerPresenceChanged(room);
        })
        ..on<ParticipantDisconnectedEvent>((_) {
          _onPeerPresenceChanged(room);
        })
        ..on<TrackSubscribedEvent>((e) async {
          final subscribed = e.track;
          if (subscribed is! AudioTrack) return;
          try {
            await subscribed.start();
          } catch (_) {
            /* déjà démarré */
          }
          await _ensureSpeaker();
          _onPeerPresenceChanged(room);
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
          _onPeerPresenceChanged(room);
        });
      _listener = listener;

      await room.connect(
        url,
        token,
        connectOptions: const ConnectOptions(autoSubscribe: true),
      );

      await _ensureSpeaker();

      // Publier le micro après un court délai (évite permission denied / session audio).
      await Future<void>.delayed(const Duration(milliseconds: 350));
      if (!mounted) {
        await room.disconnect();
        await room.dispose();
        return;
      }

      Object? micError;
      for (var attempt = 0; attempt < 3; attempt++) {
        try {
          await room.localParticipant?.setMicrophoneEnabled(true);
          micError = null;
          break;
        } catch (e) {
          micError = e;
          await _prepareAudioSession();
          await Future<void>.delayed(Duration(milliseconds: 350 * (attempt + 1)));
        }
      }
      if (micError != null) {
        if (!mounted) {
          await room.disconnect();
          await room.dispose();
          return;
        }
        setState(() {
          _phase = _CallPhase.error;
          _error = _friendlyLiveKitError(micError!);
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
        _refreshRemotes();
        _phase = _remoteNames.isEmpty
            ? (widget.announce ? _CallPhase.ringingOut : _CallPhase.connecting)
            : _CallPhase.inCall;
      });
      if (_phase == _CallPhase.ringingOut) _armRingTimeout();
      await _ensureRemoteAudio(room);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _phase = _CallPhase.error;
        _error = _friendlyLiveKitError(e);
      });
    }
  }

  void _onPeerPresenceChanged(Room room) {
    if (!mounted || _room != room) return;
    _refreshRemotes();
    final hasPeer = room.remoteParticipants.isNotEmpty;
    setState(() {
      if (hasPeer) {
        _ringTimeout?.cancel();
        _phase = _CallPhase.inCall;
      } else if (_phase == _CallPhase.inCall) {
        _peerLeftReason = _PeerLeftReason.hungUp;
        _phase = _CallPhase.peerLeft;
      } else if (widget.announce) {
        _phase = _CallPhase.ringingOut;
      }
    });
    unawaited(_ensureRemoteAudio(room));
  }

  Future<void> _ensureSpeaker() async {
    try {
      if (!kIsWeb && Platform.isAndroid) {
        await rtc.Helper.setAndroidAudioConfiguration(
          rtc.AndroidAudioConfiguration.communication,
        );
      }
      await Hardware.instance.setSpeakerphoneOn(true, forceSpeakerOutput: true);
    } catch (e) {
      if (kDebugMode) debugPrint('LiveKit speaker: $e');
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
        final remoteTrack = pub.track;
        if (remoteTrack != null) {
          try {
            await remoteTrack.start();
          } catch (_) {
            /* ignore */
          }
        }
      }
    }
    await _ensureSpeaker();
    if (!mounted) return;
    _refreshRemotes();
  }

  String _friendlyLiveKitError(Object e) {
    final raw = e.toString();
    final lower = raw.toLowerCase();
    if (lower.contains('permission') || lower.contains('not allowed')) {
      return 'Accès micro / salle refusé. Fermez l\'app, réautorisez le micro, puis réessayez.';
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
    if (room != null) _onPeerPresenceChanged(room);
  }

  void _refreshRemotes() {
    final room = _room;
    if (room == null) return;
    _remoteNames = room.remoteParticipants.values
        .map((p) => p.name.isNotEmpty ? p.name : p.identity)
        .toList();
  }

  Future<void> _toggleMute() async {
    final room = _room;
    if (room == null) return;
    final next = !_muted;
    await room.localParticipant?.setMicrophoneEnabled(!next);
    setState(() => _muted = next);
  }

  Future<void> _hangUp() async {
    _ringTimeout?.cancel();
    await _signalEndAndStopRing();
    await _tearDownRoom();
    if (mounted) Navigator.of(context).pop();
  }

  String get _statusTitle {
    switch (_phase) {
      case _CallPhase.connecting:
        return 'Connexion…';
      case _CallPhase.ringingOut:
        return 'Appel en cours…';
      case _CallPhase.inCall:
        return 'En conversation';
      case _CallPhase.peerLeft:
        return 'Appel terminé';
      case _CallPhase.error:
        return 'Échec de l\'appel';
    }
  }

  String get _statusSubtitle {
    switch (_phase) {
      case _CallPhase.connecting:
        return 'Préparation de l\'appel vocal SENGA';
      case _CallPhase.ringingOut:
        return 'En attente que ${widget.peerLabel} décroche…';
      case _CallPhase.inCall:
        return _remoteNames.isEmpty
            ? 'Connecté'
            : 'Avec : ${_remoteNames.join(', ')}';
      case _CallPhase.peerLeft:
        switch (_peerLeftReason) {
          case _PeerLeftReason.declined:
            return '${widget.peerLabel} a refusé l\'appel';
          case _PeerLeftReason.noAnswer:
            return 'Pas de réponse';
          case _PeerLeftReason.hungUp:
            return '${widget.peerLabel} a raccroché';
        }
      case _CallPhase.error:
        return _error ?? 'Erreur';
    }
  }

  @override
  Widget build(BuildContext context) {
    final inCall = _phase == _CallPhase.inCall;
    final canMute = _room != null && (inCall || _phase == _CallPhase.ringingOut);
    return MovaScreen(
      title: 'Appel · ${widget.peerLabel}',
      scrollable: false,
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              '#${widget.threadId.length > 8 ? widget.threadId.substring(0, 8) : widget.threadId}',
              textAlign: TextAlign.center,
              style: const TextStyle(color: MovaColors.textSecondary),
            ),
            const Spacer(),
            Icon(
              _phase == _CallPhase.error
                  ? Icons.call_end
                  : (_phase == _CallPhase.peerLeft
                      ? Icons.phone_disabled
                      : (inCall ? Icons.call : Icons.ring_volume)),
              size: 72,
              color: _phase == _CallPhase.error || _phase == _CallPhase.peerLeft
                  ? Colors.red
                  : MovaColors.violet,
            ),
            const SizedBox(height: 20),
            Text(
              _statusTitle,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 10),
            if (_phase == _CallPhase.connecting)
              const Padding(
                padding: EdgeInsets.only(top: 12),
                child: Center(child: CircularProgressIndicator(color: MovaColors.violet)),
              )
            else
              Text(
                _statusSubtitle,
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 15,
                  color: _phase == _CallPhase.error ? Colors.red : MovaColors.textSecondary,
                ),
              ),
            if (inCall) ...[
              const SizedBox(height: 12),
              const Text(
                'Appel via Internet — haut-parleur activé',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 12, color: MovaColors.textSecondary),
              ),
            ],
            const Spacer(),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: canMute ? _toggleMute : null,
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
                    label: Text(_phase == _CallPhase.peerLeft ? 'Fermer' : 'Raccrocher'),
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

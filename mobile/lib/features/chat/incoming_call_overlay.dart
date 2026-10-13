import 'dart:async';

import 'package:flutter/material.dart';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/theme/mova_colors.dart';
import 'call_ring_service.dart';
import 'delivery_voice_call_screen.dart';

/// Overlay global : bouton Décrocher / Refuser quand un appel LiveKit arrive.
class IncomingCallOverlay extends ConsumerWidget {
  const IncomingCallOverlay({
    super.key,
    required this.navigatorKey,
    required this.child,
  });

  final GlobalKey<NavigatorState> navigatorKey;
  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Stack(
      fit: StackFit.expand,
      children: [
        child,
        ValueListenableBuilder<IncomingCallInfo?>(
          valueListenable: CallRingService.incoming,
          builder: (context, info, _) {
            if (info == null) return const SizedBox.shrink();
            return _IncomingCallSheet(
              info: info,
              onAnswer: () => _answer(info),
              onDecline: () => unawaited(_decline(ref, info)),
            );
          },
        ),
      ],
    );
  }

  Future<void> _decline(WidgetRef ref, IncomingCallInfo info) async {
    await CallRingService.forceStop();
    try {
      await ref.read(apiClientProvider).endDeliveryLiveKitCall(info.deliveryId);
    } catch (_) {
      /* best-effort */
    }
  }

  void _answer(IncomingCallInfo info) {
    CallRingService.markInCall(info.deliveryId);
    unawaited(CallRingService.stop(deliveryId: info.deliveryId));
    final nav = navigatorKey.currentState;
    if (nav == null) return;
    nav.push(
      MaterialPageRoute<void>(
        builder: (_) => DeliveryVoiceCallScreen(
          deliveryId: info.deliveryId,
          peerLabel: info.peerLabel,
          announce: false,
        ),
      ),
    );
  }
}

class _IncomingCallSheet extends StatelessWidget {
  const _IncomingCallSheet({
    required this.info,
    required this.onAnswer,
    required this.onDecline,
  });

  final IncomingCallInfo info;
  final VoidCallback onAnswer;
  final VoidCallback onDecline;

  @override
  Widget build(BuildContext context) {
    final shortId = info.deliveryId.length > 8
        ? info.deliveryId.substring(0, 8)
        : info.deliveryId;
    return Material(
      color: Colors.black.withValues(alpha: 0.72),
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
          child: Column(
            children: [
              const Spacer(),
              Container(
                width: 96,
                height: 96,
                decoration: BoxDecoration(
                  color: MovaColors.violet.withValues(alpha: 0.2),
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.call, size: 48, color: Colors.white),
              ),
              const SizedBox(height: 24),
              const Text(
                'Appel vocal SENGA',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 22,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                info.peerLabel,
                style: const TextStyle(color: Colors.white70, fontSize: 18),
              ),
              const SizedBox(height: 4),
              Text(
                'Livraison #$shortId',
                style: const TextStyle(color: Colors.white54, fontSize: 13),
              ),
              const Spacer(),
              Row(
                children: [
                  Expanded(
                    child: FilledButton.icon(
                      style: FilledButton.styleFrom(
                        backgroundColor: Colors.red.shade700,
                        foregroundColor: Colors.white,
                        minimumSize: const Size.fromHeight(56),
                      ),
                      onPressed: onDecline,
                      icon: const Icon(Icons.call_end),
                      label: const Text('Refuser'),
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: FilledButton.icon(
                      style: FilledButton.styleFrom(
                        backgroundColor: Colors.green.shade600,
                        foregroundColor: Colors.white,
                        minimumSize: const Size.fromHeight(56),
                      ),
                      onPressed: onAnswer,
                      icon: const Icon(Icons.call),
                      label: const Text('Décrocher'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

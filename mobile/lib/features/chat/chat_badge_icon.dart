import 'package:flutter/material.dart';

import '../../core/theme/mova_colors.dart';
import 'chat_alert_service.dart';

/// Icône chat avec pastille du nombre de messages non lus.
class ChatBadgeIcon extends StatelessWidget {
  const ChatBadgeIcon({
    super.key,
    required this.kind,
    required this.threadId,
    this.icon = Icons.chat_bubble_outline,
    this.color,
    this.size,
  });

  final String kind;
  final String threadId;
  final IconData icon;
  final Color? color;
  final double? size;

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<Map<String, int>>(
      valueListenable: ChatAlertService.unreadByThread,
      builder: (context, map, _) {
        final count = map[ChatAlertService.threadKey(kind, threadId)] ?? 0;
        final child = Icon(icon, color: color, size: size);
        if (count <= 0) return child;
        return Badge(
          backgroundColor: MovaColors.violet,
          label: Text(
            count > 99 ? '99+' : '$count',
            style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w700),
          ),
          child: child,
        );
      },
    );
  }
}

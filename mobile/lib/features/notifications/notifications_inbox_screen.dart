import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/api/api_client.dart';
import '../../core/error/result.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import '../chat/chat_alert_service.dart';
import '../sos/notification_tap_router.dart';
import '../sos/sos_alert_screen.dart';

/// Boîte de réception des notifications serveur (SOS, courses, chat…).
class NotificationsInboxScreen extends ConsumerStatefulWidget {
  const NotificationsInboxScreen({super.key});

  @override
  ConsumerState<NotificationsInboxScreen> createState() =>
      _NotificationsInboxScreenState();
}

class _NotificationsInboxScreenState extends ConsumerState<NotificationsInboxScreen> {
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _items = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final result = await ref.read(apiClientProvider).getNotifications();
    if (!mounted) return;
    switch (result) {
      case Success(:final data):
        setState(() {
          _items = data;
          _loading = false;
        });
      case Failure(:final error):
        setState(() {
          _error = error.message;
          _loading = false;
        });
    }
  }

  Future<void> _markAllRead() async {
    await ref.read(apiClientProvider).markAllNotificationsRead();
    try {
      await FlutterLocalNotificationsPlugin().cancelAll();
    } catch (_) {
      /* ignore */
    }
    // Remet le badge launcher (iOS) à 0 via le canal chat.
    ChatAlertService.unreadByThread.value = const {};
    await ChatAlertService.syncLauncherBadge();
    if (!mounted) return;
    await _load();
  }

  Future<void> _openItem(Map<String, dynamic> n) async {
    final id = n['id']?.toString();
    if (id != null && id.isNotEmpty && n['read'] != true) {
      await ref.read(apiClientProvider).markNotificationRead(id);
    }
    if (!mounted) return;

    final type = n['type']?.toString() ?? '';
    final data = (n['data'] is Map)
        ? Map<String, dynamic>.from(n['data'] as Map)
        : <String, dynamic>{};
    final title = n['title']?.toString();
    final body = n['body']?.toString();

    if (type == 'INCIDENT_CREATED' || type == 'SOS' || data['type']?.toString() == 'SOS') {
      final lat = data['lat'] is num
          ? (data['lat'] as num).toDouble()
          : double.tryParse('${data['lat'] ?? ''}');
      final lng = data['lng'] is num
          ? (data['lng'] as num).toDouble()
          : double.tryParse('${data['lng'] ?? ''}');
      await Navigator.push<void>(
        context,
        MaterialPageRoute(
          builder: (_) => SosAlertScreen(
            incidentId: data['incidentId']?.toString(),
            title: title,
            body: body,
            lat: lat,
            lng: lng,
            rideId: data['rideId']?.toString(),
            referenceType: data['referenceType']?.toString(),
            referenceId: data['referenceId']?.toString(),
            forOps: data['forOps'] == true,
          ),
        ),
      );
      if (mounted) await _load();
      return;
    }

    final jobKind = data['jobKind']?.toString() ?? type;
    final refId = data['referenceId']?.toString() ??
        data['rideId']?.toString() ??
        data['deliveryId']?.toString() ??
        data['threadId']?.toString() ??
        '';
    if (refId.isNotEmpty &&
        (jobKind.contains('RIDE') ||
            jobKind.contains('DELIVERY') ||
            jobKind.contains('OFFER') ||
            jobKind.contains('JOB'))) {
      NotificationTapRouter.openJob(
        JobOpenRequest(
          kind: jobKind.contains('DELIVERY') ? 'delivery' : 'ride',
          id: refId,
        ),
      );
      if (mounted) await _load();
      return;
    }

    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title?.isNotEmpty == true ? title! : 'Notification SENGA'),
        content: SingleChildScrollView(
          child: Text(body?.isNotEmpty == true ? body! : 'Aucun détail supplémentaire.'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Fermer')),
        ],
      ),
    );
    if (mounted) await _load();
  }

  IconData _iconFor(String type) {
    if (type == 'INCIDENT_CREATED' || type == 'SOS') return Icons.sos;
    if (type.contains('CHAT')) return Icons.chat_bubble_outline;
    if (type.contains('RIDE') || type.contains('DELIVERY') || type.contains('OFFER')) {
      return Icons.local_taxi_outlined;
    }
    return Icons.notifications_outlined;
  }

  Color _colorFor(String type) {
    if (type == 'INCIDENT_CREATED' || type == 'SOS') return MovaColors.red;
    if (type.contains('CHAT')) return MovaColors.violet;
    if (type.contains('RIDE') || type.contains('DELIVERY')) return MovaColors.orange;
    return MovaColors.textSecondary;
  }

  String _formatWhen(Object? raw) {
    if (raw == null) return '';
    final dt = DateTime.tryParse(raw.toString())?.toLocal();
    if (dt == null) return '';
    return DateFormat('dd/MM/yyyy HH:mm').format(dt);
  }

  @override
  Widget build(BuildContext context) {
    final unread = _items.where((n) => n['read'] != true).length;
    // scrollable:false — ListView a besoin d’une hauteur bornée (sinon liste vide).
    return MovaScreen(
      title: 'Notifications',
      scrollable: false,
      actions: [
        if (unread > 0)
          TextButton(
            onPressed: _markAllRead,
            child: const Text('Tout lire'),
          ),
      ],
      child: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? MovaErrorBanner(message: _error!, onRetry: _load)
              : _items.isEmpty
                  ? const Center(
                      child: Text(
                        'Aucune notification pour le moment.',
                        style: TextStyle(color: MovaColors.textSecondary),
                      ),
                    )
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView.separated(
                        physics: kMovaScrollPhysics,
                        itemCount: _items.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 8),
                        itemBuilder: (context, i) {
                          final n = _items[i];
                          final type = n['type']?.toString() ?? '';
                          final unreadItem = n['read'] != true;
                          final title = n['title']?.toString() ?? 'SENGA';
                          final body = n['body']?.toString() ?? '';
                          return MovaCard(
                            onTap: () => _openItem(n),
                            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                CircleAvatar(
                                  backgroundColor: _colorFor(type).withValues(alpha: 0.15),
                                  child: Icon(_iconFor(type), color: _colorFor(type), size: 22),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Row(
                                        children: [
                                          Expanded(
                                            child: Text(
                                              title,
                                              style: TextStyle(
                                                fontWeight:
                                                    unreadItem ? FontWeight.w700 : FontWeight.w500,
                                              ),
                                            ),
                                          ),
                                          if (unreadItem)
                                            Container(
                                              width: 8,
                                              height: 8,
                                              decoration: const BoxDecoration(
                                                color: MovaColors.violet,
                                                shape: BoxShape.circle,
                                              ),
                                            ),
                                        ],
                                      ),
                                      if (body.isNotEmpty) ...[
                                        const SizedBox(height: 4),
                                        Text(
                                          body,
                                          maxLines: 3,
                                          overflow: TextOverflow.ellipsis,
                                          style: const TextStyle(
                                            color: MovaColors.textSecondary,
                                            fontSize: 13,
                                          ),
                                        ),
                                      ],
                                      const SizedBox(height: 6),
                                      Text(
                                        _formatWhen(n['createdAt']),
                                        style: const TextStyle(
                                          color: MovaColors.textMuted,
                                          fontSize: 11,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          );
                        },
                      ),
                    ),
    );
  }
}

/// Pastille cloche pour l’AppBar (compte non lus serveur).
class NotificationsBellButton extends ConsumerStatefulWidget {
  const NotificationsBellButton({super.key});

  @override
  ConsumerState<NotificationsBellButton> createState() => _NotificationsBellButtonState();
}

class _NotificationsBellButtonState extends ConsumerState<NotificationsBellButton> {
  int _unread = 0;

  @override
  void initState() {
    super.initState();
    _refreshCount();
  }

  Future<void> _refreshCount() async {
    final result = await ref.read(apiClientProvider).getNotifications();
    if (!mounted) return;
    if (result case Success(:final data)) {
      setState(() => _unread = data.where((n) => n['read'] != true).length);
    }
  }

  @override
  Widget build(BuildContext context) {
    return IconButton(
      tooltip: 'Notifications',
      onPressed: () async {
        await Navigator.push<void>(
          context,
          MaterialPageRoute(builder: (_) => const NotificationsInboxScreen()),
        );
        if (mounted) await _refreshCount();
      },
      icon: Badge(
        isLabelVisible: _unread > 0,
        label: Text(_unread > 99 ? '99+' : '$_unread'),
        child: const Icon(Icons.notifications_outlined),
      ),
    );
  }
}

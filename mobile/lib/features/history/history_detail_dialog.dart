import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/theme/mova_colors.dart';
import '../moving/moving_tracking_screen.dart';
import '../rides/scheduled_ride_screen.dart';
import '../booking/tracking_screen.dart';

String historyStatusLabel(String? status) => switch (status) {
      'COMPLETED' => 'Terminé',
      'DELIVERED' => 'Livré',
      'CONFIRMED' => 'Confirmé',
      'SCHEDULED' => 'Planifiée',
      'IN_TRANSIT' => 'En transit',
      'CANCELLED' => 'Annulé',
      'ACCEPTED' => 'Accepté',
      'IN_PROGRESS' => 'En cours',
      'ASSIGNED' => 'Équipe assignée',
      'PENDING' => 'En attente',
      'DRIVER_ASSIGNED' => 'Chauffeur assigné',
      _ => status ?? '—',
    };

/// Course taxi : distingue terminée / payée / à payer.
String rideHistoryStatusLabel(Map<String, dynamic> item) {
  final status = item['status']?.toString();
  if (status != 'COMPLETED') return historyStatusLabel(status);
  if (item['isPaid'] == true) return 'Terminée · Payée';
  if (item['paymentReady'] == true) return 'Terminée · À payer';
  return 'Terminée';
}

String historyTypeLabel(String? type) => switch (type) {
      'RIDE' => 'Course taxi',
      'MOVING' => 'Déménagement',
      'SCHEDULED' => 'Réservation planifiée',
      'PARCEL' => 'Colis',
      'EXPRESS' => 'Express',
      'FOOD' => 'Repas',
      'ERRAND' => 'Courses',
      'RENTAL' => 'Location véhicule',
      'CARPOOL' => 'Covoiturage',
      _ => type ?? 'Service',
    };

List<Map<String, dynamic>> scheduledTimelineSteps(String? status) {
  const steps = [
    ('SCHEDULED', 'Réservation enregistrée'),
    ('CONFIRMED', 'Confirmée par MOVA'),
    ('IN_PROGRESS', 'Trajet en cours'),
    ('COMPLETED', 'Terminée'),
  ];
  if (status == 'CANCELLED') {
    return [{'label': 'Réservation annulée', 'done': true}];
  }
  final order = steps.map((s) => s.$1).toList();
  final idx = order.indexOf(status ?? 'SCHEDULED');
  return steps
      .asMap()
      .entries
      .map((e) => {'label': e.value.$2, 'done': idx >= 0 && e.key <= idx})
      .toList();
}

List<Map<String, dynamic>> movingTimelineSteps(String? status) {
  const steps = [
    ('PENDING', 'Demande enregistrée'),
    ('ASSIGNED', 'Équipe assignée'),
    ('IN_PROGRESS', 'Déménagement en cours'),
    ('COMPLETED', 'Déménagement terminé'),
  ];
  if (status == 'CANCELLED') {
    return [{'label': 'Demande annulée', 'done': true}];
  }
  final order = steps.map((s) => s.$1).toList();
  final idx = order.indexOf(status ?? 'PENDING');
  return steps
      .asMap()
      .entries
      .map((e) => {'label': e.value.$2, 'done': idx >= 0 && e.key <= idx})
      .toList();
}

Future<void> showHistoryDetailDialog(
  BuildContext context,
  WidgetRef ref,
  Map<String, dynamic> item,
) async {
  final type = item['type']?.toString();
  final meta = item['meta'] as Map<String, dynamic>? ?? {};
  final id = item['id']?.toString() ?? '';
  final status = item['status']?.toString();

  List<Map<String, dynamic>> timeline = [];
  List<String> photoUrls = [];
  Map<String, dynamic>? live;

  if (type == 'MOVING' && id.isNotEmpty) {
    final api = ref.read(apiClientProvider);
    final result = await api.get('/moving/$id');
    if (result case Success(:final data)) {
      live = data['moving'] as Map<String, dynamic>? ?? data;
      final rawTimeline = live?['timeline'] as List?;
      if (rawTimeline != null && rawTimeline.isNotEmpty) {
        timeline = rawTimeline.cast<Map<String, dynamic>>();
      }
      photoUrls = (live?['photoUrls'] as List?)?.map((e) => e.toString()).toList() ??
          (meta['photoUrls'] as List?)?.map((e) => e.toString()).toList() ??
          [];
    }
  } else if (type == 'SCHEDULED' && id.isNotEmpty) {
    final api = ref.read(apiClientProvider);
    final result = await api.get('/rides/scheduled/$id');
    if (result case Success(:final data)) {
      live = data is Map<String, dynamic> ? data : null;
    }
  }

  if (timeline.isEmpty && type == 'MOVING') {
    timeline = movingTimelineSteps(live?['status']?.toString() ?? status);
  }
  if (timeline.isEmpty && type == 'SCHEDULED') {
    timeline = scheduledTimelineSteps(live?['status']?.toString() ?? status);
  }

  if (!context.mounted) return;

  await showDialog<void>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(historyTypeLabel(type)),
      content: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            if (id.isNotEmpty)
              Text('Réf. ${id.length <= 8 ? id.toUpperCase() : id.substring(0, 8).toUpperCase()}',
                  style: const TextStyle(fontSize: 12, color: MovaColors.violet)),
            const SizedBox(height: 8),
            Text(item['title']?.toString() ?? '', style: const TextStyle(fontWeight: FontWeight.w600)),
            const SizedBox(height: 8),
            Text(
              'Statut : ${rideHistoryStatusLabel({...item, ...?live})}',
              style: const TextStyle(color: MovaColors.violet, fontWeight: FontWeight.w600),
            ),
            Text(
              MarketConfig.formatCdf(item['priceCdf'] as int? ?? live?['estimatedPriceCdf'] as int? ?? 0),
              style: const TextStyle(fontWeight: FontWeight.bold),
            ),
            if (meta['scheduledAt'] != null || live?['scheduledAt'] != null) ...[
              const SizedBox(height: 4),
              Text(
                'Date : ${meta['scheduledAt'] ?? live?['scheduledAt']}',
                style: const TextStyle(fontSize: 13, color: MovaColors.textSecondary),
              ),
            ],
            if (meta['volumeM3'] != null) ...[
              const SizedBox(height: 4),
              Text('Volume : ${meta['volumeM3']} m³', style: const TextStyle(fontSize: 13)),
            ],
            if (timeline.isNotEmpty) ...[
              const SizedBox(height: 16),
              const Text('Suivi', style: TextStyle(fontWeight: FontWeight.w600)),
              const SizedBox(height: 8),
              ...timeline.map((step) {
                final done = step['done'] == true;
                return Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Row(
                    children: [
                      Icon(
                        done ? Icons.check_circle : Icons.radio_button_unchecked,
                        size: 18,
                        color: done ? MovaColors.green : MovaColors.textSecondary,
                      ),
                      const SizedBox(width: 8),
                      Expanded(child: Text(step['label']?.toString() ?? '')),
                    ],
                  ),
                );
              }),
            ],
            if (photoUrls.isNotEmpty) ...[
              const SizedBox(height: 12),
              const Text('Photos inventaire', style: TextStyle(fontWeight: FontWeight.w600)),
              const SizedBox(height: 8),
              SizedBox(
                height: 72,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: photoUrls.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 8),
                  itemBuilder: (_, i) => ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: Image.network(
                      MarketConfig.resolveMediaUrl(photoUrls[i]),
                      width: 72,
                      height: 72,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => Container(
                        width: 72,
                        height: 72,
                        color: Colors.grey.shade200,
                        child: const Icon(Icons.broken_image_outlined),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Fermer')),
        if (type == 'RIDE' &&
            id.isNotEmpty &&
            item['paymentReady'] == true &&
            item['isPaid'] != true)
          FilledButton(
            onPressed: () {
              Navigator.pop(ctx);
              final amount = item['priceCdf'] as int? ?? 0;
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => TrackingScreen(
                    rideId: id,
                    estimatedFareCdf: amount,
                  ),
                ),
              );
            },
            child: const Text('Payer la course'),
          ),
        if (type == 'MOVING' && id.isNotEmpty)
          TextButton(
            onPressed: () {
              Navigator.pop(ctx);
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => MovingTrackingScreen(
                    movingId: id,
                    fromAddress: meta['pickupAddress']?.toString() ?? '',
                    toAddress: meta['dropoffAddress']?.toString() ?? '',
                    estimatedPrice: item['priceCdf'] as int? ?? 0,
                  ),
                ),
              );
            },
            child: const Text('Suivi complet'),
          ),
        if (type == 'SCHEDULED')
          TextButton(
            onPressed: () {
              Navigator.pop(ctx);
              Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const ScheduledRideScreen()),
              );
            },
            child: const Text('Mes réservations'),
          ),
      ],
    ),
  );
}

/// Vignette photo locale ou distante.
Widget movingPhotoThumbnail({String? localPath, String? remoteUrl, VoidCallback? onRemove}) {
  Widget image;
  if (localPath != null && localPath.isNotEmpty) {
    image = Image.file(File(localPath), width: 80, height: 80, fit: BoxFit.cover);
  } else if (remoteUrl != null && remoteUrl.isNotEmpty) {
    image = Image.network(
      MarketConfig.resolveMediaUrl(remoteUrl),
      width: 80,
      height: 80,
      fit: BoxFit.cover,
      errorBuilder: (_, __, ___) => Container(
        width: 80,
        height: 80,
        color: Colors.grey.shade200,
        child: const Icon(Icons.broken_image_outlined),
      ),
    );
  } else {
    image = Container(width: 80, height: 80, color: Colors.grey.shade200);
  }
  return Stack(
    clipBehavior: Clip.none,
    children: [
      ClipRRect(borderRadius: BorderRadius.circular(8), child: image),
      if (onRemove != null)
        Positioned(
          top: -6,
          right: -6,
          child: GestureDetector(
            onTap: onRemove,
            child: const CircleAvatar(
              radius: 12,
              backgroundColor: MovaColors.error,
              child: Icon(Icons.close, size: 14, color: Colors.white),
            ),
          ),
        ),
    ],
  );
}

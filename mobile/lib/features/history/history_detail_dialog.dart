import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/theme/mova_colors.dart';
import '../errands/errand_tracking_screen.dart';
import '../moving/moving_tracking_screen.dart';
import '../rides/scheduled_ride_screen.dart';
import '../booking/booking_screen.dart';
import '../booking/payment_screen.dart';
import '../booking/tracking_screen.dart';
import '../rating/rating_screen.dart';
import '../billing/billing_util.dart';
import '../billing/receipt_screen.dart';

String historyStatusLabel(String? status) => switch (status) {
      'COMPLETED' => 'Terminé',
      'DELIVERED' => 'Livré',
      'CONFIRMED' => 'Confirmé',
      'SCHEDULED' => 'Planifiée',
      'IN_TRANSIT' => 'En transit',
      'CANCELLED' => 'Annulé',
      'ACCEPTED' => 'Accepté',
      'IN_PROGRESS' => 'En cours',
      'RETURNED' => 'Retournée',
      'PAID' => 'Payée',
      'CLOSED' => 'Annulée',
      'ASSIGNED' => 'Équipe assignée',
      'PENDING' => 'En attente',
      'DRIVER_ASSIGNED' => 'Chauffeur assigné',
      _ => status ?? '—',
    };

/// Course taxi : distingue terminée / payée / à payer.
String rideHistoryStatusLabel(Map<String, dynamic> item) {
  final status = item['status']?.toString();
  final type = item['type']?.toString();
  if (type == 'RENTAL' && status == 'RETURNED') {
    if (item['isPaid'] == true) return 'Retournée · Payée';
    if (item['paymentReady'] == true) return 'Retournée · À payer';
    return 'Retournée';
  }
  if (type == 'MOVING' && status == 'COMPLETED') {
    if (item['isPaid'] == true) return 'Terminé · Payé';
    if (item['paymentReady'] == true) return 'Terminé · À payer';
    return 'Terminé';
  }
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
    ('CONFIRMED', 'Confirmée par SENGA'),
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
      live = data['scheduledRide'] as Map<String, dynamic>? ??
          (data is Map<String, dynamic> ? data : null);
    }
  } else if (type == 'CARPOOL' && id.isNotEmpty) {
    final api = ref.read(apiClientProvider);
    final result = await api.get('/carpool/$id');
    if (result case Success(:final data)) {
      live = data['trip'] as Map<String, dynamic>? ?? (data is Map<String, dynamic> ? data : null);
    }
  } else if (type == 'RENTAL' && id.isNotEmpty) {
    final api = ref.read(apiClientProvider);
    final result = await api.get('/rental/bookings/$id');
    if (result case Success(:final data)) {
      final raw = data is Map<String, dynamic> ? data : Map<String, dynamic>.from(data as Map);
      live = raw['inquiry'] as Map<String, dynamic>? ??
          raw['booking'] as Map<String, dynamic>? ??
          raw;
    }
  } else if (type == 'ERRAND' && id.isNotEmpty) {
    final api = ref.read(apiClientProvider);
    final result = await api.get('/errands/$id');
    if (result case Success(:final data)) {
      live = data['errand'] as Map<String, dynamic>? ??
          (data is Map<String, dynamic> ? data : Map<String, dynamic>.from(data as Map));
      final rawTimeline = live['timeline'] as List? ?? live['tracking'] as List?;
      if (rawTimeline != null && rawTimeline.isNotEmpty) {
        timeline = rawTimeline.cast<Map<String, dynamic>>();
      }
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
        if (type == 'RIDE' && status == 'COMPLETED' && id.isNotEmpty)
          TextButton(
            onPressed: () {
              Navigator.pop(ctx);
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => BookingScreen(
                    initialPickupAddress: meta['pickupAddress']?.toString(),
                    initialDropoffAddress: meta['dropoffAddress']?.toString(),
                    initialVehicleType: meta['vehicleType']?.toString(),
                  ),
                ),
              );
            },
            child: const Text('Commander à nouveau'),
          ),
        if (type == 'RIDE' && status == 'COMPLETED' && id.isNotEmpty)
          TextButton(
            onPressed: () {
              Navigator.pop(ctx);
              Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => RatingScreen(rideId: id)),
              );
            },
            child: const Text('Noter le chauffeur'),
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
        if (type == 'ERRAND' && id.isNotEmpty)
          TextButton(
            onPressed: () {
              Navigator.pop(ctx);
              final items = (live?['items'] as List?)?.map((e) => e.toString()).toList() ??
                  (meta['items'] as List?)?.map((e) => e.toString()).toList() ??
                  <String>[];
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => ErrandTrackingScreen(
                    errandId: id,
                    deliveryAddress: live?['deliveryAddress']?.toString() ??
                        live?['dropoffAddress']?.toString() ??
                        meta['deliveryAddress']?.toString() ??
                        item['title']?.toString() ??
                        '',
                    items: items,
                    totalCdf: (live?['totalPriceCdf'] as num?)?.toInt() ??
                        (item['priceCdf'] as num?)?.toInt() ??
                        0,
                  ),
                ),
              );
            },
            child: const Text('Suivi complet'),
          ),
        if (type == 'MOVING' &&
            status == 'COMPLETED' &&
            id.isNotEmpty &&
            (live?['paymentReady'] == true || item['paymentReady'] == true) &&
            live?['isPaid'] != true &&
            item['isPaid'] != true)
          FilledButton(
            onPressed: () {
              Navigator.pop(ctx);
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => PaymentScreen(
                    serviceType: 'MOVING',
                    serviceId: id,
                    amountCdf: live?['passengerTotalCdf'] as int? ??
                        live?['estimatedPriceCdf'] as int? ??
                        item['priceCdf'] as int? ??
                        0,
                    completionPin: live?['completionPin']?.toString(),
                  ),
                ),
              );
            },
            child: const Text('Payer'),
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
        if (type == 'SCHEDULED' &&
            status == 'COMPLETED' &&
            id.isNotEmpty &&
            (live?['paymentReady'] == true || item['paymentReady'] == true) &&
            live?['isPaid'] != true &&
            item['isPaid'] != true)
          FilledButton(
            onPressed: () {
              Navigator.pop(ctx);
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => PaymentScreen(
                    serviceType: 'SCHEDULED',
                    serviceId: id,
                    amountCdf: live?['estimatedPriceCdf'] as int? ??
                        live?['priceCdf'] as int? ??
                        item['priceCdf'] as int? ??
                        0,
                    completionPin: live?['completionPin']?.toString(),
                  ),
                ),
              );
            },
            child: const Text('Payer'),
          ),
        if (type == 'CARPOOL' &&
            status == 'COMPLETED' &&
            meta['role'] == 'passenger' &&
            (live?['paymentReady'] == true || item['paymentReady'] == true) &&
            live?['isPaid'] != true &&
            item['isPaid'] != true)
          FilledButton(
            onPressed: () {
              final paymentRef =
                  live?['paymentReferenceId']?.toString() ?? meta['paymentReferenceId']?.toString() ?? id;
              final seats = live?['mySeats'] as int? ?? meta['seats'] as int? ?? 1;
              final perSeat = live?['pricePerSeatCdf'] as int? ?? 0;
              Navigator.pop(ctx);
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => PaymentScreen(
                    serviceType: 'CARPOOL',
                    serviceId: paymentRef,
                    amountCdf: live?['myTotalCdf'] as int? ??
                        item['priceCdf'] as int? ??
                        (perSeat * seats),
                  ),
                ),
              );
            },
            child: const Text('Payer'),
          ),
        if (type == 'RENTAL' &&
            status == 'RETURNED' &&
            id.isNotEmpty &&
            (live?['paymentReady'] == true || item['paymentReady'] == true) &&
            live?['isPaid'] != true &&
            item['isPaid'] != true)
          FilledButton(
            onPressed: () {
              Navigator.pop(ctx);
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => PaymentScreen(
                    serviceType: 'RENTAL',
                    serviceId: id,
                    amountCdf: live?['totalCdf'] as int? ??
                        live?['priceCdf'] as int? ??
                        live?['passengerTotalCdf'] as int? ??
                        item['priceCdf'] as int? ??
                        0,
                    completionPin: live?['completionPin']?.toString(),
                  ),
                ),
              );
            },
            child: const Text('Payer'),
          ),
        if (type == 'SCHEDULED' &&
            status == 'IN_PROGRESS' &&
            (live?['linkedRideId'] ?? live?['rideId'])?.toString().isNotEmpty == true)
          FilledButton(
            onPressed: () {
              final trackId = (live?['linkedRideId'] ?? live?['rideId']).toString();
              Navigator.pop(ctx);
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => TrackingScreen(
                    rideId: trackId,
                    estimatedFareCdf: item['priceCdf'] as int? ?? live?['estimatedPriceCdf'] as int? ?? 0,
                  ),
                ),
              );
            },
            child: const Text('Suivre en direct'),
          ),
        if (historyItemHasReceipt(item))
          FilledButton.icon(
            onPressed: () {
              Navigator.pop(ctx);
              final billingType = historyToBillingType(type);
              if (billingType == 'RIDE') {
                Navigator.push(context, MaterialPageRoute(builder: (_) => ReceiptScreen(rideId: id)));
              } else {
                Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => ReceiptScreen(serviceType: billingType, serviceId: id)),
                );
              }
            },
            icon: const Icon(Icons.receipt_long),
            label: const Text('Voir le reçu'),
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

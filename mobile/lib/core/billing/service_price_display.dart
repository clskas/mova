import 'package:flutter/material.dart';

import '../config/market_config.dart';
import '../theme/mova_colors.dart';
import '../widgets/mova_widgets.dart';
import 'driver_earnings_display.dart';

/// Affichage des montants style Glovo / Uber Eats — passager vs livreur.
class ServicePriceDisplay {
  ServicePriceDisplay._();

  static int totalForPassenger(Map<String, dynamic>? data) {
    if (data == null) return 0;
    return (data['passengerTotalCdf'] as int?) ??
        (data['finalFareCdf'] as int?) ??
        (data['estimatedFareCdf'] as int?) ??
        (data['totalPriceCdf'] as int?) ??
        (data['priceCdf'] as int?) ??
        (data['finalPriceCdf'] as int?) ??
        (data['estimatedPriceCdf'] as int?) ??
        0;
  }

  static Widget passengerCard(
    Map<String, dynamic>? data, {
    String totalLabel = 'Total à payer',
    int? seats,
  }) {
    if (data == null) return const SizedBox.shrink();
    final type = data['type']?.toString().toUpperCase();
    if (type == 'FOOD') {
      return _foodPassengerCard(data, totalLabel: totalLabel);
    }
    if (type == 'ERRAND') {
      return _errandPassengerCard(data, totalLabel: totalLabel);
    }
    if (type == 'MOVING') {
      return _movingPassengerCard(data, totalLabel: totalLabel);
    }
    if (type == 'CARPOOL') {
      return _carpoolPassengerCard(data, totalLabel: totalLabel, seats: seats);
    }
    if (type == 'SCHEDULED' || data['estimatedFareCdf'] != null) {
      return _ridePassengerCard(data, totalLabel: totalLabel);
    }
    return _simplePassengerCard(data, totalLabel: totalLabel);
  }

  static Widget movingEstimateCard(Map<String, dynamic> data) {
    final breakdown = data['priceBreakdown'] is Map
        ? Map<String, dynamic>.from(data['priceBreakdown'] as Map)
        : <String, dynamic>{
            if (data['transportFareCdf'] != null) 'transportFareCdf': data['transportFareCdf'],
            if (data['volumeFeeCdf'] != null) 'volumeFeeCdf': data['volumeFeeCdf'],
            if (data['serviceBaseFeeCdf'] != null) 'baseFareCdf': data['serviceBaseFeeCdf'],
            if (data['vehicleSurchargeCdf'] != null) 'weightSurchargeCdf': data['vehicleSurchargeCdf'],
          };
    return estimateCard(
      totalCdf: data['estimatedPriceCdf'] as int? ?? data['passengerTotalCdf'] as int? ?? 0,
      discountCdf: data['discountCdf'] as int?,
      priceBreakdown: breakdown.isEmpty ? null : breakdown,
      totalLabel: 'Total estimé',
    );
  }

  static Widget carpoolBookingCard({
    required int pricePerSeatCdf,
    required int seats,
    String totalLabel = 'Total réservation',
  }) {
    return passengerCard(
      {
        'type': 'CARPOOL',
        'pricePerSeatCdf': pricePerSeatCdf,
      },
      totalLabel: totalLabel,
      seats: seats,
    );
  }

  static Widget driverMissionCard(Map<String, dynamic> data) {
    final type = data['type']?.toString().toUpperCase();
    final net = DriverEarningsDisplay.netFromMap(data);
    final serviceFee = data['serviceFeeCdf'] as int? ?? data['estimatedPriceCdf'] as int? ?? 0;
    final purchase = data['purchaseTotalCdf'] as int? ?? 0;

    return MovaCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            net != null ? MarketConfig.formatCdf(net) : '—',
            style: const TextStyle(
              fontWeight: FontWeight.bold,
              color: MovaColors.green,
              fontSize: 22,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            DriverEarningsDisplay.serviceNetLabel(data: data, type: type),
            style: const TextStyle(color: MovaColors.textSecondary, fontSize: 12),
          ),
          if (type == 'FOOD' && data['driverGrossCdf'] is num) ...[
            const SizedBox(height: 8),
            Text(
              'Base frais livraison : ${MarketConfig.formatCdf((data['driverGrossCdf'] as num).round())}',
              style: const TextStyle(color: MovaColors.textSecondary, fontSize: 12),
            ),
          ],
          if (type == 'ERRAND' && (serviceFee > 0 || purchase > 0)) ...[
            const SizedBox(height: 8),
            if (serviceFee > 0)
              Text(
                'Frais de course : ${MarketConfig.formatCdf(serviceFee)}',
                style: const TextStyle(color: MovaColors.textSecondary, fontSize: 12),
              ),
            if (purchase > 0)
              Text(
                'Achats à rembourser : ${MarketConfig.formatCdf(purchase)}',
                style: const TextStyle(color: MovaColors.textSecondary, fontSize: 12),
              ),
          ],
        ],
      ),
    );
  }

  static Widget estimateCard({
    required int totalCdf,
    int? itemsSubtotalCdf,
    int? deliveryFeeCdf,
    int? discountCdf,
    Map<String, dynamic>? priceBreakdown,
    String totalLabel = 'Total estimé',
  }) {
    final rows = <Widget>[];
    if (itemsSubtotalCdf != null && itemsSubtotalCdf > 0) {
      rows.add(_row('Articles', itemsSubtotalCdf));
    }
    if (deliveryFeeCdf != null && deliveryFeeCdf > 0) {
      rows.add(_row('Frais de livraison', deliveryFeeCdf));
    }
    if (priceBreakdown != null) {
      final transport = priceBreakdown['transportFareCdf'] as int?;
      final volume = priceBreakdown['volumeFeeCdf'] as int?;
      final base = priceBreakdown['baseFareCdf'] as int?;
      final distance = priceBreakdown['distanceFareCdf'] as int?;
      final duration = priceBreakdown['durationFareCdf'] as int?;
      final weight = priceBreakdown['weightSurchargeCdf'] as int?;
      if (transport != null && transport > 0) rows.add(_row('Transport', transport));
      if (volume != null && volume > 0) rows.add(_row('Volume', volume));
      if (base != null && base > 0) rows.add(_row('Prise en charge', base));
      if (distance != null && distance > 0) rows.add(_row('Distance', distance));
      if (duration != null && duration > 0) rows.add(_row('Durée', duration));
      if (weight != null && weight > 0) rows.add(_row('Véhicule / taille', weight));
    }
    if (discountCdf != null && discountCdf > 0) {
      rows.add(_row('Réduction', -discountCdf, valueColor: MovaColors.green));
    }

    return MovaCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (rows.isNotEmpty) ...rows,
          if (rows.isNotEmpty) const Divider(height: 16),
          Row(
            children: [
              Expanded(
                child: Text(totalLabel, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
              ),
              const SizedBox(width: 8),
              Flexible(
                child: Text(
                  MarketConfig.formatCdf(totalCdf),
                  style: const TextStyle(
                    fontWeight: FontWeight.bold,
                    color: MovaColors.green,
                    fontSize: 16,
                  ),
                  textAlign: TextAlign.end,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  static Widget _foodPassengerCard(Map<String, dynamic> data, {required String totalLabel}) {
    final items = data['itemsSubtotalCdf'] as int?;
    final deliveryFee = data['deliveryFeeCdf'] as int?;
    final discount = data['discountCdf'] as int?;
    final total = totalForPassenger(data);
    return estimateCard(
      totalCdf: total,
      itemsSubtotalCdf: items,
      deliveryFeeCdf: deliveryFee,
      discountCdf: discount,
      totalLabel: totalLabel,
    );
  }

  static Widget _errandPassengerCard(Map<String, dynamic> data, {required String totalLabel}) {
    final serviceFee = data['serviceFeeCdf'] as int? ?? data['estimatedPriceCdf'] as int? ?? 0;
    final actualPurchase = data['purchaseTotalCdf'] as int? ?? 0;
    final estimatedPurchase = data['estimatedPurchaseCdf'] as int? ?? 0;
    final purchase = actualPurchase > 0 ? actualPurchase : estimatedPurchase;
    final purchaseLabel = actualPurchase > 0 ? 'Achats réels (remboursement)' : 'Achats estimés';
    final total = data['totalPriceCdf'] as int? ?? (serviceFee + purchase);
    return MovaCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (serviceFee > 0) _row('Frais de course', serviceFee),
          if (purchase > 0) _row(purchaseLabel, purchase),
          if (serviceFee > 0 || purchase > 0) const Divider(height: 16),
          Row(
            children: [
              Expanded(
                child: Text(totalLabel, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
              ),
              const SizedBox(width: 8),
              Flexible(
                child: Text(
                  MarketConfig.formatCdf(total),
                  style: const TextStyle(fontWeight: FontWeight.bold, color: MovaColors.green, fontSize: 16),
                  textAlign: TextAlign.end,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  static Widget _movingPassengerCard(Map<String, dynamic> data, {required String totalLabel}) {
    final breakdown = data['priceBreakdown'] is Map
        ? Map<String, dynamic>.from(data['priceBreakdown'] as Map)
        : <String, dynamic>{
            if (data['transportFareCdf'] != null) 'transportFareCdf': data['transportFareCdf'],
            if (data['volumeFeeCdf'] != null) 'volumeFeeCdf': data['volumeFeeCdf'],
            if (data['serviceBaseFeeCdf'] != null) 'baseFareCdf': data['serviceBaseFeeCdf'],
          };
    return estimateCard(
      totalCdf: totalForPassenger(data),
      discountCdf: data['discountCdf'] as int?,
      priceBreakdown: breakdown.isEmpty ? null : breakdown,
      totalLabel: totalLabel,
    );
  }

  static Widget _ridePassengerCard(Map<String, dynamic> data, {required String totalLabel}) {
    return estimateCard(
      totalCdf: totalForPassenger(data),
      discountCdf: data['discountCdf'] as int?,
      priceBreakdown: data['baseFareCdf'] != null
          ? {
              'baseFareCdf': data['baseFareCdf'],
              'distanceFareCdf': data['distanceFareCdf'],
              'durationFareCdf': data['durationFareCdf'],
            }
          : null,
      totalLabel: totalLabel,
    );
  }

  static Widget _carpoolPassengerCard(
    Map<String, dynamic> data, {
    required String totalLabel,
    int? seats,
  }) {
    final perSeat = data['pricePerSeatCdf'] as int? ?? 0;
    final booked = seats ?? data['bookedSeats'] as int? ?? 1;
    final total = perSeat * booked;
    return MovaCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (perSeat > 0) _row('Prix par place', perSeat),
          if (booked > 1)
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Row(
                children: [
                  const Expanded(child: Text('Nombre de places', style: TextStyle(fontSize: 14))),
                  Text('$booked', style: const TextStyle(fontSize: 14)),
                ],
              ),
            ),
          if (perSeat > 0) const Divider(height: 16),
          Row(
            children: [
              Expanded(
                child: Text(
                  totalLabel,
                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                ),
              ),
              const SizedBox(width: 8),
              Flexible(
                child: Text(
                  MarketConfig.formatCdf(total > 0 ? total : totalForPassenger(data)),
                  style: const TextStyle(fontWeight: FontWeight.bold, color: MovaColors.green, fontSize: 16),
                  textAlign: TextAlign.end,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  static Widget _simplePassengerCard(Map<String, dynamic> data, {required String totalLabel}) {
    final total = totalForPassenger(data);
    final breakdown = data['priceBreakdown'] is Map
        ? Map<String, dynamic>.from(data['priceBreakdown'] as Map)
        : null;
    return estimateCard(
      totalCdf: total,
      discountCdf: data['discountCdf'] as int?,
      priceBreakdown: breakdown,
      totalLabel: totalLabel,
    );
  }

  static Widget _row(String label, int amountCdf, {Color? valueColor}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            flex: 3,
            child: Text(
              label,
              style: const TextStyle(fontSize: 13),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          const SizedBox(width: 8),
          Flexible(
            flex: 2,
            child: Text(
              MarketConfig.formatCdf(amountCdf.abs()) + (amountCdf < 0 ? '' : ''),
              style: TextStyle(
                fontSize: 13,
                color: valueColor ?? MovaColors.midnight,
              ),
              textAlign: TextAlign.end,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}

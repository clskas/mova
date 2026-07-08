import 'package:flutter/material.dart';

import '../chat/delivery_chat_screen.dart';
import '../chat/errand_chat_screen.dart';
import '../chat/rental_chat_screen.dart';
import '../chat/ride_chat_screen.dart';

String historyToBillingType(String? historyType) {
  switch (historyType) {
    case 'PARCEL':
    case 'FOOD':
    case 'EXPRESS':
      return 'DELIVERY';
    default:
      return historyType?.toUpperCase() ?? 'RIDE';
  }
}

bool historyItemHasReceipt(Map<String, dynamic> item) {
  final type = item['type']?.toString();
  final status = item['status']?.toString() ?? '';
  switch (type) {
    case 'RIDE':
      return status == 'COMPLETED' && item['isPaid'] == true;
    case 'PARCEL':
    case 'FOOD':
    case 'EXPRESS':
      return status == 'DELIVERED';
    case 'ERRAND':
      return status == 'COMPLETED';
    case 'MOVING':
      return status == 'COMPLETED' && item['isPaid'] == true;
    case 'RENTAL':
      return status == 'PAID' || (status == 'RETURNED' && item['isPaid'] == true);
    case 'SCHEDULED':
      return status == 'COMPLETED' && item['isPaid'] == true;
    case 'CARPOOL':
      return status == 'COMPLETED' && item['isPaid'] == true;
    default:
      return false;
  }
}

bool receiptSupportsChat(String referenceType) {
  const types = {'RIDE', 'ERRAND', 'DELIVERY', 'RENTAL', 'SCHEDULED'};
  return types.contains(referenceType.toUpperCase());
}

/// Ouvre l'écran de chat après un partage de reçu réussi.
void openBillingChat(
  BuildContext context,
  String referenceType,
  Map<String, dynamic> shareResult, {
  String? fallbackRideId,
}) {
  final channel = shareResult['channel']?.toString();
  switch (channel) {
    case 'ride_chat':
      final rideId = shareResult['rideId']?.toString() ?? fallbackRideId;
      if (rideId == null || rideId.isEmpty) return;
      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => RideChatScreen(
            rideId: rideId,
            myRole: 'passenger',
            peerLabel: 'Chauffeur',
          ),
        ),
      );
    case 'errand_chat':
      final errandId = shareResult['errandId']?.toString();
      if (errandId == null || errandId.isEmpty) return;
      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => ErrandChatScreen(
            errandId: errandId,
            myRole: 'passenger',
            peerLabel: 'Livreur',
          ),
        ),
      );
    case 'delivery_chat':
      final deliveryId = shareResult['deliveryId']?.toString();
      if (deliveryId == null || deliveryId.isEmpty) return;
      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => DeliveryChatScreen(
            deliveryId: deliveryId,
            myRole: 'passenger',
            peerLabel: 'Livreur',
          ),
        ),
      );
    case 'rental_chat':
      final inquiryId = shareResult['inquiryId']?.toString();
      if (inquiryId == null || inquiryId.isEmpty) return;
      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => RentalChatScreen(
            inquiryId: inquiryId,
            myRole: 'passenger',
            peerLabel: 'Loueur',
          ),
        ),
      );
    default:
      if (referenceType.toUpperCase() == 'RIDE' && fallbackRideId != null) {
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => RideChatScreen(
              rideId: fallbackRideId,
              myRole: 'passenger',
              peerLabel: 'Chauffeur',
            ),
          ),
        );
      }
  }
}

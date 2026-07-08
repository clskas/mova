/// Fusionne les champs paiement renvoyés à la racine de l'API livraison.
Map<String, dynamic> mergeDeliveryApiPayload(Map<String, dynamic> data) {
  final delivery = data['delivery'] as Map<String, dynamic>? ?? data;
  return {
    ...delivery,
    if (data['gpsTrace'] != null) 'gpsTrace': data['gpsTrace'],
    if (data['isPaid'] != null) 'isPaid': data['isPaid'],
    if (data['paymentStatus'] != null) 'paymentStatus': data['paymentStatus'],
    if (data['paymentMethod'] != null) 'paymentMethod': data['paymentMethod'],
    if (data['paymentReady'] != null) 'paymentReady': data['paymentReady'],
    if (data['passengerTotalCdf'] != null) 'passengerTotalCdf': data['passengerTotalCdf'],
    if (data['itemsSubtotalCdf'] != null) 'itemsSubtotalCdf': data['itemsSubtotalCdf'],
    if (data['deliveryFeeCdf'] != null) 'deliveryFeeCdf': data['deliveryFeeCdf'],
    if (data['discountCdf'] != null) 'discountCdf': data['discountCdf'],
    if (data['driverNetCdf'] != null) 'driverNetCdf': data['driverNetCdf'],
    if (data['driverGrossCdf'] != null) 'driverGrossCdf': data['driverGrossCdf'],
    if (data['serviceFeeCdf'] != null) 'serviceFeeCdf': data['serviceFeeCdf'],
    if (data['totalPriceCdf'] != null) 'totalPriceCdf': data['totalPriceCdf'],
    if (data['purchaseTotalCdf'] != null) 'purchaseTotalCdf': data['purchaseTotalCdf'],
  };
}

bool deliveryIsPaid(Map<String, dynamic>? delivery) => delivery?['isPaid'] == true;

bool deliveryCashPaymentPending(Map<String, dynamic>? delivery) =>
    !deliveryIsPaid(delivery) &&
    delivery?['paymentStatus']?.toString().toUpperCase() == 'PENDING' &&
    delivery?['paymentMethod']?.toString().toUpperCase() == 'CASH';

String paymentConfirmedMessage({String? method, bool isDelivery = true}) {
  final actor = isDelivery ? 'livreur' : 'chauffeur';
  if (method?.toUpperCase() == 'CASH') {
    return 'Paiement espèces confirmé par le $actor';
  }
  return 'Paiement confirmé';
}

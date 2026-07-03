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
      return status == 'COMPLETED';
    case 'RENTAL':
      return ['CONFIRMED', 'IN_PROGRESS', 'RETURNED', 'CLOSED'].contains(status);
    case 'SCHEDULED':
      return status == 'COMPLETED';
    case 'CARPOOL':
      return status == 'COMPLETED';
    default:
      return false;
  }
}

bool receiptSupportsChat(String referenceType) {
  const types = {'RIDE', 'ERRAND', 'DELIVERY', 'RENTAL', 'SCHEDULED'};
  return types.contains(referenceType.toUpperCase());
}

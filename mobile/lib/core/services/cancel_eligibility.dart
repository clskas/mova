/// Lecture de [canCancel] renvoyé par l'API, avec repli local si absent (mode démo).
class CancelEligibility {
  const CancelEligibility._();

  static bool fromMap(Map<String, dynamic>? data, {required bool fallback}) {
    if (data == null) return false;
    if (data.containsKey('canCancel')) return data['canCancel'] == true;
    return fallback;
  }

  static bool rental(Map<String, dynamic>? data) {
    return fromMap(data, fallback: _rentalFallback(data));
  }

  static bool _rentalFallback(Map<String, dynamic>? data) {
    if (data == null) return false;
    final status = data['status']?.toString().toUpperCase();
    if (status == null || {'CLOSED', 'RETURNED', 'IN_PROGRESS'}.contains(status)) return false;
    final startRaw = data['startDate']?.toString();
    if (startRaw == null) return true;
    try {
      return DateTime.now().isBefore(DateTime.parse(startRaw));
    } catch (_) {
      return true;
    }
  }

  static bool scheduled(Map<String, dynamic>? data) {
    return fromMap(data, fallback: _scheduledFallback(data));
  }

  static bool _scheduledFallback(Map<String, dynamic>? data) {
    if (data == null) return false;
    final status = data['status']?.toString().toUpperCase();
    if (status == null || {'CANCELLED', 'COMPLETED', 'IN_PROGRESS'}.contains(status)) return false;
    final at = data['scheduledAt']?.toString();
    if (at == null) return true;
    try {
      return DateTime.now().isBefore(DateTime.parse(at));
    } catch (_) {
      return true;
    }
  }

  static bool delivery(Map<String, dynamic>? data) {
    return fromMap(data, fallback: _deliveryFallback(data));
  }

  static bool _deliveryFallback(Map<String, dynamic>? data) {
    if (data == null) return false;
    final status = data['status']?.toString().toUpperCase();
    final type = data['type']?.toString().toUpperCase();
    if (status == null || status == 'CANCELLED' || status == 'DELIVERED' || status == 'IN_TRANSIT') {
      return false;
    }
    if (type == 'FOOD') {
      return status == 'PENDING';
    }
    if (type != 'FOOD' && status == 'PICKED_UP') return false;
    return status == 'PENDING' ||
        status == 'RESTAURANT_CONFIRMED' ||
        status == 'READY_FOR_PICKUP';
  }

  static bool errand(Map<String, dynamic>? data) {
    return fromMap(data, fallback: _statusOnlyFallback(data, blocked: {'COMPLETED', 'CANCELLED', 'IN_PROGRESS'}));
  }

  static bool moving(Map<String, dynamic>? data) {
    return fromMap(data, fallback: _statusOnlyFallback(data, blocked: {'COMPLETED', 'CANCELLED', 'IN_PROGRESS'}));
  }

  static bool carpool(Map<String, dynamic>? data) {
    return fromMap(data, fallback: _carpoolFallback(data));
  }

  static bool _carpoolFallback(Map<String, dynamic>? data) {
    if (data == null) return false;
    final status = data['status']?.toString().toUpperCase();
    if (status == null || status == 'CANCELLED' || status == 'COMPLETED' || status == 'IN_PROGRESS') {
      return false;
    }
    final departure = data['departureAt']?.toString();
    if (departure == null) return true;
    try {
      return DateTime.now().isBefore(DateTime.parse(departure));
    } catch (_) {
      return true;
    }
  }

  static bool ride(Map<String, dynamic>? data) {
    return fromMap(data, fallback: _rideFallback(data));
  }

  static bool _rideFallback(Map<String, dynamic>? data) {
    if (data == null) return false;
    final status = data['status']?.toString().toUpperCase();
    return status == 'REQUESTED' ||
        status == 'SEARCHING' ||
        status == 'ACCEPTED' ||
        status == 'DRIVER_ARRIVED';
  }

  static bool _statusOnlyFallback(Map<String, dynamic>? data, {required Set<String> blocked}) {
    if (data == null) return false;
    final status = data['status']?.toString().toUpperCase();
    if (status == null || blocked.contains(status)) return false;
    return true;
  }
}

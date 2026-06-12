abstract final class MockData {
  static Map<String, dynamic> otpRequest(String phone) => {
        'success': true,
        'message': 'Code OTP envoyé (mode démo)',
        'phone': phone,
        'mockCode': '123456',
      };

  static Map<String, dynamic> verifyOtp(String phone, String code, {String? role}) {
    if (code != '123456') {
      return {'success': false, 'message': 'Code invalide'};
    }
    final isDriver = role == 'DRIVER';
    return {
      'accessToken': 'mock-jwt-token',
      'user': {
        'id': isDriver ? 'driver-mock-1' : 'passenger-mock-1',
        'phone': phone,
        'role': isDriver ? 'DRIVER' : 'PASSENGER',
        'name': isDriver ? 'Jean Chauffeur' : 'Marie Passagère',
      },
    };
  }

  static Map<String, dynamic> estimate() => {
        'distanceKm': 3.2,
        'durationMin': 12,
        'estimatedFareCdf': 8500,
        'priceCdf': 8500,
        'currency': 'CDF',
      };

  static Map<String, dynamic> createRide(Map<String, dynamic> body) => {
        'id': 'ride-mock-${DateTime.now().millisecondsSinceEpoch}',
        'status': 'SEARCHING',
        ...body,
        'priceCdf': 8500,
      };

  static List<Map<String, dynamic>> rideHistory() => [
        {
          'id': 'ride-1',
          'status': 'COMPLETED',
          'pickupAddress': 'Gombe, Kinshasa',
          'dropoffAddress': 'Limete, Kinshasa',
          'priceCdf': 7500,
          'createdAt': DateTime.now().subtract(const Duration(days: 1)).toIso8601String(),
        },
        {
          'id': 'ride-2',
          'status': 'COMPLETED',
          'pickupAddress': 'Bandal, Kinshasa',
          'dropoffAddress': 'Kintambo, Kinshasa',
          'priceCdf': 12000,
          'createdAt': DateTime.now().subtract(const Duration(days: 3)).toIso8601String(),
        },
      ];

  static Map<String, dynamic> wallet() => {
        'balanceCdf': 45000,
        'currency': 'CDF',
      };

  static Map<String, dynamic> earnings() => {
        'todayCdf': 28500,
        'weekCdf': 142000,
        'monthCdf': 580000,
        'totalCdf': 1250000,
        'ridesToday': 8,
        'ridesWeek': 42,
      };
}

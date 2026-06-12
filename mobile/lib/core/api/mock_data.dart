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

  static List<Map<String, dynamic>> services() => [
        {'id': 'TAXI', 'name': 'Taxi / Moto-taxi', 'enabled': true},
        {'id': 'PARCEL', 'name': 'Livraison colis', 'enabled': true},
        {'id': 'WALLET', 'name': 'Wallet MOVA', 'enabled': true},
        {'id': 'HISTORY', 'name': 'Historique', 'enabled': true},
        {'id': 'SCHEDULED', 'name': 'Réservation planifiée', 'enabled': true},
        {'id': 'FOOD', 'name': 'Livraison repas', 'enabled': true},
        {'id': 'ERRANDS', 'name': 'Courses & commissions', 'enabled': true},
        {'id': 'CARPOOL', 'name': 'Covoiturage', 'enabled': true},
      ];

  static Map<String, dynamic> parcelEstimate(Map<String, dynamic> body) {
    final category = body['weightCategory']?.toString() ?? 'LIGHT';
    final base = switch (category) {
      'HEAVY' => 12000,
      'MEDIUM' => 8000,
      'VERY_HEAVY' => 18000,
      _ => 5000,
    };
    return {'estimatedPriceCdf': base, 'currency': 'CDF'};
  }

  static Map<String, dynamic> createParcel(Map<String, dynamic> body) => {
        'id': 'parcel-${DateTime.now().millisecondsSinceEpoch}',
        'status': 'CONFIRMED',
        'type': 'PARCEL',
        ...body,
        'priceCdf': parcelEstimate(body)['estimatedPriceCdf'],
      };

  static Map<String, dynamic> parcelTracking(String id) => {
        'id': id,
        'status': 'IN_TRANSIT',
        'pickupAddress': 'Gombe, Kinshasa',
        'dropoffAddress': 'Limete, Kinshasa',
        'timeline': [
          {'status': 'CONFIRMED', 'label': 'Commande confirmée', 'done': true},
          {'status': 'PICKUP', 'label': 'Enlèvement en cours', 'done': true},
          {'status': 'IN_TRANSIT', 'label': 'En transit', 'done': true},
          {'status': 'DELIVERED', 'label': 'Livré', 'done': false},
        ],
      };

  static List<Map<String, dynamic>> deliveryHistory() => [
        {
          'id': 'parcel-1',
          'type': 'PARCEL',
          'pickupAddress': 'Gombe, Kinshasa',
          'dropoffAddress': 'Masina, Kinshasa',
          'status': 'DELIVERED',
          'priceCdf': 8000,
          'createdAt': DateTime.now().subtract(const Duration(days: 2)).toIso8601String(),
        },
        {
          'id': 'food-1',
          'type': 'FOOD',
          'restaurantName': 'Chez Mamou',
          'deliveryAddress': 'Bandal, Kinshasa',
          'status': 'DELIVERED',
          'priceCdf': 18500,
          'createdAt': DateTime.now().subtract(const Duration(days: 1)).toIso8601String(),
        },
      ];

  static List<Map<String, dynamic>> restaurants() => [
        {
          'id': 'rest-1',
          'name': 'Chez Mamou',
          'cuisine': 'Congolais',
          'rating': 4.6,
          'deliveryMinCdf': 3500,
          'items': [
            {'id': 'item-1', 'name': 'Poulet moambe', 'priceCdf': 8500},
            {'id': 'item-2', 'name': 'Fumbwa', 'priceCdf': 6000},
            {'id': 'item-3', 'name': 'Liboke poisson', 'priceCdf': 9500},
          ],
        },
        {
          'id': 'rest-2',
          'name': 'Le Jardin',
          'cuisine': 'Grillades',
          'rating': 4.4,
          'deliveryMinCdf': 4000,
          'items': [
            {'id': 'item-4', 'name': 'Brochettes bœuf', 'priceCdf': 7000},
            {'id': 'item-5', 'name': 'Poisson braisé', 'priceCdf': 11000},
          ],
        },
        {
          'id': 'rest-3',
          'name': 'Snack Express',
          'cuisine': 'Fast-food',
          'rating': 4.2,
          'deliveryMinCdf': 2500,
          'items': [
            {'id': 'item-6', 'name': 'Burger MOVA', 'priceCdf': 5500},
            {'id': 'item-7', 'name': 'Frites + soda', 'priceCdf': 4500},
          ],
        },
      ];

  static Map<String, dynamic> createFoodOrder(Map<String, dynamic> body) {
    final items = body['items'] as List? ?? [];
    final subtotal = items.fold<int>(0, (sum, item) {
      final map = item as Map<String, dynamic>;
      return sum + ((map['priceCdf'] as int? ?? 0) * (map['quantity'] as int? ?? 1));
    });
    return {
      'id': 'food-${DateTime.now().millisecondsSinceEpoch}',
      'status': 'CONFIRMED',
      'type': 'FOOD',
      ...body,
      'priceCdf': subtotal + 3500,
    };
  }

  static Map<String, dynamic> scheduledRideEstimate(Map<String, dynamic> body) => {
        'estimatedPriceCdf': body['vehicleType'] == 'COMFORT' ? 15000 : 9500,
        'currency': 'CDF',
      };

  static Map<String, dynamic> createScheduledRide(Map<String, dynamic> body) => {
        'id': 'sched-${DateTime.now().millisecondsSinceEpoch}',
        'status': 'CONFIRMED',
        'type': 'SCHEDULED',
        ...body,
        'priceCdf': scheduledRideEstimate(body)['estimatedPriceCdf'],
      };

  static List<Map<String, dynamic>> scheduledRides() => [
        {
          'id': 'sched-1',
          'status': 'CONFIRMED',
          'type': 'SCHEDULED',
          'dropoffAddress': 'Aéroport N\'Djili',
          'vehicleType': 'STANDARD',
          'scheduledAt': DateTime.now().add(const Duration(days: 2)).toIso8601String(),
          'priceCdf': 25000,
        },
      ];

  static Map<String, dynamic> errandEstimate(Map<String, dynamic> body) {
    final items = body['items'] as List? ?? [];
    final base = 4000 + (items.length * 1500);
    return {'estimatedPriceCdf': base, 'currency': 'CDF'};
  }

  static Map<String, dynamic> createErrand(Map<String, dynamic> body) => {
        'id': 'errand-${DateTime.now().millisecondsSinceEpoch}',
        'status': 'CONFIRMED',
        'type': 'ERRAND',
        ...body,
        'priceCdf': errandEstimate(body)['estimatedPriceCdf'],
      };

  static List<Map<String, dynamic>> errandHistory() => [
        {
          'id': 'errand-1',
          'type': 'ERRAND',
          'deliveryAddress': 'Bandal, Kinshasa',
          'items': ['Riz 5 kg', 'Huile', 'Savon'],
          'status': 'DELIVERED',
          'priceCdf': 8500,
          'createdAt': DateTime.now().subtract(const Duration(days: 4)).toIso8601String(),
        },
      ];

  static List<Map<String, dynamic>> carpoolRides() => [
        {
          'id': 'carpool-1',
          'fromAddress': 'Gombe, Kinshasa',
          'toAddress': 'Limete, Kinshasa',
          'driverName': 'Paul M.',
          'availableSeats': 2,
          'totalPriceCdf': 12000,
        },
        {
          'id': 'carpool-2',
          'fromAddress': 'Kinshasa Centre',
          'toAddress': 'Aéroport N\'Djili',
          'driverName': 'Grace K.',
          'availableSeats': 3,
          'totalPriceCdf': 45000,
        },
      ];

  static Map<String, dynamic> carpoolEstimate(Map<String, dynamic> body) {
    final seats = body['seats'] as int? ?? 3;
    final total = 15000 + (seats * 2000);
    return {
      'totalPriceCdf': total,
      'pricePerSeatCdf': (total / seats).ceil(),
      'currency': 'CDF',
    };
  }

  static Map<String, dynamic> createCarpoolRide(Map<String, dynamic> body) => {
        'id': 'carpool-${DateTime.now().millisecondsSinceEpoch}',
        'status': 'OPEN',
        'type': 'CARPOOL',
        ...body,
        'driverName': 'Vous',
      };
}

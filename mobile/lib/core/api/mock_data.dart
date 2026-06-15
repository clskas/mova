import '../config/market_config.dart';

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

  static Map<String, dynamic> estimate([Map<String, dynamic>? body]) {
    final vehicleType = body?['vehicleType']?.toString() ?? 'MOTO_TAXI';
    final distanceKm = 3.2;
    final durationMin = 12.0;
    final base = switch (vehicleType) {
      'VIP' => 8000,
      'COMFORT' => 5000,
      'STANDARD' => 3000,
      _ => 1500,
    };
    final distanceFare = switch (vehicleType) {
      'VIP' => 9000,
      'COMFORT' => 8000,
      'STANDARD' => 4800,
      _ => 2560,
    };
    final durationFare = switch (vehicleType) {
      'VIP' => 3600,
      'COMFORT' => 3600,
      'STANDARD' => 2400,
      _ => 1200,
    };
    final multiplier = _isPeakHour() ? 1.3 : 1.0;
    final subtotal = ((base + distanceFare + durationFare) * multiplier).ceil();
    final total = vehicleType == 'MOTO_TAXI' ? subtotal.clamp(2000, 999999) : subtotal;
    return {
      'distanceKm': distanceKm,
      'durationMin': durationMin,
      'vehicleType': vehicleType,
      'baseFareCdf': base,
      'distanceFareCdf': distanceFare,
      'durationFareCdf': durationFare,
      'surchargeMultiplier': multiplier,
      'estimatedFareCdf': total,
      'estimatedPriceCdf': total,
      'priceCdf': total,
      'currency': 'CDF',
      'peakHourLabel': multiplier > 1.0 ? 'Heure de pointe' : null,
      'formatted': '${total.toString().replaceAllMapped(RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'), (m) => '${m[1]} ')} FC',
    };
  }

  static bool _isPeakHour() {
    final hour = DateTime.now().hour;
    return (hour >= 7 && hour < 9) || (hour >= 17 && hour < 19);
  }

  static List<Map<String, dynamic>> geoAutocomplete(String query) {
    final q = query.toLowerCase().trim();
    if (q.isEmpty) return [];
    return MarketConfig.kinshasaDistricts
        .where((c) => c.toLowerCase().contains(q))
        .take(8)
        .map((name) => {
              'label': '$name, Kinshasa',
              'address': '$name, Kinshasa',
              'lat': MarketConfig.defaultLat - (name.hashCode % 100) / 10000,
              'lng': MarketConfig.defaultLng + (name.hashCode % 100) / 10000,
            })
        .toList();
  }

  static List<Map<String, dynamic>> communes() =>
      MarketConfig.kinshasaDistricts
          .map((name) => {'name': name, 'city': 'Kinshasa'})
          .toList();

  static Map<String, dynamic> createRide(Map<String, dynamic> body) => {
        'id': 'ride-mock-${DateTime.now().millisecondsSinceEpoch}',
        'status': 'SEARCHING',
        ...body,
        'estimatedFareCdf': estimate(body)['estimatedFareCdf'],
        'priceCdf': estimate(body)['estimatedFareCdf'],
        'distanceKm': 3.2,
        'durationMin': 12,
      };

  static Map<String, dynamic> searchDrivers(String rideId) => {
        'rideId': rideId,
        'attempt': 0,
        'radiusKm': 3,
        'driversFound': 2,
        'drivers': [
          {
            'id': 'driver-mock-1',
            'name': 'Jean Kabila',
            'rating': 4.8,
            'vehicleType': 'MOTO_TAXI',
            'plateNumber': 'KIN-4521',
            'distanceKm': 0.8,
          },
        ],
      };

  static Map<String, dynamic> rideDetail(String rideId) => {
        'id': rideId,
        'status': 'ACCEPTED',
        'vehicleType': 'MOTO_TAXI',
        'pickupAddress': 'Gombe, Kinshasa',
        'dropoffAddress': 'Limete, Kinshasa',
        'pickupLat': MarketConfig.defaultLat,
        'pickupLng': MarketConfig.defaultLng,
        'dropoffLat': MarketConfig.defaultLat - 0.03,
        'dropoffLng': MarketConfig.defaultLng + 0.04,
        'estimatedFareCdf': 8500,
        'finalFareCdf': 8500,
        'distanceKm': 3.2,
        'durationMin': 12,
        'driver': {
          'id': 'driver-mock-1',
          'name': 'Jean Kabila',
          'rating': 4.8,
          'phone': '+243812345678',
          'vehicleType': 'Moto-taxi',
          'plateNumber': 'KIN-4521',
          'vehicleModel': 'Honda Ace',
        },
      };

  static Map<String, dynamic> cancelRide(String rideId, {String? reason}) => {
        'ride': {
          'id': rideId,
          'status': 'CANCELLED',
          'cancelReason': reason,
        },
        'cancellationFeeCdf': 0,
        'policyMessage':
            'Annulation gratuite avant l\'arrivée du chauffeur. Frais de 2 000 FC après acceptation.',
      };

  static Map<String, dynamic> payRide(String rideId, Map<String, dynamic> body) => {
        'success': true,
        'rideId': rideId,
        'method': body['method'] ?? 'WALLET',
        'amountCdf': body['amountCdf'] ?? 8500,
        'status': 'COMPLETED',
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
        'transactions': walletTransactions(),
      };

  static List<Map<String, dynamic>> walletTransactions() => [
        {
          'id': 'tx-1',
          'type': 'CREDIT',
          'amountCdf': 20000,
          'description': 'Recharge Orange Money',
          'createdAt': DateTime.now().subtract(const Duration(days: 1)).toIso8601String(),
        },
        {
          'id': 'tx-2',
          'type': 'DEBIT',
          'amountCdf': -8500,
          'description': 'Paiement course ride-1',
          'createdAt': DateTime.now().subtract(const Duration(days: 2)).toIso8601String(),
        },
        {
          'id': 'tx-3',
          'type': 'CREDIT',
          'amountCdf': 33500,
          'description': 'Recharge M-Pesa',
          'createdAt': DateTime.now().subtract(const Duration(days: 5)).toIso8601String(),
        },
      ];

  static Map<String, dynamic> walletTopUp(Map<String, dynamic> body) {
    final amount = body['amountCdf'] as int? ?? 0;
    return {
      'success': true,
      'message': 'Recharge de $amount FC en cours (${body['provider'] ?? 'MOBILE_MONEY'})',
      'amountCdf': amount,
      'balanceCdf': 45000 + amount,
    };
  }

  static Map<String, dynamic> earnings() => {
        'todayCdf': 28500,
        'weekCdf': 142000,
        'monthCdf': 580000,
        'totalCdf': 1250000,
        'rideCount': 42,
      };

  static Map<String, dynamic> driverProfile() => {
        'userId': 'mock-driver',
        'kycStatus': 'APPROVED',
        'isAvailable': false,
        'ratingAvg': 4.8,
        'totalRides': 120,
        'vehicles': [
          {'id': 'veh-mock-1', 'type': 'STANDARD', 'make': 'Toyota', 'model': 'Corolla', 'plateNumber': 'KIN-1234', 'isActive': true},
        ],
      };

  static List<Map<String, dynamic>> driverOffers() => [
        {
          'id': 'mock-offer-1',
          'pickupAddress': 'Gombe, Kinshasa',
          'dropoffAddress': 'Limete',
          'estimatedFareCdf': 8500,
          'distanceKm': 3.2,
          'vehicleType': 'STANDARD',
          'status': 'MATCHING',
        },
      ];

  static List<Map<String, dynamic>> deliveryOffers() => [
        {
          'id': 'mock-delivery-1',
          'offerType': 'DELIVERY',
          'type': 'FOOD',
          'restaurantName': 'Chez Mamou',
          'pickupAddress': 'Gombe',
          'dropoffAddress': 'Bandal',
          'estimatedPriceCdf': 18500,
          'distanceKm': 2.1,
          'status': 'PENDING',
        },
        {
          'id': 'mock-delivery-2',
          'offerType': 'DELIVERY',
          'type': 'PARCEL',
          'pickupAddress': 'Limete',
          'dropoffAddress': 'Masina',
          'estimatedPriceCdf': 8000,
          'distanceKm': 4.5,
          'status': 'PENDING',
        },
      ];

  static List<Map<String, dynamic>> services() => [
        {'id': 'TAXI', 'name': 'Taxi / Moto-taxi', 'enabled': true},
        {'id': 'PARCEL', 'name': 'Livraison colis', 'enabled': true},
        {'id': 'WALLET', 'name': 'Wallet MOVA', 'enabled': true},
        {'id': 'HISTORY', 'name': 'Historique', 'enabled': true},
        {'id': 'SCHEDULED', 'name': 'Réservation planifiée', 'enabled': true},
        {'id': 'FOOD', 'name': 'Livraison repas', 'enabled': true},
        {'id': 'ERRANDS', 'name': 'Courses & commissions', 'enabled': true},
        {'id': 'CARPOOL', 'name': 'Covoiturage', 'enabled': true},
        {'id': 'EXPRESS', 'name': 'Livraison express', 'enabled': true},
        {'id': 'RENTAL', 'name': 'Location véhicule', 'enabled': true},
        {'id': 'MOVING', 'name': 'Déménagement', 'enabled': true},
      ];

  static Map<String, dynamic> parcelEstimate(Map<String, dynamic> body) {
    final category = body['weightCategory']?.toString() ?? 'DOCUMENTS';
    final base = switch (category) {
      'LARGE' => 12000,
      'MEDIUM' => 8000,
      'SMALL' => 6000,
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
        'estimatedPriceCdf': estimate({'vehicleType': body['vehicleType'] ?? 'STANDARD'})['estimatedFareCdf'],
        'currency': 'CDF',
      };

  static Map<String, dynamic> scheduledEstimate(Map<String, dynamic> body) =>
      scheduledRideEstimate(body);

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
    final desc = body['description']?.toString() ?? '';
    final base = 4000 + (desc.length > 20 ? 3000 : 1500);
    return {'estimatedPriceCdf': base, 'currency': 'CDF', 'errandFeeCdf': 2500};
  }

  static Map<String, dynamic> createErrand(Map<String, dynamic> body) => {
        'id': 'errand-${DateTime.now().millisecondsSinceEpoch}',
        'status': 'PENDING',
        'type': 'ERRAND',
        ...body,
        'estimatedPriceCdf': errandEstimate(body)['estimatedPriceCdf'],
        'priceCdf': errandEstimate(body)['estimatedPriceCdf'],
      };

  static Map<String, dynamic> errandDetail(String id) => {
        'id': id,
        'status': 'IN_PROGRESS',
        'description': 'Riz, Pain, Savon',
        'dropoffAddress': 'Ma position, Kinshasa',
        'estimatedPriceCdf': 8500,
        'timeline': [
          {'label': 'Commande reçue', 'done': true},
          {'label': 'Achats en cours', 'done': true},
          {'label': 'Livreur en route', 'done': false},
          {'label': 'Livré', 'done': false},
        ],
      };

  static Map<String, dynamic> foodEstimate(Map<String, dynamic> body) {
    final items = body['items'] as List? ?? [];
    final subtotal = items.fold<int>(0, (sum, item) {
      final map = item as Map<String, dynamic>;
      return sum +
          ((map['unitPriceCdf'] as int? ?? 0) * (map['quantity'] as int? ?? 1));
    });
    return {
      'estimatedPriceCdf': subtotal + 3500,
      'itemsSubtotalCdf': subtotal,
      'deliveryFeeCdf': 3500,
      'currency': 'CDF',
    };
  }

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

  static List<Map<String, dynamic>> unifiedHistory() => [
        {
          'type': 'RIDE',
          'id': 'ride-1',
          'status': 'COMPLETED',
          'title': 'Gombe → Bandal',
          'priceCdf': 8500,
          'createdAt': DateTime.now().subtract(const Duration(days: 1)).toIso8601String(),
        },
        ...errandHistory().map((e) => {
              'type': 'ERRAND',
              'id': e['id'],
              'status': e['status'],
              'title': e['deliveryAddress'],
              'priceCdf': e['priceCdf'],
              'createdAt': e['createdAt'],
              'meta': {'items': e['items']},
            }),
        ...deliveryHistory().map((d) => {
              'type': d['type'],
              'id': d['id'],
              'status': d['status'],
              'title': d['type'] == 'FOOD'
                  ? (d['restaurantName'] ?? 'Repas')
                  : '${d['pickupAddress']} → ${d['dropoffAddress']}',
              'priceCdf': d['priceCdf'],
              'createdAt': d['createdAt'],
              'meta': d,
            }),
        {
          'type': 'SCHEDULED',
          'id': 'sched-1',
          'status': 'CONFIRMED',
          'title': 'Limete → Kintambo',
          'priceCdf': 12000,
          'createdAt': DateTime.now().add(const Duration(days: 1)).toIso8601String(),
          'meta': {'scheduledAt': DateTime.now().add(const Duration(days: 1)).toIso8601String()},
        },
      ];

  static List<Map<String, dynamic>> rentalVehicles() => [
        {
          'id': '00000000-0000-4000-a000-000000000001',
          'name': 'Toyota Corolla',
          'category': 'ECONOMY',
          'seats': 4,
          'dailyRateCdf': 45000,
          'depositCdf': 150000,
        },
        {
          'id': '00000000-0000-4000-a000-000000000002',
          'name': 'Toyota RAV4',
          'category': 'SUV',
          'seats': 5,
          'dailyRateCdf': 85000,
          'depositCdf': 250000,
        },
      ];

  static List<Map<String, dynamic>> carpoolRides() => [
        {
          'id': 'carpool-1',
          'fromAddress': 'Gombe, Kinshasa',
          'toAddress': 'Limete, Kinshasa',
          'driverName': 'Paul M.',
          'availableSeats': 2,
          'pricePerSeatCdf': 3000,
          'totalPriceCdf': 12000,
          'departureAt': DateTime.now().add(const Duration(hours: 4)).toIso8601String(),
          'passengerCount': 1,
          'passengers': [
            {'id': 'p1', 'userId': 'user-abc', 'seats': 1, 'label': 'Passager abc'},
          ],
        },
        {
          'id': 'carpool-2',
          'fromAddress': 'Kinshasa Centre',
          'toAddress': 'Aéroport N\'Djili',
          'driverName': 'Grace K.',
          'availableSeats': 3,
          'pricePerSeatCdf': 15000,
          'totalPriceCdf': 45000,
          'departureAt': DateTime.now().add(const Duration(days: 1)).toIso8601String(),
          'passengerCount': 0,
          'passengers': [],
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
        'seatsAvailable': body['seatsTotal'] ?? body['seats'] ?? 3,
        'pricePerSeatCdf': body['pricePerSeatCdf'] ?? 5000,
        ...body,
        'driverName': 'Vous',
      };

  static Map<String, dynamic> expressEstimate(Map<String, dynamic> body) => {
        'estimatedPriceCdf': 7500,
        'currency': 'CDF',
        'etaMin': 35,
      };

  static Map<String, dynamic> createExpress(Map<String, dynamic> body) => {
        'id': 'express-${DateTime.now().millisecondsSinceEpoch}',
        'status': 'CONFIRMED',
        'type': 'PARCEL',
        ...body,
        'priceCdf': 7500,
      };

  static Map<String, dynamic> rentalEstimate(Map<String, dynamic> body) {
    final start = DateTime.parse(body['startDate']?.toString() ?? DateTime.now().toIso8601String());
    final end = DateTime.parse(body['endDate']?.toString() ?? start.add(const Duration(days: 1)).toIso8601String());
    final days = end.difference(start).inDays.clamp(1, 30);
    final daily = switch (body['vehicleType']?.toString()) {
      'MINIBUS' => 120000,
      'PICKUP' => 95000,
      'SUV' => 85000,
      _ => 45000,
    };
    return {'estimatedPriceCdf': daily * days, 'estimatedTotalCdf': daily * days, 'days': days, 'currency': 'CDF'};
  }

  static List<Map<String, dynamic>> rentalInquiries() => [
        {
          'id': 'rental-1',
          'vehicleType': 'SUV',
          'status': 'PENDING',
          'startDate': DateTime.now().add(const Duration(days: 3)).toIso8601String(),
          'endDate': DateTime.now().add(const Duration(days: 5)).toIso8601String(),
          'pickupAddress': 'Gombe, Kinshasa',
        },
      ];

  static Map<String, dynamic> createRentalInquiry(Map<String, dynamic> body) {
    final estimate = rentalEstimate(body);
    return {
      'inquiry': {
        'id': 'rental-${DateTime.now().millisecondsSinceEpoch}',
        'status': 'PENDING',
        ...body,
        'estimatedTotalCdf': estimate['estimatedTotalCdf'],
      },
      'message': 'Demande enregistrée. Un conseiller MOVA vous contactera sous 24h.',
    };
  }

  static Map<String, dynamic> movingEstimate(Map<String, dynamic> body) {
    final base = switch (body['volumeCategory']?.toString()) {
      'HOUSE' => 350000,
      'OFFICE' => 450000,
      'STUDIO' => 120000,
      _ => 220000,
    };
    final items = (body['items'] as List? ?? []).length;
    return {'estimatedPriceCdf': base + (items * 5000), 'currency': 'CDF'};
  }

  static Map<String, dynamic> createMovingRequest(Map<String, dynamic> body) {
    final estimate = movingEstimate(body);
    final id = 'moving-${DateTime.now().millisecondsSinceEpoch}';
    final request = {
      'id': id,
      'status': 'PENDING',
      ...body,
      'estimatedPriceCdf': estimate['estimatedPriceCdf'],
    };
    return {
      'request': request,
      'moving': request,
      'message': 'Demande de déménagement enregistrée.',
    };
  }

  static Map<String, dynamic> movingDetail(String id) => {
        'id': id,
        'status': 'PENDING',
        'pickupAddress': 'Bandal, Kinshasa',
        'dropoffAddress': 'Gombe, Kinshasa',
        'volumeM3': 10,
        'estimatedPriceCdf': 220000,
        'timeline': [
          {'label': 'Demande enregistrée', 'done': true},
          {'label': 'Devis confirmé', 'done': false},
          {'label': 'Équipe en route', 'done': false},
          {'label': 'Déménagement terminé', 'done': false},
        ],
      };

  static Map<String, dynamic> mobileErrandEstimate(Map<String, dynamic> body) {
    final items = body['items'] as List? ?? [];
    final base = errandEstimate({'description': items.join(', ')})['estimatedPriceCdf'] as int;
    return {
      'estimatedPriceCdf': base + (items.length * 1500),
      'currency': 'CDF',
    };
  }

  static Map<String, dynamic> createMobileErrand(Map<String, dynamic> body) {
    final items = body['items'] as List? ?? [];
    final price = mobileErrandEstimate(body)['estimatedPriceCdf'] as int;
    return {
      'errand': {
        'id': 'errand-${DateTime.now().millisecondsSinceEpoch}',
        'status': 'PENDING',
        'type': 'ERRAND',
        'deliveryAddress': body['deliveryAddress'],
        'items': items,
        'priceCdf': price,
        'estimatedPriceCdf': price,
      },
    };
  }
}

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
    final digits = phone.replaceAll(RegExp(r'\D'), '');
    final last4 = digits.length >= 4 ? digits.substring(digits.length - 4) : digits;
    return {
      'accessToken': 'mock-jwt-token',
      'user': {
        'id': isDriver ? 'driver-mock-1' : 'passenger-mock-1',
        'phone': phone,
        'phoneMasked': '+243 *** $last4',
        'publicId': isDriver ? 'DRV-MOCK01' : 'RDR-MOCK01',
        'role': isDriver ? 'DRIVER' : 'PASSENGER',
        'name': isDriver ? 'Jean Chauffeur' : 'Marie Passagère',
      },
    };
  }

  static Map<String, dynamic> _mockPassengerProfile = {
    'id': 'passenger-mock-1',
    'phone': '+243900000010',
    'role': 'PASSENGER',
    'status': 'ACTIVE',
    'firstName': 'Marie',
    'lastName': 'Passagère',
    'email': '',
  };

  static Map<String, dynamic> currentUser() => Map<String, dynamic>.from(_mockPassengerProfile);

  static Map<String, dynamic> updateCurrentUser(Map<String, dynamic> body) {
    _mockPassengerProfile = {
      ..._mockPassengerProfile,
      ...body,
    };
    return currentUser();
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
        'attempt': 1,
        'radiusKm': 2,
        'nextRadiusKm': 3,
        'incrementIntervalSec': 30,
        'maxRadiusKm': 10,
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
        'etaMinutes': 5,
        'paymentReady': false,
        'completionPin': '4829',
        'driverDistanceKm': 1.2,
        'driver': {
          'id': 'driver-mock-1',
          'name': 'Jean Kabila',
          'rating': 4.8,
          'phone': '+243812345678',
          'lat': MarketConfig.defaultLat + 0.008,
          'lng': MarketConfig.defaultLng + 0.005,
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
        'status': body['method'] == 'CASH' ? 'PENDING_CASH' : 'COMPLETED',
        if (body['method'] == 'CASH') 'pendingCash': true,
      };

  static Map<String, dynamic> payService(String refType, String refId, Map<String, dynamic> body) => {
        'success': true,
        'amountCdf': body['amountCdf'] ?? 3000,
        'currency': 'CDF',
        'referenceType': refType.toUpperCase(),
        'referenceId': refId,
        'method': body['method'] ?? 'WALLET',
      };

  static Map<String, dynamic> servicePaymentInfo(String refType, String refId) {
    final type = refType.toUpperCase();
    if (type == 'CARPOOL') {
      return {
        'referenceType': 'CARPOOL',
        'referenceId': refId,
        'amountCdf': 3000,
        'paymentReady': true,
        'cashPin': null,
        'title': 'Covoiturage',
      };
    }
    if (type == 'SCHEDULED') {
      return {
        'referenceType': 'SCHEDULED',
        'referenceId': refId,
        'amountCdf': 25000,
        'paymentReady': true,
        'cashPin': '1234',
        'title': 'Réservation planifiée',
      };
    }
    if (type == 'RENTAL') {
      return {
        'referenceType': 'RENTAL',
        'referenceId': refId,
        'amountCdf': 320000,
        'paymentReady': refId.contains('returned') || refId == 'booking-returned',
        'cashPin': '5678',
        'title': 'Location véhicule',
      };
    }
    if (type == 'MOVING') {
      final completed = refId.contains('completed') || refId == 'moving-completed';
      return {
        'referenceType': 'MOVING',
        'referenceId': refId,
        'amountCdf': 220000,
        'paymentReady': completed,
        'cashPin': completed ? '4321' : null,
        'title': 'Déménagement',
      };
    }
    return {
      'referenceType': type,
      'referenceId': refId,
      'amountCdf': 10000,
      'paymentReady': true,
      'cashPin': null,
      'title': type,
    };
  }

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
        'deliveryCount': 18,
        'todayRideCount': 3,
        'todayDeliveryCount': 2,
        'rideEarningsCdf': 980000,
        'deliveryEarningsCdf': 270000,
        'withdrawableCdf': 450000,
        'walletBalanceCdf': 450000,
        'payoutProvider': 'ORANGE_MONEY',
        'payoutPhone': '+243900000020',
        'payoutPhoneMasked': '+243 *** 0020',
        'payoutConfigured': true,
        'minWithdrawCdf': 500,
      };

  static Map<String, dynamic> driverProfile() => {
        'userId': 'mock-driver',
        'publicId': 'DRV-MOCK01',
        'kycStatus': 'APPROVED',
        'needsActivationPin': false,
        'isAvailable': false,
        'ratingAvg': 4.8,
        'totalRides': 120,
        'vehicles': [
          {'id': 'veh-mock-1', 'type': 'STANDARD', 'make': 'Toyota', 'model': 'Corolla', 'plateNumber': 'KIN-1234', 'isActive': true},
        ],
      };

  static Map<String, dynamic> driverOnboarding() => {
        'publicId': 'DRV-MOCK01',
        'user': {
          'firstName': 'Jean',
          'lastName': 'Kabila',
          'email': 'jean@example.cd',
          'phone': '+243900000020',
          'phoneMasked': '+243 *** 0020',
        },
        'profile': {
          'onboardingCompleted': false,
          'kycStatus': 'PENDING',
          'activationPinVerified': false,
          'needsActivationPin': false,
        },
        'vehicle': {
          'type': 'STANDARD',
          'make': 'Toyota',
          'model': 'Corolla',
          'plateNumber': 'KIN-1234',
        },
        'kyc': {
          'requiredComplete': false,
          'checklist': [
            {'type': 'ID_PHOTO', 'label': 'Carte d\'identité', 'required': true, 'uploaded': false},
            {'type': 'SELFIE', 'label': 'Photo profil', 'required': true, 'uploaded': false},
          ],
        },
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
        {
          'id': 'rest-4',
          'name': 'Chez Flore',
          'cuisine': 'Congolais',
          'rating': 4.6,
          'deliveryMinCdf': 3500,
          'items': [
            {'id': 'item-8', 'name': 'Poulet moambe', 'priceCdf': 12000},
            {'id': 'item-9', 'name': 'Chikwangue', 'priceCdf': 5000},
          ],
        },
        {
          'id': 'rest-5',
          'name': 'Limoncello',
          'cuisine': 'Italien',
          'rating': 4.5,
          'deliveryMinCdf': 4000,
          'items': [
            {'id': 'item-10', 'name': 'Pizza Margherita', 'priceCdf': 18000},
            {'id': 'item-11', 'name': 'Pasta carbonara', 'priceCdf': 16000},
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

  static Map<String, dynamic> scheduledEstimate(Map<String, dynamic> body) =>
      scheduledRideEstimate(body);

  static Map<String, dynamic> scheduledRideEstimate(Map<String, dynamic> body) {
    final est = estimate({'vehicleType': body['vehicleType'] ?? 'STANDARD'});
    final fare = est['estimatedFareCdf'] as int? ?? 0;
    return {
      'estimatedPriceCdf': fare,
      'currency': 'CDF',
      'distanceKm': 8.5,
      'durationMin': 22,
      'isInterCity': false,
      'type': 'SCHEDULED',
      'passengerTotalCdf': fare,
      'priceBreakdown': {
        'baseFareCdf': 3000,
        'distanceFareCdf': (fare * 0.55).round(),
        'durationFareCdf': (fare * 0.25).round(),
      },
      'lateCancelPolicy':
          'Annulation gratuite jusqu\'à 24 h avant le départ. Au-delà : 50 % du tarif estimé.',
    };
  }

  static Map<String, dynamic> createScheduledRide(Map<String, dynamic> body) => {
        'id': 'sched-${DateTime.now().millisecondsSinceEpoch}',
        'status': 'SCHEDULED',
        'type': 'SCHEDULED',
        ...body,
        'scheduledAt': body['scheduledAt'] ?? DateTime.now().add(const Duration(days: 2)).toIso8601String(),
        'estimatedPriceCdf': scheduledRideEstimate(body)['estimatedPriceCdf'],
        'priceCdf': scheduledRideEstimate(body)['estimatedPriceCdf'],
        'canCancel': true,
      };

  static Map<String, dynamic> scheduledRideDetail(String id) => {
        'id': id,
        'status': 'CONFIRMED',
        'type': 'SCHEDULED',
        'pickupAddress': 'Gombe, Kinshasa',
        'dropoffAddress': 'Aéroport N\'Djili',
        'vehicleType': 'STANDARD',
        'scheduledAt': DateTime.now().add(const Duration(days: 2)).toIso8601String(),
        'estimatedPriceCdf': 25000,
        'priceCdf': 25000,
        'passengerTotalCdf': 25000,
        'canCancel': true,
        'driverId': 'driver-mock-1',
        'completionPin': '1234',
      };

  static List<Map<String, dynamic>> scheduledOffers() => [
        {
          'id': 'sched-offer-1',
          'type': 'SCHEDULED',
          'label': 'Course planifiée',
          'status': 'SCHEDULED',
          'pickupAddress': 'Bandalungwa',
          'dropoffAddress': 'Limete',
          'scheduledAt': DateTime.now().add(const Duration(days: 1, hours: 3)).toIso8601String(),
          'vehicleType': 'MOTO_TAXI',
          'priceCdf': 12000,
          'driverNetCdf': 10200,
          'volunteered': false,
        },
      ];

  static List<Map<String, dynamic>> scheduledAssignments() => [
        {
          'id': 'sched-assign-1',
          'type': 'SCHEDULED',
          'label': 'Course planifiée',
          'status': 'CONFIRMED',
          'pickupAddress': 'Gombe',
          'dropoffAddress': 'Aéroport N\'Djili',
          'scheduledAt': DateTime.now().add(const Duration(hours: 5)).toIso8601String(),
          'vehicleType': 'STANDARD',
          'priceCdf': 25000,
          'driverNetCdf': 21250,
        },
      ];

  static List<Map<String, dynamic>> scheduledRides() => [
        {
          'id': 'sched-1',
          'status': 'SCHEDULED',
          'type': 'SCHEDULED',
          'pickupAddress': 'Gombe, Kinshasa',
          'dropoffAddress': 'Aéroport N\'Djili',
          'vehicleType': 'STANDARD',
          'scheduledAt': DateTime.now().add(const Duration(days: 2)).toIso8601String(),
          'estimatedPriceCdf': 25000,
          'priceCdf': 25000,
          'canCancel': true,
        },
      ];

  static Map<String, dynamic> createScheduledInquiry(Map<String, dynamic> body) => {
        'id': 'inq-${DateTime.now().millisecondsSinceEpoch}',
        'status': 'PENDING',
        'reference': 'MOVA-${DateTime.now().millisecondsSinceEpoch % 1000000}',
        ...body,
        'createdAt': DateTime.now().toIso8601String(),
      };

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
        {
          'type': 'RENTAL',
          'id': 'booking-returned',
          'status': 'RETURNED',
          'title': 'Toyota RAV4',
          'priceCdf': 320000,
          'paymentReady': true,
          'isPaid': false,
          'createdAt': DateTime.now().subtract(const Duration(days: 2)).toIso8601String(),
          'meta': {
            'startDate': DateTime.now().subtract(const Duration(days: 5)).toIso8601String(),
            'endDate': DateTime.now().subtract(const Duration(days: 2)).toIso8601String(),
            'paymentReferenceId': 'booking-returned',
          },
        },
        {
          'type': 'MOVING',
          'id': 'moving-completed',
          'status': 'COMPLETED',
          'title': 'Bandal → Gombe',
          'priceCdf': 220000,
          'paymentReady': true,
          'isPaid': false,
          'createdAt': DateTime.now().subtract(const Duration(days: 3)).toIso8601String(),
          'meta': {
            'pickupAddress': 'Bandal, Kinshasa',
            'dropoffAddress': 'Gombe, Kinshasa',
            'volumeM3': 10,
            'paymentReferenceId': 'moving-completed',
          },
        },
      ];

  static List<Map<String, dynamic>> rentalVehicles() => [
        {
          'id': '00000000-0000-4000-a000-000000000001',
          'name': 'Toyota Corolla',
          'make': 'Toyota',
          'model': 'Corolla',
          'year': 2021,
          'category': 'ECONOMY',
          'categoryLabel': 'Économique',
          'transmission': 'MANUAL',
          'transmissionLabel': 'Manuelle',
          'city': 'Kinshasa',
          'seats': 5,
          'dailyRateCdf': 45000,
          'depositCdf': 150000,
          'rating': 4.6,
          'ownerName': 'Jean K.',
          'ownerBadge': 'PRO',
          'features': ['Climatisation', 'Bluetooth'],
          'imageUrl': 'https://placehold.co/600x400/6C63FF/white?text=Corolla',
          'cancellationPolicy': 'Annulation gratuite 24 h avant prise en charge.',
        },
        {
          'id': '00000000-0000-4000-a000-000000000002',
          'name': 'Toyota RAV4',
          'make': 'Toyota',
          'model': 'RAV4',
          'year': 2022,
          'category': 'SUV',
          'categoryLabel': 'SUV',
          'transmission': 'AUTO',
          'transmissionLabel': 'Automatique',
          'city': 'Kinshasa',
          'seats': 5,
          'dailyRateCdf': 85000,
          'depositCdf': 250000,
          'rating': 4.8,
          'ownerName': 'Marie L.',
          'ownerBadge': 'SUPER_HOST',
          'features': ['Climatisation', 'GPS', '4x4'],
          'imageUrl': 'https://placehold.co/600x400/6C63FF/white?text=RAV4',
          'cancellationPolicy': 'Annulation gratuite 48 h avant prise en charge.',
        },
        {
          'id': '00000000-0000-4000-a000-000000000003',
          'name': 'Mercedes Classe C',
          'make': 'Mercedes',
          'model': 'Classe C',
          'year': 2023,
          'category': 'PREMIUM',
          'categoryLabel': 'Premium',
          'transmission': 'AUTO',
          'transmissionLabel': 'Automatique',
          'city': 'Kinshasa',
          'seats': 5,
          'dailyRateCdf': 120000,
          'depositCdf': 250000,
          'rating': 4.9,
          'ownerName': 'MOVA Fleet',
          'ownerBadge': 'PRO',
          'features': ['Climatisation', 'GPS', 'Cuir'],
          'imageUrl': 'https://placehold.co/600x400/6C63FF/white?text=Mercedes',
        },
      ];

  static List<Map<String, dynamic>> carpoolRides() => [
        {
          'id': 'carpool-1',
          'status': 'MATCHED',
          'type': 'CARPOOL',
          'fromAddress': 'Gombe, Kinshasa',
          'toAddress': 'Limete, Kinshasa',
          'fromCity': 'Kinshasa',
          'toCity': 'Kinshasa',
          'pickupLat': -4.3217,
          'pickupLng': 15.3125,
          'dropoffLat': -4.3580,
          'dropoffLng': 15.3510,
          'driverName': 'Paul M.',
          'driverRating': 4.8,
          'kycVerified': true,
          'availableSeats': 2,
          'seatsTotal': 4,
          'pricePerSeatCdf': 3000,
          'totalPriceCdf': 12000,
          'distanceKm': 5.2,
          'durationMin': 18,
          'etaLabel': '~18 min · 5.2 km',
          'departureAt': DateTime.now().add(const Duration(hours: 4)).toIso8601String(),
          'passengerCount': 1,
          'bookedSeats': 1,
          'timelineStep': 'Places réservées',
          'contactPhone': '+243 *** 123',
          'canCancel': true,
          'passengers': [
            {'id': 'booking-mock-1', 'userId': 'passenger-mock-1', 'seats': 1, 'label': 'Marie Passagère'},
          ],
        },
        {
          'id': 'carpool-2',
          'status': 'OPEN',
          'type': 'CARPOOL',
          'toAddress': 'Aéroport N\'Djili',
          'fromCity': 'Kinshasa',
          'toCity': 'Kinshasa',
          'pickupLat': -4.3250,
          'pickupLng': 15.3222,
          'dropoffLat': -4.3857,
          'dropoffLng': 15.4446,
          'driverName': 'Grace K.',
          'driverRating': 4.6,
          'kycVerified': true,
          'availableSeats': 3,
          'pricePerSeatCdf': 15000,
          'totalPriceCdf': 45000,
          'distanceKm': 18.4,
          'durationMin': 37,
          'etaLabel': '~37 min · 18.4 km',
          'departureAt': DateTime.now().add(const Duration(days: 1)).toIso8601String(),
          'passengerCount': 0,
          'timelineStep': 'Publié',
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
      'distanceKm': 8.5,
      'durationMin': 22,
      'fromCity': 'Kinshasa',
      'toCity': 'Kinshasa',
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
    final period = body['rentalPeriod']?.toString().toUpperCase() ?? 'DAILY';
    final days = period == 'HOURLY' ? 0 : end.difference(start).inDays.clamp(1, 30);
    final hours = period == 'HOURLY' ? end.difference(start).inHours.clamp(1, 23) : 0;
    final vehicleId = body['vehicleId']?.toString();
    final vehicle = rentalVehicles().firstWhere(
      (v) => v['id'] == vehicleId,
      orElse: () => rentalVehicles().first,
    );
    var daily = vehicle['dailyRateCdf'] as int? ?? 45000;
    var hourly = vehicle['hourlyRateCdf'] as int? ?? (daily / 8).ceil();
    var rentalFee = period == 'HOURLY' ? hourly * hours : daily * days;
    var weeklyDiscount = 0;
    if (body['rentalPeriod'] == 'WEEKLY' && days >= 7) {
      weeklyDiscount = (rentalFee * 0.1).round();
      rentalFee -= weeklyDiscount;
    }
    var insuranceFee = 0;
    final tier = body['insuranceTier']?.toString() ?? 'BASIC';
    if (tier == 'STANDARD') insuranceFee = (rentalFee * 0.12).round();
    if (tier == 'PREMIUM') insuranceFee = (rentalFee * 0.25).round();
    var addOnsFee = 0;
    final addOns = body['addOns'] as Map<String, dynamic>? ?? {};
    if (addOns['childSeat'] == true) addOnsFee += 5000;
    if (addOns['gps'] == true) addOnsFee += 8000;
    if (addOns['extraDriver'] == true) addOnsFee += 15000;
    var interCityFee = 0;
    final pickup = body['pickupCity']?.toString().toLowerCase();
    final ret = body['returnCity']?.toString().toLowerCase();
    if (pickup != null && ret != null && pickup != ret) interCityFee = 15000;
    var mileageFee = body['mileageType'] == 'LIMITED' ? 15000 : 0;
    final deposit = vehicle['depositCdf'] as int? ?? 150000;
    final subtotal = rentalFee + insuranceFee + addOnsFee + interCityFee + mileageFee;
    final total = subtotal + deposit;
    return {
      'days': days,
      'hours': hours,
      'rentalPeriod': period,
      'rentalFeeCdf': rentalFee,
      'depositCdf': deposit,
      'estimatedPriceCdf': total,
      'totalCdf': total,
      'breakdown': {
        'rentalFeeCdf': rentalFee,
        'weeklyDiscountCdf': weeklyDiscount,
        'insuranceFeeCdf': insuranceFee,
        'addOnsFeeCdf': addOnsFee,
        'interCityFeeCdf': interCityFee,
        'mileageFeeCdf': mileageFee,
        'depositCdf': deposit,
        'subtotalCdf': subtotal,
      },
      'currency': 'CDF',
    };
  }

  static Map<String, dynamic> rentalVehicleDetail(String id) {
    final vehicle = rentalVehicles().firstWhere(
      (v) => v['id'] == id,
      orElse: () => rentalVehicles().first,
    );
    return {
      'vehicle': vehicle,
      'options': {
        'insuranceTiers': {
          'BASIC': {'label': 'Basique', 'surchargePct': 0},
          'STANDARD': {'label': 'Standard', 'surchargePct': 12},
          'PREMIUM': {'label': 'Premium', 'surchargePct': 25},
        },
        'addOns': {
          'childSeat': {'label': 'Siège enfant', 'priceCdf': 5000},
          'gps': {'label': 'GPS', 'priceCdf': 8000},
          'extraDriver': {'label': 'Conducteur supplémentaire', 'priceCdf': 15000},
        },
      },
      'currency': 'CDF',
    };
  }

  static Map<String, dynamic> rentalInquiryDetail(String id, {String status = 'CONFIRMED'}) {
    final vehicle = rentalVehicles()[1];
    final total = 320000;
    final deposit = vehicle['depositCdf'] as int? ?? 150000;
    final driverNet = 26400;
    return {
      'id': id,
      'type': 'RENTAL',
      'vehicleType': vehicle['category'],
      'status': status,
      'logisticsMode': 'MOVA_DRIVER',
      'logisticsModeLabel': 'Livraison par un chauffeur MOVA',
      'startDate': DateTime.now().add(const Duration(days: 1)).toIso8601String(),
      'endDate': DateTime.now().add(const Duration(days: 3)).toIso8601String(),
      'pickupAddress': 'Gombe, Kinshasa',
      'pickupCity': 'Kinshasa',
      'returnCity': 'Kinshasa',
      'totalCdf': total,
      'priceCdf': total,
      'passengerTotalCdf': total,
      'depositCdf': deposit,
      'rentalSubtotalCdf': total - deposit,
      'driverGrossCdf': 30000,
      'driverNetCdf': driverNet,
      'displayAmountCdf': driverNet,
      'displayAmountLabel': 'Rémunération logistique',
      'contactPhone': '+243900000010',
      'vehicleName': vehicle['name'],
      'vehicle': vehicle,
      'timeline': [
        {'status': 'CONFIRMED', 'label': 'Confirmée', 'completed': true, 'current': status == 'CONFIRMED'},
        {'status': 'IN_PROGRESS', 'label': 'En cours', 'completed': status != 'CONFIRMED', 'current': status == 'IN_PROGRESS'},
        {'status': 'RETURNED', 'label': 'Retournée', 'completed': status == 'RETURNED' || status == 'PAID', 'current': status == 'RETURNED'},
      ],
      'paymentReady': status == 'RETURNED',
      'isPaid': status == 'PAID',
      'paymentReferenceId': id,
      'completionPin': status == 'RETURNED' || status == 'PAID' ? '5678' : null,
      'canCancel': status == 'CONFIRMED',
    };
  }

  static List<Map<String, dynamic>> rentalInquiries() => [
        rentalInquiryDetail('rental-1', status: 'PENDING'),
      ];

  static Map<String, dynamic> createRentalInquiry(Map<String, dynamic> body) {
    final estimate = rentalEstimate(body);
    return {
      'inquiry': {
        'id': 'rental-${DateTime.now().millisecondsSinceEpoch}',
        'status': 'PENDING',
        ...body,
        'estimatedTotalCdf': estimate['totalCdf'],
        'totalCdf': estimate['totalCdf'],
      },
      'message': 'Demande enregistrée. Un conseiller MOVA vous contactera sous 24h.',
    };
  }

  static Map<String, dynamic> createRentalBooking(Map<String, dynamic> body) {
    final estimate = rentalEstimate(body);
    final vehicleId = body['vehicleId']?.toString();
    final vehicle = rentalVehicles().firstWhere(
      (v) => v['id'] == vehicleId,
      orElse: () => rentalVehicles().first,
    );
    final id = 'booking-${DateTime.now().millisecondsSinceEpoch}';
    final inquiry = {
      'id': id,
      'status': 'PENDING',
      'vehicleId': vehicleId,
      'vehicleType': vehicle['category'],
      'startDate': body['startDate'],
      'endDate': body['endDate'],
      'pickupCity': body['pickupCity'],
      'returnCity': body['returnCity'],
      'pickupAddress': body['pickupAddress'],
      'totalCdf': estimate['totalCdf'],
      'estimatedPriceCdf': estimate['totalCdf'],
      'vehicle': vehicle,
      'timeline': [
        {'status': 'PENDING', 'label': 'Demande', 'completed': true, 'current': true},
        {'status': 'CONFIRMED', 'label': 'Confirmée', 'completed': false, 'current': false},
        {'status': 'IN_PROGRESS', 'label': 'En cours', 'completed': false, 'current': false},
        {'status': 'RETURNED', 'label': 'Retournée', 'completed': false, 'current': false},
      ],
    };
    return {
      'inquiry': inquiry,
      'booking': inquiry,
      'quote': estimate,
      'message': 'Réservation enregistrée. Vous serez contacté après validation.',
    };
  }

  static List<Map<String, dynamic>> rentalBookings() => [
        {
          ...rentalInquiryDetail('booking-1', status: 'CONFIRMED'),
        },
        {
          ...rentalInquiryDetail('booking-returned', status: 'RETURNED'),
        },
      ];

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

  static Map<String, dynamic> movingDetail(String id, {String status = 'PENDING'}) {
    final price = 220000;
    final volumeFee = 80000;
    final isCompleted = status == 'COMPLETED';
    final isAssigned = status == 'ASSIGNED' || status == 'IN_PROGRESS' || isCompleted;
    return {
      'id': id,
      'type': 'MOVING',
      'status': status,
      'pickupAddress': 'Bandal, Kinshasa',
      'dropoffAddress': 'Gombe, Kinshasa',
      'pickupLat': -4.35,
      'pickupLng': 15.31,
      'dropoffLat': -4.32,
      'dropoffLng': 15.31,
      'volumeM3': 10,
      'vehicleCategory': 'CAMION_15M3',
      'vehicleCategoryLabel': 'Camion ~15 m³',
      'estimatedPriceCdf': price,
      'passengerTotalCdf': price,
      'priceCdf': price,
      'volumeFeeCdf': volumeFee,
      'serviceBaseFeeCdf': 15000,
      'transportFareCdf': price - volumeFee - 15000,
      'priceBreakdown': {
        'transportFareCdf': price - volumeFee - 15000,
        'volumeFeeCdf': volumeFee,
        'baseFareCdf': 15000,
        'totalCdf': price,
      },
      if (isAssigned) 'driverId': 'driver-mock-1',
      if (isAssigned) 'driverNetCdf': 187000,
      if (isAssigned) 'driverGrossCdf': price,
      'paymentReady': isCompleted,
      'isPaid': false,
      'paymentReferenceId': id,
      'completionPin': isCompleted ? '4321' : null,
      'canCancel': status == 'PENDING' || status == 'ASSIGNED',
      'timeline': [
        {'label': 'Demande enregistrée', 'done': true},
        {'label': 'Équipe assignée', 'done': isAssigned},
        {'label': 'Déménagement en cours', 'done': status == 'IN_PROGRESS' || isCompleted},
        {'label': 'Déménagement terminé', 'done': isCompleted},
      ],
      'photoUrls': ['mock://moving-photo-1'],
    };
  }

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

  static Map<String, dynamic> foodMultiEstimate(Map<String, dynamic> body) {
    final orders = body['orders'] as List? ?? [];
    var subtotal = 0;
    for (final order in orders) {
      final items = (order as Map?)?['items'] as List? ?? [];
      subtotal += items.fold<int>(0, (sum, item) {
        final map = item as Map<String, dynamic>;
        return sum +
            ((map['unitPriceCdf'] as int? ?? map['priceCdf'] as int? ?? 0) *
                (map['quantity'] as int? ?? 1));
      });
    }
    final deliveryFee = 3500 + (orders.length > 1 ? 1500 * (orders.length - 1) : 0);
    return {
      'estimatedPriceCdf': subtotal + deliveryFee,
      'itemsSubtotalCdf': subtotal,
      'deliveryFeeCdf': deliveryFee,
      'currency': 'CDF',
    };
  }

  static Map<String, dynamic> createFoodMultiOrder(Map<String, dynamic> body) {
    final estimate = foodMultiEstimate(body);
    return {
      'id': 'food-multi-${DateTime.now().millisecondsSinceEpoch}',
      'status': 'RESTAURANT_CONFIRMED',
      'type': 'FOOD',
      ...body,
      'priceCdf': estimate['estimatedPriceCdf'],
      'restaurantName': 'Multi-restaurants',
    };
  }

  static Map<String, dynamic> subscriptionPlans() => {
        'data': [
          {
            'id': 'plan-basic',
            'code': 'PASSENGER_BASIC',
            'name': 'MOVA Plus',
            'monthlyPriceCdf': 15000,
            'feeReductionPercent': 10,
            'priorityMatching': false,
            'description': 'L\'essentiel pour payer moins sur vos trajets du quotidien',
            'benefits': [
              '−10 % sur les frais de service MOVA',
              'Courses, livraisons, déménagement, planifiées',
              'Sans engagement — résiliable à tout moment',
            ],
          },
          {
            'id': 'plan-premium',
            'code': 'PASSENGER_PREMIUM',
            'name': 'MOVA Premium',
            'monthlyPriceCdf': 35000,
            'feeReductionPercent': 20,
            'priorityMatching': true,
            'isPopular': true,
            'description': 'Priorité chauffeur + meilleure réduction — comme Uber One',
            'benefits': [
              '−20 % sur les frais de service MOVA',
              'Priorité de matching chauffeur / livreur',
              'Support prioritaire',
              'Idéal pour 8+ commandes par mois',
            ],
          },
        ],
      };

  static Map<String, dynamic> subscriptionMine() => {};

  static Map<String, dynamic> subscribePlan(String planId) => {
        'subscription': {
          'id': 'sub-${DateTime.now().millisecondsSinceEpoch}',
          'planId': planId,
          'status': 'ACTIVE',
          'startedAt': DateTime.now().toIso8601String(),
          'renewsAt': DateTime.now().add(const Duration(days: 30)).toIso8601String(),
          'plan': planId == 'plan-premium'
              ? {
                  'id': 'plan-premium',
                  'name': 'MOVA Premium',
                  'monthlyPriceCdf': 35000,
                  'feeReductionPercent': 20,
                  'priorityMatching': true,
                }
              : {
                  'id': 'plan-basic',
                  'name': 'MOVA Plus',
                  'monthlyPriceCdf': 15000,
                  'feeReductionPercent': 10,
                  'priorityMatching': false,
                },
        },
        'plan': planId == 'plan-premium'
            ? {
                'id': 'plan-premium',
                'name': 'MOVA Premium',
                'monthlyPriceCdf': 35000,
                'feeReductionPercent': 20,
                'priorityMatching': true,
              }
            : {
                'id': 'plan-basic',
                'name': 'MOVA Plus',
                'monthlyPriceCdf': 15000,
                'feeReductionPercent': 10,
                'priorityMatching': false,
              },
        'message': 'Abonnement activé — les réductions s\'appliquent automatiquement.',
        'success': true,
      };

  static Map<String, dynamic> cancelSubscription() => {
        'success': true,
        'message': 'Abonnement annulé',
        'subscription': {'status': 'CANCELLED'},
      };
}

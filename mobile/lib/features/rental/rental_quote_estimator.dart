/// Estimation locale du devis location — alignée sur ride-service / MARKET_RDC.
class RentalQuoteEstimate {
  const RentalQuoteEstimate({
    required this.days,
    required this.rentalPeriod,
    required this.rentalFeeCdf,
    required this.weeklyDiscountCdf,
    required this.insuranceFeeCdf,
    required this.mileageFeeCdf,
    required this.addOnsFeeCdf,
    required this.interCityFeeCdf,
    required this.depositCdf,
    required this.subtotalCdf,
    required this.totalCdf,
    required this.insuranceFeeByTier,
    required this.unlimitedMileageSurchargeCdf,
  });

  final int days;
  final String rentalPeriod;
  final int rentalFeeCdf;
  final int weeklyDiscountCdf;
  final int insuranceFeeCdf;
  final int mileageFeeCdf;
  final int addOnsFeeCdf;
  final int interCityFeeCdf;
  final int depositCdf;
  final int subtotalCdf;
  final int totalCdf;
  final Map<String, int> insuranceFeeByTier;
  final int unlimitedMileageSurchargeCdf;

  bool get weeklyEligible => days >= 7;
}

class RentalQuoteEstimator {
  RentalQuoteEstimator._();

  static const weeklyDiscountPct = 10;
  static const interCitySurchargeCdf = 15000;
  static const unlimitedMileageSurchargeCdf = 15000;
  static const limitedMileageKmPerDay = 100;

  static const insuranceSurchargePct = {
    'BASIC': 0,
    'STANDARD': 12,
    'PREMIUM': 25,
  };

  static const addOnPrices = {
    'childSeat': 5000,
    'gps': 8000,
    'extraDriver': 15000,
  };

  static int rentalDays(DateTime start, DateTime end) {
    final startDay = DateTime(start.year, start.month, start.day);
    final endDay = DateTime(end.year, end.month, end.day);
    final diff = endDay.difference(startDay).inDays;
    return diff < 1 ? 1 : diff;
  }

  static RentalQuoteEstimate estimate({
    required int dailyRateCdf,
    required int depositCdf,
    required DateTime startDate,
    required DateTime endDate,
    required String rentalPeriod,
    required String mileageType,
    required String insuranceTier,
    required bool childSeat,
    required bool gps,
    required bool extraDriver,
    required String pickupCity,
    required String returnCity,
    bool gpsBuiltIn = false,
    int? vehicleUnlimitedMileageSurchargeCdf,
  }) {
    final days = rentalDays(startDate, endDate);
    var period = rentalPeriod;
    if (period == 'WEEKLY' && days < 7) {
      period = 'DAILY';
    }

    var rentalFeeCdf = dailyRateCdf * days;
    var weeklyDiscountCdf = 0;
    if (period == 'WEEKLY' && days >= 7) {
      weeklyDiscountCdf = (rentalFeeCdf * weeklyDiscountPct / 100).round();
      rentalFeeCdf -= weeklyDiscountCdf;
    }

    final insuranceFeeByTier = <String, int>{};
    for (final entry in insuranceSurchargePct.entries) {
      insuranceFeeByTier[entry.key] = (rentalFeeCdf * entry.value / 100).round();
    }
    final insuranceFeeCdf = insuranceFeeByTier[insuranceTier] ?? 0;

    var addOnsFeeCdf = 0;
    if (childSeat) addOnsFeeCdf += addOnPrices['childSeat']!;
    if (gps && !gpsBuiltIn) addOnsFeeCdf += addOnPrices['gps']!;
    if (extraDriver) addOnsFeeCdf += addOnPrices['extraDriver']!;

    var interCityFeeCdf = 0;
    if (pickupCity.trim().toLowerCase() != returnCity.trim().toLowerCase()) {
      interCityFeeCdf = interCitySurchargeCdf;
    }

    final unlimitedSurcharge =
        vehicleUnlimitedMileageSurchargeCdf ?? unlimitedMileageSurchargeCdf;
    final mileageFeeCdf = mileageType == 'UNLIMITED' ? unlimitedSurcharge : 0;

    final subtotalCdf =
        rentalFeeCdf + insuranceFeeCdf + addOnsFeeCdf + interCityFeeCdf + mileageFeeCdf;
    final totalCdf = subtotalCdf + depositCdf;

    return RentalQuoteEstimate(
      days: days,
      rentalPeriod: period,
      rentalFeeCdf: rentalFeeCdf,
      weeklyDiscountCdf: weeklyDiscountCdf,
      insuranceFeeCdf: insuranceFeeCdf,
      mileageFeeCdf: mileageFeeCdf,
      addOnsFeeCdf: addOnsFeeCdf,
      interCityFeeCdf: interCityFeeCdf,
      depositCdf: depositCdf,
      subtotalCdf: subtotalCdf,
      totalCdf: totalCdf,
      insuranceFeeByTier: insuranceFeeByTier,
      unlimitedMileageSurchargeCdf: unlimitedSurcharge,
    );
  }
}

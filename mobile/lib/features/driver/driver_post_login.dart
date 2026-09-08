/// Routing after chauffeur login: dossier vs PIN d'activation vs accueil.
enum DriverPostLoginTarget { onboarding, activationPin, home }

bool _truthy(dynamic value) => value == true || value == 1 || value == 'true';

Map<String, dynamic>? _asMap(dynamic value) {
  if (value is Map<String, dynamic>) return value;
  if (value is Map) return Map<String, dynamic>.from(value);
  return null;
}

/// `/drivers/profile` (top-level) or `/drivers/onboarding` (nested `profile`).
Map<String, dynamic>? driverProfileMap(Map<String, dynamic>? payload) {
  if (payload == null) return null;
  return _asMap(payload['profile']) ?? payload;
}

/// KYC approuvé et PIN d'activation pas encore saisi (`issueLoginPin`).
bool driverNeedsActivationPin(Map<String, dynamic>? payload) {
  final profile = driverProfileMap(payload);
  if (profile == null) return false;
  if (_truthy(profile['activationPinVerified']) || profile['activationPinVerifiedAt'] != null) {
    return false;
  }
  if (_truthy(profile['needsActivationPin'])) return true;
  return profile['kycStatus']?.toString() == 'APPROVED';
}

bool driverOnboardingCompleted(Map<String, dynamic>? payload) {
  final profile = driverProfileMap(payload);
  return _truthy(profile?['onboardingCompleted']);
}

DriverPostLoginTarget driverPostLoginTarget(Map<String, dynamic>? onboarding) {
  if (!driverOnboardingCompleted(onboarding)) {
    return DriverPostLoginTarget.onboarding;
  }
  if (driverNeedsActivationPin(onboarding)) {
    return DriverPostLoginTarget.activationPin;
  }
  return DriverPostLoginTarget.home;
}

/// Seed demo range `+2439000000xx` — OTP 123456, PIN setup skipped for E2E.
bool isSeedDemoPhone(String phone) =>
    RegExp(r'^\+2439000000\d{2}$').hasMatch(phone.trim());

/// First login (OTP or Google, including no phone) must create a PIN. Seed demo skips.
bool sessionNeedsPinSetup({required bool pinConfigured, required String phone}) {
  if (pinConfigured) return false;
  return !isSeedDemoPhone(phone);
}

/// Cold start with an existing PIN: drop JWT and show the PIN pad (not stay logged in).
bool sessionRequiresPinUnlock({required bool pinConfigured, required String phone}) {
  return pinConfigured && !isSeedDemoPhone(phone);
}

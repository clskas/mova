/// Seed demo range `+2439000000xx` — OTP 123456, PIN setup skipped for E2E.
bool isSeedDemoPhone(String phone) =>
    RegExp(r'^\+2439000000\d{2}$').hasMatch(phone.trim());

/// Same copy as resto/location `CONNECTION_PIN_HEADING_FR` / `PIN_SETUP_HINT_FR`.
const connectionPinHeadingFr = 'PIN de connexion pour les prochaines connexions';
const connectionLoginTitleFr = 'Connexion';
const pinSetupHintFr =
    'Choisissez / confirmez votre PIN de connexion (6 chiffres) pour les prochaines fois.';
const pinResetHeadingFr = 'Définir un nouveau code PIN';
final _rdcPhoneRe = RegExp(r'^\+243\d{9}$');

bool isEmailIdentity(String value) {
  final t = value.trim();
  final at = t.indexOf('@');
  return at > 0 && at < t.length - 1;
}

bool isRdcPhoneIdentity(String value) => _rdcPhoneRe.hasMatch(value.trim());

/// Remembered +243 or Google e-mail — never leftover "+243".
bool isRememberedLoginIdentity(String value) {
  final t = value.trim();
  if (t.isEmpty || t == '+243' || t == '243') return false;
  return isRdcPhoneIdentity(t) || isEmailIdentity(t);
}

/// Same display as resto/location `maskPhoneDisplay`.
String maskLoginIdentity(String identity) {
  final n = identity.replaceAll(RegExp(r'\s'), '');
  if (n.contains('@')) {
    final at = n.indexOf('@');
    final local = n.substring(0, at);
    final domain = n.substring(at + 1);
    final keep = local.length <= 2 ? 1 : 2;
    final shown = keep > local.length ? local.length : keep;
    return '${local.substring(0, shown)}***@$domain';
  }
  if (n.length < 7) return 'votre numéro';
  return '${n.substring(0, 4)} ••• ${n.substring(n.length - 3)}';
}

String connectionPinPrompt(String identity) =>
    'Entrez le PIN pour ${maskLoginIdentity(identity)}';

/// Prefer +243, else Google e-mail. Never store leftover "+243".
String loginIdentityFromAuth({
  required String accountPhone,
  required String accountEmail,
  String fallback = '',
}) {
  final phone = accountPhone.trim();
  if (isRdcPhoneIdentity(phone)) return phone;
  final email = accountEmail.trim();
  if (isEmailIdentity(email)) return email.toLowerCase();
  final fb = fallback.trim();
  if (isRdcPhoneIdentity(fb)) return fb;
  if (isEmailIdentity(fb)) return fb.toLowerCase();
  return '';
}

/// First login (OTP or Google, including no phone) must create a PIN. Seed demo skips.
bool sessionNeedsPinSetup({required bool pinConfigured, required String phone}) {
  if (pinConfigured) return false;
  return !isSeedDemoPhone(phone);
}

/// Cold start with an existing PIN: drop JWT and show the PIN pad (not stay logged in).
bool sessionRequiresPinUnlock({required bool pinConfigured, required String phone}) {
  return pinConfigured && !isSeedDemoPhone(phone);
}

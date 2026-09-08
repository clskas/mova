import 'package:url_launcher/url_launcher.dart';

/// Opens aggregator checkout or a returned USSD string.
/// SerdiPay C2B is normally a network push (*144# on Orange) — do not invent a dial code.
Future<void> openMobileMoneyPrompt({String? paymentUrl, String? ussdCode}) async {
  final url = paymentUrl?.trim() ?? '';
  if (url.startsWith('http://') || url.startsWith('https://')) {
    final uri = Uri.tryParse(url);
    if (uri != null) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
    return;
  }
  final ussd = ussdCode?.trim() ?? '';
  if (ussd.contains('*') || ussd.contains('#')) {
    await launchUrl(Uri(scheme: 'tel', path: ussd));
  }
}

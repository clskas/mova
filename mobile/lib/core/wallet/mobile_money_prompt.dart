import 'package:url_launcher/url_launcher.dart';

/// Opens aggregator checkout or a returned USSD string.
/// Do not invent a dial code — SerdiPay OM often accepts C2B without ussd/url.
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

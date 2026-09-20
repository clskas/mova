import 'package:url_launcher/url_launcher.dart';

String? _lastMmPromptKey;
DateTime? _lastMmPromptAt;

/// Opens aggregator checkout or a returned USSD string.
/// Do not invent a dial code — SerdiPay OM often accepts C2B without ussd/url.
///
/// Guards against re-launching the same USSD within 45s (Android STK "Cancel"
/// otherwise re-opens the Afrimomo PIN dialog in a loop).
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
  if (!(ussd.contains('*') || ussd.contains('#'))) return;

  final now = DateTime.now();
  if (_lastMmPromptKey == ussd &&
      _lastMmPromptAt != null &&
      now.difference(_lastMmPromptAt!) < const Duration(seconds: 45)) {
    return;
  }
  _lastMmPromptKey = ussd;
  _lastMmPromptAt = now;

  // Encode so '#' is not treated as a URI fragment (avoids repeated STK prompts).
  final uri = Uri.parse('tel:${Uri.encodeComponent(ussd)}');
  await launchUrl(uri, mode: LaunchMode.externalApplication);
}

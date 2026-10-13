import 'package:url_launcher/url_launcher.dart';

String? _lastMmPromptKey;
DateTime? _lastMmPromptAt;

/// Whether [url] is a hosted checkout we must open in the browser (CinetPay).
/// SerdiPay / AfriMomo already push a network STK PIN sheet — opening their
/// payment_url re-triggers that sheet and causes the Cancel loop.
bool isHostedMobileMoneyCheckoutUrl(String? url) {
  final u = url?.trim().toLowerCase() ?? '';
  if (!u.startsWith('http://') && !u.startsWith('https://')) return false;
  final host = Uri.tryParse(u)?.host ?? '';
  return host.contains('cinetpay.com') ||
      host.contains('checkout.cinetpay') ||
      host.contains('pay.cinetpay');
}

/// Opens a hosted checkout URL when the aggregator returns one (CinetPay).
///
/// Do **not** auto-dial USSD (`tel:*…#`) and do **not** open SerdiPay/AfriMomo
/// URLs. Those operators already send a network STK/USSD push
/// (PIN dialog « AFRIMOMORDC »). Opening a second prompt makes Android
/// re-show the PIN sheet in a loop when the user taps Cancel.
Future<void> openMobileMoneyPrompt({
  String? paymentUrl,
  String? ussdCode,
  String? providerRef,
}) async {
  // Never dial USSD — parameter kept for call-site compatibility only.
  final _ = ussdCode;

  final url = paymentUrl?.trim() ?? '';
  if (isHostedMobileMoneyCheckoutUrl(url)) {
    final uri = Uri.tryParse(url);
    if (uri != null) {
      final key = (providerRef?.trim().isNotEmpty == true) ? providerRef!.trim() : url;
      final now = DateTime.now();
      if (_lastMmPromptKey == key &&
          _lastMmPromptAt != null &&
          now.difference(_lastMmPromptAt!) < const Duration(seconds: 45)) {
        return;
      }
      _lastMmPromptKey = key;
      _lastMmPromptAt = now;
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
    return;
  }

  // STK already pushed by the network — nothing to open in-app.
  final key = (providerRef?.trim().isNotEmpty == true)
      ? providerRef!.trim()
      : url;
  if (key.isEmpty) return;

  final now = DateTime.now();
  if (_lastMmPromptKey == key &&
      _lastMmPromptAt != null &&
      now.difference(_lastMmPromptAt!) < const Duration(seconds: 45)) {
    return;
  }
  _lastMmPromptKey = key;
  _lastMmPromptAt = now;
}

import 'package:url_launcher/url_launcher.dart';

String? _lastMmPromptKey;
DateTime? _lastMmPromptAt;

/// Opens a hosted checkout URL when the aggregator returns one.
///
/// Do **not** auto-dial USSD (`tel:*…#`). SerdiPay / AfriMomo already send a
/// network STK/USSD push for **M-Pesa, Airtel Money et Orange Money**
/// (PIN dialog type « AFRIMOMORDC »). Dialing USSD on top of that makes Android
/// re-open the PIN sheet in a loop when the user taps Cancel — all operators.
Future<void> openMobileMoneyPrompt({
  String? paymentUrl,
  String? ussdCode,
  String? providerRef,
}) async {
  final url = paymentUrl?.trim() ?? '';
  if (url.startsWith('http://') || url.startsWith('https://')) {
    final uri = Uri.tryParse(url);
    if (uri != null) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
    return;
  }

  // Intentionally ignore [ussdCode]: STK push is enough. Keep the parameter so
  // call sites stay compatible without re-triggering Cancel loops.
  final _ = ussdCode;
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

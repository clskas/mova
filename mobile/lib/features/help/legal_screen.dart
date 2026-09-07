import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:http/http.dart' as http;
import 'package:webview_flutter/webview_flutter.dart';
import '../../core/config/market_config.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';

class LegalScreen extends StatelessWidget {
  const LegalScreen({
    super.key,
    required this.title,
    required this.asset,
    this.apiPath,
  });

  final String title;
  final String asset;

  /// Chemin public passerelle, ex. `/public/cgu`. Si fourni, prioritaire sur l'asset.
  final String? apiPath;

  Future<({String body, String format})> _load() async {
    final path = apiPath;
    if (path != null && path.isNotEmpty) {
      try {
        final uri = Uri.parse('${MarketConfig.effectiveApiBaseUrl}$path');
        final res = await http.get(uri).timeout(const Duration(seconds: 8));
        if (res.statusCode >= 200 && res.statusCode < 300) {
          final data = jsonDecode(res.body);
          if (data is Map<String, dynamic>) {
            final body = data['body']?.toString();
            final format = data['format']?.toString() ?? 'markdown';
            if (body != null && body.trim().isNotEmpty) {
              return (body: body, format: format);
            }
          }
        }
      } catch (_) {}
    }
    return (body: await rootBundle.loadString(asset), format: 'markdown');
  }

  @override
  Widget build(BuildContext context) {
    return MovaScreen(
      title: title,
      child: FutureBuilder<({String body, String format})>(
        future: _load(),
        builder: (context, snapshot) {
          if (snapshot.hasError) {
            return const Center(
              child: Text(
                'Document indisponible. Réessayez plus tard.',
                style: TextStyle(color: MovaColors.textSecondary),
              ),
            );
          }
          if (snapshot.hasData) {
            final doc = snapshot.data!;
            if (doc.format == 'html') {
              return _HtmlLegalBody(html: doc.body);
            }
            return Markdown(
              data: doc.body,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              styleSheet: MarkdownStyleSheet(
                h1: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.bold,
                      color: MovaColors.midnight,
                    ),
                h2: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w600,
                      color: MovaColors.violet,
                    ),
                p: Theme.of(context).textTheme.bodyMedium,
              ),
            );
          }
          return const Center(child: CircularProgressIndicator(color: MovaColors.violet));
        },
      ),
    );
  }
}

class _HtmlLegalBody extends StatefulWidget {
  const _HtmlLegalBody({required this.html});

  final String html;

  @override
  State<_HtmlLegalBody> createState() => _HtmlLegalBodyState();
}

class _HtmlLegalBodyState extends State<_HtmlLegalBody> {
  late final WebViewController _controller;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.disabled)
      ..loadHtmlString(widget.html);
  }

  @override
  Widget build(BuildContext context) {
    return WebViewWidget(controller: _controller);
  }
}

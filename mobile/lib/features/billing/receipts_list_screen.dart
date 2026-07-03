import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import 'billing_util.dart';
import 'receipt_screen.dart';

class ReceiptsListScreen extends ConsumerStatefulWidget {
  const ReceiptsListScreen({super.key});

  @override
  ConsumerState<ReceiptsListScreen> createState() => _ReceiptsListScreenState();
}

class _ReceiptsListScreenState extends ConsumerState<ReceiptsListScreen> {
  List<dynamic> _items = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final api = ref.read(apiClientProvider);
    final result = await api.getReceiptHistory();
    if (!mounted) return;
    switch (result) {
      case Success(:final data):
        setState(() {
          _items = data['data'] as List? ?? [];
          _loading = false;
        });
      case Failure(:final error):
        setState(() {
          _loading = false;
          _error = error.message;
        });
    }
  }

  void _openReceipt(Map<String, dynamic> item) {
    final type = item['referenceType']?.toString() ?? 'RIDE';
    final id = item['referenceId']?.toString() ?? '';
    if (id.isEmpty) return;
    if (type == 'RIDE') {
      Navigator.push(context, MaterialPageRoute(builder: (_) => ReceiptScreen(rideId: id)));
      return;
    }
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => ReceiptScreen(serviceType: type, serviceId: id)),
    );
  }

  @override
  Widget build(BuildContext context) {
    return MovaScreen(
      title: 'Mes reçus',
      child: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? MovaErrorBanner(message: _error!, onRetry: _load)
              : _items.isEmpty
                  ? const Padding(
                      padding: EdgeInsets.symmetric(vertical: 48),
                      child: Center(
                        child: Text(
                          'Aucun reçu disponible pour le moment.',
                          style: TextStyle(color: MovaColors.textSecondary),
                          textAlign: TextAlign.center,
                        ),
                      ),
                    )
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView.builder(
                        itemCount: _items.length,
                        itemBuilder: (context, index) {
                          final item = _items[index] as Map<String, dynamic>;
                          final createdAt = item['createdAt']?.toString();
                          return Padding(
                            padding: const EdgeInsets.only(bottom: 8),
                            child: MovaCard(
                              onTap: () => _openReceipt(item),
                              child: Row(
                                children: [
                                  const Icon(Icons.receipt_long, color: MovaColors.violet),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          item['title']?.toString() ?? item['serviceTypeLabel']?.toString() ?? 'Reçu',
                                          maxLines: 2,
                                          overflow: TextOverflow.ellipsis,
                                          style: const TextStyle(fontWeight: FontWeight.w600),
                                        ),
                                        const SizedBox(height: 4),
                                        Text(
                                          item['receiptNumber']?.toString() ?? '',
                                          style: const TextStyle(fontFamily: 'monospace', fontSize: 12),
                                        ),
                                        if (createdAt != null)
                                          Text(
                                            DateTime.tryParse(createdAt)?.toLocal().toString().split('.').first ?? createdAt,
                                            style: const TextStyle(color: MovaColors.textSecondary, fontSize: 12),
                                          ),
                                      ],
                                    ),
                                  ),
                                  Column(
                                    crossAxisAlignment: CrossAxisAlignment.end,
                                    children: [
                                      Text(
                                        MarketConfig.formatCdf(item['amountCdf'] as int? ?? 0),
                                        style: const TextStyle(color: MovaColors.green, fontWeight: FontWeight.w600),
                                      ),
                                      const Icon(Icons.chevron_right, color: MovaColors.textSecondary),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                          );
                        },
                      ),
                    ),
    );
  }
}

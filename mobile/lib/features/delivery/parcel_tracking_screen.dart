import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_client.dart';
import '../../core/error/result.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';

class ParcelTrackingScreen extends ConsumerStatefulWidget {
  const ParcelTrackingScreen({super.key, required this.parcelId});

  final String parcelId;

  @override
  ConsumerState<ParcelTrackingScreen> createState() => _ParcelTrackingScreenState();
}

class _ParcelTrackingScreenState extends ConsumerState<ParcelTrackingScreen> {
  Map<String, dynamic>? _delivery;
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
    await api.loadToken();
    await api.checkHealth();
    final result = await api.get('/deliveries/parcel/${widget.parcelId}');
    setState(() {
      _loading = false;
      switch (result) {
        case Success(:final data):
          _delivery = data['delivery'] as Map<String, dynamic>?;
        case Failure(:final error):
          _error = error.message;
      }
    });
  }

  String _statusLabel(String? status) => switch (status) {
        'CONFIRMED' => 'Confirmé',
        'PICKUP' => 'Enlèvement',
        'IN_TRANSIT' => 'En transit',
        'DELIVERED' => 'Livré',
        _ => status ?? '',
      };

  @override
  Widget build(BuildContext context) {
    return MovaScreen(
      title: 'Suivi colis',
      child: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Column(
                  children: [
                    MovaErrorBanner(message: _error!, onRetry: _load),
                    const SizedBox(height: 16),
                    MovaButton(
                      label: 'Retour',
                      isSecondary: true,
                      icon: Icons.arrow_back,
                      onPressed: () => Navigator.pop(context),
                    ),
                  ],
                )
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    MovaCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Colis #${widget.parcelId}',
                            style: const TextStyle(
                              fontWeight: FontWeight.bold,
                              fontSize: 16,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          const SizedBox(height: 8),
                          Text(
                            '${_delivery?['pickupAddress'] ?? 'Enlèvement'} → '
                            '${_delivery?['dropoffAddress'] ?? 'Livraison'}',
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                          const SizedBox(height: 8),
                          Text(
                            _statusLabel(_delivery?['status']?.toString()),
                            style: const TextStyle(
                              color: MovaColors.violet,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 20),
                    Text(
                      'Statuts',
                      style: Theme.of(context).textTheme.titleSmall,
                    ),
                    const SizedBox(height: 12),
                    ...(_delivery?['timeline'] as List? ?? []).map((step) {
                      final map = step as Map<String, dynamic>;
                      final done = map['done'] == true;
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Icon(
                              done ? Icons.check_circle : Icons.radio_button_unchecked,
                              color: done ? MovaColors.green : MovaColors.textSecondary,
                              size: 22,
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Text(
                                map['label']?.toString() ?? '',
                                style: TextStyle(
                                  fontWeight: done ? FontWeight.w600 : FontWeight.normal,
                                  color: done ? MovaColors.midnight : MovaColors.textSecondary,
                                ),
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ],
                        ),
                      );
                    }),
                    const SizedBox(height: 24),
                    MovaButton(
                      label: 'Retour à l\'accueil',
                      isSecondary: true,
                      icon: Icons.home_outlined,
                      onPressed: () => Navigator.popUntil(context, (r) => r.isFirst),
                    ),
                  ],
                ),
    );
  }
}

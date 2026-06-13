import 'package:flutter/material.dart';
import '../../core/config/market_config.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';

class CarpoolJoinConfirmationScreen extends StatelessWidget {
  const CarpoolJoinConfirmationScreen({
    super.key,
    required this.tripId,
    required this.fromAddress,
    required this.toAddress,
    required this.driverName,
    required this.pricePerSeatCdf,
    this.departureAt,
  });

  final String tripId;
  final String fromAddress;
  final String toAddress;
  final String driverName;
  final int pricePerSeatCdf;
  final String? departureAt;

  @override
  Widget build(BuildContext context) {
    return MovaScreen(
      title: 'Réservation confirmée',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Icon(Icons.check_circle, color: MovaColors.green, size: 72),
          const SizedBox(height: 16),
          const Text(
            'Vous avez rejoint le trajet',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 24),
          MovaCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '$fromAddress → $toAddress',
                  style: const TextStyle(fontWeight: FontWeight.w600),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 8),
                Text('Conducteur : $driverName'),
                if (departureAt != null) Text('Départ : $departureAt'),
                const SizedBox(height: 8),
                Text(
                  MarketConfig.formatCdf(pricePerSeatCdf),
                  style: const TextStyle(
                    fontWeight: FontWeight.bold,
                    color: MovaColors.green,
                    fontSize: 18,
                  ),
                ),
                Text(
                  'Réf. $tripId',
                  style: const TextStyle(color: MovaColors.textSecondary, fontSize: 12),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          MovaButton(
            label: 'Retour à l\'accueil',
            icon: Icons.home_outlined,
            onPressed: () => Navigator.popUntil(context, (r) => r.isFirst),
          ),
        ],
      ),
    );
  }
}

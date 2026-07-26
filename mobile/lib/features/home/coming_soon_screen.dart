import 'package:flutter/material.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';

/// Placeholder for services not yet available nationwide.
class ComingSoonScreen extends StatelessWidget {
  const ComingSoonScreen({
    super.key,
    required this.serviceName,
    this.description,
  });

  final String serviceName;
  final String? description;

  @override
  Widget build(BuildContext context) {
    return MovaScreen(
      title: serviceName,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SizedBox(height: 32),
          Icon(
            Icons.schedule,
            size: 64,
            color: MovaColors.violet.withValues(alpha: 0.6),
          ),
          const SizedBox(height: 24),
          Text(
            'Bientôt disponible',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.bold,
                  color: MovaColors.midnight,
                ),
          ),
          const SizedBox(height: 12),
          Text(
            description ??
                '$serviceName arrive prochainement sur SENGA, partout en RDC.',
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: MovaColors.textSecondary,
              height: 1.4,
            ),
          ),
          const SizedBox(height: 32),
          MovaButton(
            label: 'Retour à l\'accueil',
            icon: Icons.arrow_back,
            isSecondary: true,
            onPressed: () => Navigator.pop(context),
          ),
        ],
      ),
    );
  }
}

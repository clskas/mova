import 'package:flutter/material.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_widgets.dart';

/// Tappable service tile for the SENGA home hub.
class ServiceCard extends StatelessWidget {
  const ServiceCard({
    super.key,
    required this.icon,
    required this.title,
    required this.subtitle,
    this.iconColor = MovaColors.violet,
    this.onTap,
    this.comingSoon = false,
    this.live = false,
    this.compact = false,
    this.brandedIcon = false,
  });

  final Widget icon;
  final String title;
  final String subtitle;
  final Color iconColor;
  final VoidCallback? onTap;
  final bool comingSoon;
  final bool live;
  final bool compact;
  /// Icône PNG pleine (sans fond dégradé supplémentaire).
  final bool brandedIcon;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return MovaCard(
      onTap: onTap,
      padding: EdgeInsets.all(compact ? 10 : 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (brandedIcon)
            ClipRRect(
              borderRadius: BorderRadius.circular(14),
              child: SizedBox(
                width: compact ? 52 : 58,
                height: compact ? 52 : 58,
                child: FittedBox(fit: BoxFit.cover, child: icon),
              ),
            )
          else
            Container(
              padding: EdgeInsets.all(compact ? 8 : 11),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    iconColor.withValues(alpha: 0.18),
                    iconColor.withValues(alpha: 0.06),
                  ],
                ),
                borderRadius: BorderRadius.circular(14),
              ),
              child: icon,
            ),
          const SizedBox(height: 12),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  title,
                  maxLines: compact ? 3 : 2,
                  overflow: TextOverflow.ellipsis,
                  style: (compact
                          ? theme.textTheme.bodyLarge
                          : theme.textTheme.titleSmall)
                      ?.copyWith(
                    fontWeight: FontWeight.w700,
                    color: MovaColors.midnight,
                  ),
                ),
              ),
              if (live) ...[
                const SizedBox(width: 6),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
                  decoration: BoxDecoration(
                    color: MovaColors.green.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Text(
                    'Live',
                    style: TextStyle(
                      color: MovaColors.green,
                      fontSize: 10,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ] else if (comingSoon) ...[
                const SizedBox(width: 6),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
                  decoration: BoxDecoration(
                    color: MovaColors.orange.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Text(
                    'Demande',
                    style: TextStyle(
                      color: MovaColors.orange,
                      fontSize: 10,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ],
          ),
          SizedBox(height: compact ? 2 : 4),
          Text(
            subtitle,
            maxLines: compact ? 3 : 2,
            overflow: TextOverflow.ellipsis,
            style: theme.textTheme.bodySmall?.copyWith(
              color: MovaColors.textSecondary,
              height: 1.3,
              fontSize: compact ? 11 : null,
            ),
          ),
        ],
      ),
    );
  }
}

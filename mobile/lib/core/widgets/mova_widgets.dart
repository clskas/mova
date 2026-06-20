import 'package:flutter/material.dart';
import '../error/user_friendly_error.dart';
import '../theme/mova_colors.dart';

class MovaCard extends StatelessWidget {
  const MovaCard({
    super.key,
    required this.child,
    this.onTap,
    this.padding = const EdgeInsets.all(16),
    this.margin,
    this.gradient,
  });

  final Widget child;
  final VoidCallback? onTap;
  final EdgeInsets padding;
  final EdgeInsets? margin;
  final Gradient? gradient;

  @override
  Widget build(BuildContext context) {
    final content = Container(
      margin: margin,
      decoration: BoxDecoration(
        gradient: gradient,
        color: gradient == null ? MovaColors.white : null,
        borderRadius: BorderRadius.circular(18),
        border: gradient == null ? Border.all(color: MovaColors.border, width: 0.5) : null,
        boxShadow: gradient == null ? MovaColors.cardShadow : null,
      ),
      child: Padding(padding: padding, child: child),
    );
    if (onTap != null) {
      return Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(18),
          child: content,
        ),
      );
    }
    return content;
  }
}

class MovaButton extends StatelessWidget {
  const MovaButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.isLoading = false,
    this.isSecondary = false,
    this.icon,
  });

  final String label;
  final VoidCallback? onPressed;
  final bool isLoading;
  final bool isSecondary;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final labelWidget = Text(
      label,
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      textAlign: TextAlign.center,
    );
    return SizedBox(
      width: double.infinity,
      child: isSecondary
          ? OutlinedButton.icon(
              onPressed: isLoading ? null : onPressed,
              icon: isLoading
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : Icon(icon ?? Icons.arrow_forward_rounded),
              label: labelWidget,
            )
          : DecoratedBox(
              decoration: BoxDecoration(
                gradient: onPressed == null || isLoading ? null : MovaColors.primaryGradient,
                borderRadius: BorderRadius.circular(14),
                color: onPressed == null || isLoading ? MovaColors.textMuted : null,
              ),
              child: ElevatedButton.icon(
                onPressed: isLoading ? null : onPressed,
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.transparent,
                  shadowColor: Colors.transparent,
                  elevation: 0,
                ),
                icon: isLoading
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    : Icon(icon ?? Icons.arrow_forward_rounded),
                label: labelWidget,
              ),
            ),
    );
  }
}

class MovaErrorBanner extends StatelessWidget {
  const MovaErrorBanner({super.key, required this.message, this.onRetry});

  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final friendly = sanitizeUserMessage(message);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: MovaColors.orange.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: MovaColors.orange.withValues(alpha: 0.4)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.info_outline_rounded, color: MovaColors.orange, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              friendly,
              style: const TextStyle(fontSize: 13, height: 1.35),
              maxLines: 4,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          if (onRetry != null)
            TextButton(onPressed: onRetry, child: const Text('Réessayer')),
        ],
      ),
    );
  }
}

/// Bandeau d'accueil gradient pour l'écran d'accueil passager.
class MovaWelcomeBanner extends StatelessWidget {
  const MovaWelcomeBanner({
    super.key,
    required this.greeting,
    required this.subtitle,
    this.trailing,
  });

  final String greeting;
  final String subtitle;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(18, 20, 18, 20),
      decoration: BoxDecoration(
        gradient: MovaColors.heroGradient,
        borderRadius: BorderRadius.circular(22),
        boxShadow: [
          BoxShadow(
            color: MovaColors.violet.withValues(alpha: 0.35),
            blurRadius: 24,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  greeting,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        color: MovaColors.white,
                        fontWeight: FontWeight.w800,
                        letterSpacing: -0.3,
                      ),
                ),
                const SizedBox(height: 6),
                Text(
                  subtitle,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: MovaColors.white.withValues(alpha: 0.85),
                      ),
                ),
              ],
            ),
          ),
          if (trailing != null) ...[const SizedBox(width: 8), trailing!],
        ],
      ),
    );
  }
}

import 'package:flutter/material.dart';
import '../../../core/config/market_config.dart';
import '../../../core/theme/mova_colors.dart';

class VehicleEstimate {
  const VehicleEstimate({
    required this.vehicleType,
    this.priceCdf,
    this.loading = false,
  });

  final String vehicleType;
  final int? priceCdf;
  final bool loading;
}

class VehicleSelector extends StatelessWidget {
  const VehicleSelector({
    super.key,
    required this.selected,
    required this.estimates,
    required this.onSelected,
  });

  final String selected;
  final Map<String, VehicleEstimate> estimates;
  final ValueChanged<String> onSelected;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 118,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: MarketConfig.vehicleTypes.length,
        separatorBuilder: (_, __) => const SizedBox(width: 10),
        itemBuilder: (context, index) {
          final option = MarketConfig.vehicleTypes[index];
          final estimate = estimates[option.id];
          final isSelected = selected == option.id;
          final isMoto = option.id == 'MOTO_TAXI';

          return SizedBox(
            width: 108,
            child: Material(
              color: Colors.transparent,
              child: InkWell(
                onTap: () => onSelected(option.id),
                borderRadius: BorderRadius.circular(16),
                child: Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: Theme.of(context).cardColor,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(
                      color: isSelected
                          ? (isMoto ? MovaColors.green : MovaColors.violet)
                          : Colors.grey.shade200,
                      width: isSelected ? 2 : 1,
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.04),
                        blurRadius: 4,
                        offset: const Offset(0, 2),
                      ),
                    ],
                  ),
                  child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(option.icon, style: const TextStyle(fontSize: 22)),
                    const SizedBox(height: 4),
                    Text(
                      option.label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontWeight: FontWeight.w600,
                        fontSize: 13,
                        color: isSelected ? MovaColors.midnight : MovaColors.textSecondary,
                      ),
                    ),
                    const Spacer(),
                    if (estimate?.loading == true)
                      const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    else if (estimate?.priceCdf != null)
                      Text(
                        MarketConfig.formatCdf(estimate!.priceCdf!),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                          color: isMoto ? MovaColors.green : MovaColors.violet,
                        ),
                      )
                    else
                      const Text(
                        '—',
                        style: TextStyle(color: MovaColors.textSecondary, fontSize: 12),
                      ),
                  ],
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

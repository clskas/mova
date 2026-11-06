import 'package:flutter/material.dart';

import '../config/market_config.dart';
import '../theme/mova_colors.dart';

/// Swipeable vehicle photos (up to 5) with a "2/5" counter and dots.
class VehiclePhotoGallery extends StatefulWidget {
  const VehiclePhotoGallery({super.key, required this.photos, this.height = 180});

  final List<String> photos;
  final double height;

  @override
  State<VehiclePhotoGallery> createState() => _VehiclePhotoGalleryState();
}

class _VehiclePhotoGalleryState extends State<VehiclePhotoGallery> {
  int _index = 0;

  Widget _placeholder() => Container(
        height: widget.height,
        color: MovaColors.violet.withValues(alpha: 0.15),
        child: const Center(child: Icon(Icons.directions_car, size: 64, color: MovaColors.violet)),
      );

  @override
  Widget build(BuildContext context) {
    final photos = widget.photos;
    if (photos.isEmpty) {
      return ClipRRect(borderRadius: BorderRadius.circular(12), child: _placeholder());
    }
    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: SizedBox(
        height: widget.height,
        child: Stack(
          children: [
            PageView.builder(
              key: const Key('vehiclePhotoGallery'),
              itemCount: photos.length,
              onPageChanged: (i) => setState(() => _index = i),
              itemBuilder: (_, i) => Image.network(
                MarketConfig.resolveMediaUrl(photos[i]),
                width: double.infinity,
                height: widget.height,
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => _placeholder(),
              ),
            ),
            if (photos.length > 1) ...[
              Positioned(
                right: 8,
                top: 8,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(color: Colors.black54, borderRadius: BorderRadius.circular(10)),
                  child: Text(
                    '${_index + 1}/${photos.length}',
                    style: const TextStyle(color: Colors.white, fontSize: 12),
                  ),
                ),
              ),
              Positioned(
                left: 0,
                right: 0,
                bottom: 8,
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    for (var i = 0; i < photos.length; i++)
                      Container(
                        width: 7,
                        height: 7,
                        margin: const EdgeInsets.symmetric(horizontal: 3),
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: i == _index ? Colors.white : Colors.white54,
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

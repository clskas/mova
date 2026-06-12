import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/ride_socket.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import '../rating/rating_screen.dart';

class TrackingScreen extends ConsumerStatefulWidget {
  const TrackingScreen({super.key, required this.rideId});

  final String rideId;

  @override
  ConsumerState<TrackingScreen> createState() => _TrackingScreenState();
}

class _TrackingScreenState extends ConsumerState<TrackingScreen> {
  String _status = 'Recherche de chauffeur…';
  bool _mock = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _connectSocket());
  }

  void _connectSocket() {
    if (!mounted) return;
    final socket = ref.read(rideSocketProvider);
    socket.connect(
      rideId: widget.rideId,
      onConnected: () {
        if (mounted) setState(() => _status = 'Chauffeur en route');
      },
      onDisconnected: () {
        if (!mounted) return;
        setState(() {
          _mock = socket.mockMode;
          if (_mock) _status = 'Suivi démo — passerelle indisponible';
        });
      },
      onLocation: (_) {
        if (mounted) setState(() => _status = 'Chauffeur en route');
      },
    );
  }

  @override
  void dispose() {
    ref.read(rideSocketProvider).dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MovaScreen(
      title: 'Suivi de course',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SizedBox(height: 16),
          if (_mock)
            const Padding(
              padding: EdgeInsets.only(bottom: 12),
              child: Text(
                'Mode démo — suivi GPS hors ligne',
                textAlign: TextAlign.center,
                style: TextStyle(color: MovaColors.orange, fontSize: 13),
              ),
            ),
          MovaCard(
            child: Column(
              children: [
                const Icon(Icons.directions_car, size: 48, color: MovaColors.violet),
                const SizedBox(height: 12),
                Text(
                  _status,
                  style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 8),
                Text('Course #${widget.rideId}', style: const TextStyle(color: MovaColors.textSecondary)),
                const SizedBox(height: 16),
                const LinearProgressIndicator(color: MovaColors.violet),
              ],
            ),
          ),
          const SizedBox(height: 24),
          MovaButton(
            label: 'Course terminée — Noter',
            onPressed: () => Navigator.pushReplacement(
              context,
              MaterialPageRoute(
                builder: (_) => RatingScreen(rideId: widget.rideId),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

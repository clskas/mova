import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/error/result.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import '../../core/api/api_client.dart';

class RatingScreen extends ConsumerStatefulWidget {
  const RatingScreen({super.key, required this.rideId, this.driverId});

  final String rideId;
  final String? driverId;

  @override
  ConsumerState<RatingScreen> createState() => _RatingScreenState();
}

class _RatingScreenState extends ConsumerState<RatingScreen> {
  int _score = 5;
  bool _loading = false;
  bool _loadingRide = true;
  String? _error;
  String? _driverId;
  String? _driverName;
  final _commentController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _driverId = widget.driverId;
    _loadRide();
  }

  @override
  void dispose() {
    _commentController.dispose();
    super.dispose();
  }

  Future<void> _loadRide() async {
    if (_driverId != null) {
      setState(() => _loadingRide = false);
      return;
    }
    final api = ref.read(apiClientProvider);
    final result = await api.getRide(widget.rideId);
    if (!mounted) return;
    setState(() {
      _loadingRide = false;
      if (result case Success(:final data)) {
        _driverId = data['driverId']?.toString();
        final driver = data['driver'] as Map<String, dynamic>?;
        _driverName = driver?['name']?.toString();
      }
    });
  }

  Future<void> _submit() async {
    final toUserId = _driverId;
    if (toUserId == null || toUserId.isEmpty) {
      setState(() => _error = 'Chauffeur introuvable pour cette course.');
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });
    final api = ref.read(apiClientProvider);
    final result = await api.post('/ratings', {
      'rideId': widget.rideId,
      'toUserId': toUserId,
      'score': _score,
      if (_commentController.text.trim().isNotEmpty)
        'comment': _commentController.text.trim(),
    });
    if (!mounted) return;
    setState(() => _loading = false);

    switch (result) {
      case Success():
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Merci pour votre notation !')),
        );
        Navigator.of(context).popUntil((r) => r.isFirst);
      case Failure(:final error):
        setState(() => _error = error.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    return MovaScreen(
      title: 'Noter la course',
      child: _loadingRide
          ? const Center(child: CircularProgressIndicator())
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const SizedBox(height: 16),
                Text(
                  _driverName != null
                      ? 'Comment était votre course avec $_driverName ?'
                      : 'Comment était votre course ?',
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 18),
                ),
                const SizedBox(height: 16),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: List.generate(
                    5,
                    (i) => IconButton(
                      icon: Icon(
                        i < _score ? Icons.star : Icons.star_border,
                        color: Colors.amber,
                        size: 40,
                      ),
                      onPressed: () => setState(() => _score = i + 1),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _commentController,
                  maxLines: 3,
                  decoration: const InputDecoration(
                    labelText: 'Commentaire (optionnel)',
                    hintText: 'Partagez votre expérience…',
                    alignLabelWithHint: true,
                  ),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  MovaErrorBanner(message: _error!, onRetry: _submit),
                ],
                const SizedBox(height: 24),
                MovaButton(
                  label: 'Envoyer',
                  isLoading: _loading,
                  onPressed: _submit,
                ),
              ],
            ),
    );
  }
}

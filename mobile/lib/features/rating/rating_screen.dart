import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import '../../core/api/api_client.dart';

class RatingScreen extends ConsumerStatefulWidget {
  const RatingScreen({super.key, required this.rideId});

  final String rideId;

  @override
  ConsumerState<RatingScreen> createState() => _RatingScreenState();
}

class _RatingScreenState extends ConsumerState<RatingScreen> {
  int _score = 5;
  bool _loading = false;

  Future<void> _submit() async {
    setState(() => _loading = true);
    final api = ref.read(apiClientProvider);
    await api.post('/ratings', {
      'rideId': widget.rideId,
      'toUserId': '00000000-0000-0000-0000-000000000000',
      'score': _score,
    });
    setState(() => _loading = false);
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Merci pour votre notation !')),
      );
      Navigator.of(context).popUntil((r) => r.isFirst);
    }
  }

  @override
  Widget build(BuildContext context) {
    return MovaScreen(
      title: 'Noter la course',
      child: Column(
        children: [
          const SizedBox(height: 32),
          const Text('Comment était votre course ?', style: TextStyle(fontSize: 18)),
          const SizedBox(height: 24),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: List.generate(5, (i) => IconButton(
                  icon: Icon(
                    i < _score ? Icons.star : Icons.star_border,
                    color: Colors.amber,
                    size: 40,
                  ),
                  onPressed: () => setState(() => _score = i + 1),
                )),
          ),
          const SizedBox(height: 32),
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

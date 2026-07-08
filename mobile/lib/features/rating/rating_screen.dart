import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/error/result.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import '../../core/api/api_client.dart';

class RatingScreen extends ConsumerStatefulWidget {
  const RatingScreen({
    super.key,
    this.rideId,
    this.errandId,
    this.driverId,
    this.peerLabel,
  }) : assert(rideId != null || errandId != null);

  final String? rideId;
  final String? errandId;
  final String? driverId;
  final String? peerLabel;

  bool get isErrand => errandId != null;

  @override
  ConsumerState<RatingScreen> createState() => _RatingScreenState();
}

class _RatingScreenState extends ConsumerState<RatingScreen> {
  int _score = 5;
  bool _loading = false;
  bool _loadingContext = true;
  String? _error;
  String? _driverId;
  String? _peerName;
  final _commentController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _driverId = widget.driverId;
    _loadContext();
  }

  @override
  void dispose() {
    _commentController.dispose();
    super.dispose();
  }

  Future<void> _loadContext() async {
    if (_driverId != null) {
      setState(() => _loadingContext = false);
      return;
    }
    final api = ref.read(apiClientProvider);
    if (widget.isErrand) {
      final result = await api.get('/errands/${widget.errandId}');
      if (!mounted) return;
      setState(() {
        _loadingContext = false;
        if (result case Success(:final data)) {
          final order = data['errand'] as Map<String, dynamic>? ?? data;
          _driverId = order['driverId']?.toString();
          final courier = order['courier'] as Map<String, dynamic>?;
          _peerName = courier?['name']?.toString() ?? widget.peerLabel;
        }
      });
      return;
    }
    final result = await api.getRide(widget.rideId!);
    if (!mounted) return;
    setState(() {
      _loadingContext = false;
      if (result case Success(:final data)) {
        _driverId = data['driverId']?.toString();
        final driver = data['driver'] as Map<String, dynamic>?;
        _peerName = driver?['name']?.toString();
      }
    });
  }

  Future<void> _submit() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final api = ref.read(apiClientProvider);
    final comment = _commentController.text.trim();

    final Result<Map<String, dynamic>> result;
    if (widget.isErrand) {
      result = await api.rateErrand(
        widget.errandId!,
        courierScore: _score,
        comment: comment.isNotEmpty ? comment : null,
      );
    } else {
      final toUserId = _driverId;
      if (toUserId == null || toUserId.isEmpty) {
        setState(() {
          _loading = false;
          _error = 'Chauffeur introuvable pour cette course.';
        });
        return;
      }
      result = await api.post('/ratings', {
        'rideId': widget.rideId,
        'toUserId': toUserId,
        'score': _score,
        if (comment.isNotEmpty) 'comment': comment,
      });
    }

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

  String get _title => widget.isErrand ? 'Noter le livreur' : 'Noter la course';

  String get _prompt {
    final label = widget.isErrand ? 'livraison' : 'course';
    final peer = _peerName ?? widget.peerLabel;
    if (peer != null) {
      return 'Comment était votre $label avec $peer ?';
    }
    return widget.isErrand ? 'Comment était votre livreur ?' : 'Comment était votre course ?';
  }

  @override
  Widget build(BuildContext context) {
    return MovaScreen(
      title: _title,
      child: _loadingContext
          ? const Center(child: CircularProgressIndicator())
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const SizedBox(height: 16),
                Text(
                  _prompt,
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

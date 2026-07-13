import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:geolocator/geolocator.dart';
import '../../core/api/api_client.dart';
import '../../core/api/ride_socket.dart';
import '../../core/geo/maps_launcher.dart';
import '../../core/error/result.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import '../chat/chat_alert_service.dart';
import '../chat/delivery_chat_screen.dart';
import '../chat/errand_chat_screen.dart';
import '../../core/billing/service_price_display.dart';
import '../delivery/delivery_payment_state.dart';
import 'widgets/driver_cash_pin_dialog.dart';

class ActiveDeliveryScreen extends ConsumerStatefulWidget {
  const ActiveDeliveryScreen({
    super.key,
    required this.delivery,
    this.autoOpenCashPin = false,
  });

  final Map<String, dynamic> delivery;
  /// Ouvre automatiquement la saisie du PIN espèces (ex. événement socket ou accueil chauffeur).
  final bool autoOpenCashPin;

  @override
  ConsumerState<ActiveDeliveryScreen> createState() => _ActiveDeliveryScreenState();
}

class _ActiveDeliveryScreenState extends ConsumerState<ActiveDeliveryScreen> {
  late Map<String, dynamic> _delivery;
  bool _loading = false;
  bool _uploadingProof = false;
  String? _error;
  Timer? _locationTimer;
  Timer? _paymentPollTimer;
  String? _userId;
  bool _cashDialogOpen = false;
  bool _skipNextCashAutoOpen = false;

  String get _deliveryId => _delivery['id']?.toString() ?? '';
  String get _status => _delivery['status']?.toString() ?? 'PENDING';
  bool get _isPaid => _delivery['isPaid'] == true;
  bool get _cashPending {
    final done = _isErrand ? _status == 'COMPLETED' : _status == 'DELIVERED';
    return done &&
        !_isPaid &&
        _delivery['paymentStatus']?.toString().toUpperCase() == 'PENDING';
  }

  String get _typeLabel {
    return switch (_delivery['type']?.toString()) {
      'FOOD' => 'Livraison repas',
      'EXPRESS' => 'Express',
      'PARCEL' => 'Colis',
      'ERRAND' => 'Courses & commissions',
      _ => 'Livraison',
    };
  }

  bool get _isErrand => _delivery['type']?.toString() == 'ERRAND';

  bool get _isFood => _delivery['type']?.toString() == 'FOOD';

  String get _restaurantName {
    final restaurant = _delivery['restaurant'];
    if (restaurant is Map) {
      return restaurant['name']?.toString() ?? 'Restaurant';
    }
    return _delivery['restaurantName']?.toString() ?? 'Restaurant';
  }

  @override
  void initState() {
    super.initState();
    _delivery = Map<String, dynamic>.from(widget.delivery);
    _bootstrapTracking();
  }

  @override
  void dispose() {
    _locationTimer?.cancel();
    _paymentPollTimer?.cancel();
    ref.read(rideSocketProvider).clearHandlers();
    super.dispose();
  }

  Future<void> _bootstrapTracking() async {
    final api = ref.read(apiClientProvider);
    final profile = await api.getDriverProfile();
    if (profile case Success(:final data)) {
      _userId = data['userId']?.toString();
    }
    await _refresh();
    await _connectTrackingSocket();
    _startLocationUpdates();
    _syncPaymentPolling();
    if (widget.autoOpenCashPin || _cashPending) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _autoOpenCashConfirm());
    }
  }

  Future<void> _connectTrackingSocket() async {
    final api = ref.read(apiClientProvider);
    if (api.isMockMode) return;
    final token = await api.authToken();
    if (!mounted) return;
    final socket = ref.read(rideSocketProvider);
    socket.connectDelivery(
      deliveryId: _deliveryId,
      token: token,
      referenceType: _isErrand ? 'ERRAND' : 'DELIVERY',
      driverUserId: _userId,
      onCashPending: (payload) async {
        final deliveryId = payload['deliveryId']?.toString();
        if (deliveryId != null && deliveryId != _deliveryId) return;
        await _refresh();
        if (!mounted) return;
        WidgetsBinding.instance.addPostFrameCallback((_) => _autoOpenCashConfirm());
      },
      onChat: (payload) {
        final id = payload['deliveryId']?.toString() ?? payload['rideId']?.toString();
        if (id != null && id != _deliveryId) return;
        final role = payload['senderRole']?.toString() ?? '';
        if (role == 'driver') return;
        final text = payload['text']?.toString() ?? '';
        ChatAlertService.notifyIncoming(
          kind: _isErrand ? 'errand' : 'delivery',
          threadId: _deliveryId,
          senderRole: role,
          text: text,
          peerLabel: 'Client',
        );
      },
    );
  }

  void _autoOpenCashConfirm() {
    if (!mounted || _cashDialogOpen || _isPaid || _skipNextCashAutoOpen) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || _cashDialogOpen || _isPaid) return;
      _confirmCash(auto: true);
    });
  }

  void _syncPaymentPolling() {
    _paymentPollTimer?.cancel();
    final awaitingPayment = _isErrand
        ? _status == 'COMPLETED' && !_isPaid
        : _status == 'DELIVERED' && !_isPaid;
    if (awaitingPayment) {
      _paymentPollTimer = Timer.periodic(const Duration(seconds: 5), (_) => _refresh());
    }
  }

  void _startLocationUpdates() {
    _locationTimer?.cancel();
    _locationTimer = Timer.periodic(const Duration(seconds: 12), (_) => _pushLocation());
    _pushLocation();
  }

  Future<void> _pushLocation() async {
    if (!await Geolocator.isLocationServiceEnabled()) return;
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied || permission == LocationPermission.deniedForever) {
      return;
    }
    final pos = await Geolocator.getCurrentPosition();
    final api = ref.read(apiClientProvider);
    await api.updateDriverLocation(pos.latitude, pos.longitude);

    final socket = ref.read(rideSocketProvider);
    if (!socket.isConnected && !api.isMockMode) {
      await _connectTrackingSocket();
    }
    socket.emitCourierLocation(
      userId: _userId ?? '',
      lat: pos.latitude,
      lng: pos.longitude,
      deliveryId: _deliveryId,
      referenceType: _isErrand ? 'ERRAND' : 'DELIVERY',
    );
    if (!api.isMockMode) {
      await api.recordTrackingPoint(
        _isErrand ? 'errand' : 'delivery',
        _deliveryId,
        pos.latitude,
        pos.longitude,
      );
    }
  }

  Future<void> _refresh() async {
    final api = ref.read(apiClientProvider);
    final path = _isErrand ? '/errands/$_deliveryId' : '/deliveries/$_deliveryId';
    final result = await api.get(path);
    if (!mounted) return;
    if (result case Success(:final data)) {
      final merged = mergeDeliveryApiPayload(Map<String, dynamic>.from(data));
      setState(() => _delivery = merged);
      _syncPaymentPolling();
      if (_cashPending && !_skipNextCashAutoOpen) _autoOpenCashConfirm();
    }
  }

  Future<void> _advanceStatus(String nextStatus, String successMessage, {int? purchaseTotalCdf, String? deliveryPin}) async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final api = ref.read(apiClientProvider);
    final Result<Map<String, dynamic>> result;
    if (_isErrand) {
      result = await api.patch('/errands/$_deliveryId/driver-status', {
        'status': nextStatus,
        if (purchaseTotalCdf != null) 'purchaseTotalCdf': purchaseTotalCdf,
      });
    } else {
      result = await api.updateDeliveryStatus(_deliveryId, nextStatus, deliveryPin: deliveryPin);
    }
    if (!mounted) return;
    setState(() => _loading = false);
    switch (result) {
      case Success(:final data):
        setState(() {
          _delivery = mergeDeliveryApiPayload(Map<String, dynamic>.from(data));
        });
        _syncPaymentPolling();
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(successMessage)));
        if (_cashPending) _autoOpenCashConfirm();
      case Failure(:final error):
        setState(() => _error = error.message);
    }
  }

  Future<void> _completeErrandWithPurchase() async {
    if (_delivery['proofPhotoUrl'] == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Ajoutez d\'abord une photo preuve d\'achat.')),
      );
      return;
    }
    FocusManager.instance.primaryFocus?.unfocus();
    final purchase = await showDialog<int>(
      context: context,
      builder: (ctx) => const _ErrandPurchaseTotalDialog(),
    );
    if (purchase == null || !mounted) return;
    await _advanceStatus('COMPLETED', 'Courses terminées', purchaseTotalCdf: purchase);
  }

  Future<void> _uploadProofPhoto() async {
    final picker = ImagePicker();
    final picked = await picker.pickImage(source: ImageSource.camera, imageQuality: 75);
    if (picked == null || !mounted) return;
    setState(() => _uploadingProof = true);
    final api = ref.read(apiClientProvider);
    final upload = await api.uploadParcelPhoto(File(picked.path));
    if (!mounted) return;
    switch (upload) {
      case Success(:final data):
        final photoUrl = data;
        final patch = await api.uploadErrandProofPhoto(_deliveryId, photoUrl);
        if (!mounted) return;
        setState(() => _uploadingProof = false);
        switch (patch) {
          case Success(:final data):
            setState(() {
              _delivery = data['errand'] as Map<String, dynamic>? ?? data;
            });
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Photo preuve enregistrée')),
            );
          case Failure(:final error):
            setState(() => _error = error.message);
        }
      case Failure(:final error):
        setState(() {
          _uploadingProof = false;
          _error = error.message;
        });
    }
  }

  Future<void> _handleNextAction() async {
    if (_isErrand && _nextAction == 'COMPLETED') {
      await _completeErrandWithPurchase();
      return;
    }
    if (_nextAction == 'DELIVERED') {
      final api = ref.read(apiClientProvider);
      final pin = await DriverCashPinDialog.show(
        context,
        title: 'Confirmer la livraison',
        label: 'Code PIN du destinataire',
        validate: (enteredPin) async {
          final result = await api.updateDeliveryStatus(
            _deliveryId,
            'DELIVERED',
            deliveryPin: enteredPin,
          );
          return switch (result) {
            Success() => (ok: true, message: null),
            Failure(:final error) => (ok: false, message: error.message),
          };
        },
      );
      if (pin == null || pin.isEmpty || !mounted) return;
      _skipNextCashAutoOpen = true;
      await _refresh();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Livraison terminée')),
      );
      return;
    }
    if (_nextAction != null) {
      await _advanceStatus(
        _nextAction!,
        'Statut mis à jour',
      );
    }
  }

  Future<void> _confirmCash({bool auto = false}) async {
    if (_cashDialogOpen) return;
    _cashDialogOpen = true;
    final api = ref.read(apiClientProvider);
    final refType = _isErrand ? 'ERRAND' : 'DELIVERY';
    final pin = await DriverCashPinDialog.show(
      context,
      title: 'Confirmer paiement espèces',
      label: 'Code PIN du client',
      validate: (enteredPin) async {
        final result = await api.confirmCashService(refType, _deliveryId, enteredPin);
        return switch (result) {
          Success() => (ok: true, message: null),
          Failure(:final error) => (ok: false, message: error.message),
        };
      },
    );
    _cashDialogOpen = false;
    if (pin == null || pin.isEmpty || !mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Paiement espèces confirmé')),
    );
    await _refresh();
    if (!auto && mounted) Navigator.pop(context, true);
  }

  bool get _awaitingCashConfirm {
    if (_isErrand) return _status == 'COMPLETED' && !_isPaid;
    return _status == 'DELIVERED' && !_isPaid;
  }

  Future<void> _openChat({required String peerLabel}) {
    return Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => _isErrand
            ? ErrandChatScreen(
                errandId: _deliveryId,
                myRole: 'driver',
                peerLabel: peerLabel,
              )
            : DeliveryChatScreen(
                deliveryId: _deliveryId,
                myRole: 'driver',
                peerLabel: peerLabel,
              ),
      ),
    );
  }

  bool get _navigateToPickup {
    if (_isErrand) return _status == 'ASSIGNED';
    return _status == 'READY_FOR_PICKUP' || _status == 'PENDING';
  }

  String get _navigationLabel {
    if (!_navigateToPickup) return 'Navigation — client';
    if (_isFood) return 'Navigation — restaurant';
    return 'Navigation — prendre colis';
  }

  Future<void> _openMaps() async {
    final toPickup = _navigateToPickup;
    final lat = (toPickup
            ? _delivery['pickupLat']
            : (_delivery['dropoffLat'] ?? _delivery['deliveryLat']))
        as num?;
    final lng = (toPickup
            ? _delivery['pickupLng']
            : (_delivery['dropoffLng'] ?? _delivery['deliveryLng']))
        as num?;
    if (lat == null || lng == null) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Coordonnées GPS indisponibles pour la navigation')),
        );
      }
      return;
    }
    final opened = await MapsLauncher.openDirections(
      destinationLat: lat.toDouble(),
      destinationLng: lng.toDouble(),
    );
    if (!opened && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Impossible d\'ouvrir Google Maps')),
      );
    }
  }

  String? get _nextAction {
    if (_isErrand) {
      return switch (_status) {
        'ASSIGNED' => 'IN_PROGRESS',
        'IN_PROGRESS' => 'COMPLETED',
        _ => null,
      };
    }
    return switch (_status) {
      'PICKED_UP' => 'IN_TRANSIT',
      'IN_TRANSIT' => 'DELIVERED',
      _ => null,
    };
  }

  String get _actionLabel {
    if (_isErrand) {
      return switch (_status) {
        'ASSIGNED' => 'Démarrer les courses',
        'IN_PROGRESS' => 'Marquer comme terminé',
        _ => 'Actualiser',
      };
    }
    return switch (_status) {
      'PICKED_UP' => 'En route vers le client',
      'IN_TRANSIT' => 'Marquer comme livré (PIN destinataire)',
      _ => 'Actualiser',
    };
  }

  @override
  Widget build(BuildContext context) {
    return MovaScreen(
      title: 'Livraison active',
      scrollable: false,
      actions: [
        IconButton(
          icon: const Icon(Icons.chat_bubble_outline),
          tooltip: 'Chat client',
          onPressed: _deliveryId.isEmpty ? null : () => _openChat(peerLabel: 'Client'),
        ),
        IconButton(
          icon: const Icon(Icons.refresh),
          onPressed: _loading ? null : _refresh,
        ),
      ],
      child: MovaFlexScroll(
        child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          MovaCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _typeLabel,
                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 8),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(Icons.trip_origin, color: MovaColors.green, size: 18),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        _delivery['pickupAddress']?.toString() ?? '—',
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(Icons.location_on, color: MovaColors.violet, size: 18),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        _delivery['dropoffAddress']?.toString() ??
                            _delivery['deliveryAddress']?.toString() ??
                            '—',
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text('Statut : $_status', style: const TextStyle(color: MovaColors.textSecondary, fontSize: 13)),
                if (_status == 'DELIVERED' || (_isErrand && _status == 'COMPLETED')) ...[
                  const SizedBox(height: 8),
                  _DeliveryPaymentStatusChip(isPaid: _isPaid),
                ],
              ],
            ),
          ),
          const SizedBox(height: 12),
          ServicePriceDisplay.driverMissionCard(_delivery),
          if (_error != null) ...[
            const SizedBox(height: 12),
            MovaErrorBanner(message: _error!),
          ],
          const SizedBox(height: 16),
          if (_isErrand && _status == 'IN_PROGRESS') ...[
            MovaButton(
              label: _delivery['proofPhotoUrl'] != null ? 'Photo preuve ajoutée' : 'Photo preuve d\'achat',
              icon: Icons.camera_alt_outlined,
              isSecondary: _delivery['proofPhotoUrl'] != null,
              onPressed: _uploadingProof || _loading ? null : _uploadProofPhoto,
            ),
            const SizedBox(height: 8),
          ],
          if (_nextAction != null && !_awaitingCashConfirm)
            MovaButton(
              label: _actionLabel,
              icon: Icons.delivery_dining,
              onPressed: _loading ? null : _handleNextAction,
            ),
          if (_awaitingCashConfirm) ...[
            const SizedBox(height: 8),
            MovaButton(
              label: 'Confirmer paiement espèces',
              isSecondary: true,
              icon: Icons.payments_outlined,
              onPressed: _loading ? null : () => _confirmCash(),
            ),
          ],
          const SizedBox(height: 8),
          MovaButton(
            label: 'Chat avec le client',
            isSecondary: true,
            icon: Icons.chat_bubble_outline,
            onPressed: _deliveryId.isEmpty ? null : () => _openChat(peerLabel: 'Client'),
          ),
          if (_isFood) ...[
            const SizedBox(height: 8),
            MovaButton(
              label: 'Chat restaurant',
              isSecondary: true,
              icon: Icons.storefront_outlined,
              onPressed: _deliveryId.isEmpty ? null : () => _openChat(peerLabel: _restaurantName),
            ),
          ],
          const SizedBox(height: 8),
          MovaButton(
            label: _navigationLabel,
            isSecondary: true,
            icon: Icons.map_outlined,
            onPressed: _loading ? null : _openMaps,
          ),
          const SizedBox(height: 8),
          MovaButton(
            label: 'Actualiser',
            isSecondary: true,
            icon: Icons.refresh,
            onPressed: _loading ? null : _refresh,
          ),
        ],
        ),
      ),
    );
  }
}

/// Dialogue montant achats — StatefulWidget pour gérer le cycle de vie du [TextEditingController].
class _ErrandPurchaseTotalDialog extends StatefulWidget {
  const _ErrandPurchaseTotalDialog();

  @override
  State<_ErrandPurchaseTotalDialog> createState() => _ErrandPurchaseTotalDialogState();
}

class _ErrandPurchaseTotalDialogState extends State<_ErrandPurchaseTotalDialog> {
  final _controller = TextEditingController(text: '0');
  String? _error;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _submit() {
    final parsed = int.tryParse(_controller.text.trim());
    if (parsed == null || parsed < 0) {
      setState(() => _error = 'Saisissez un montant valide (0 ou plus).');
      return;
    }
    FocusScope.of(context).unfocus();
    Navigator.pop(context, parsed);
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Montant des achats'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
            controller: _controller,
            keyboardType: TextInputType.number,
            autofocus: true,
            decoration: InputDecoration(
              labelText: 'Total achats (CDF)',
              hintText: '0 si aucun achat',
              errorText: _error,
            ),
            onSubmitted: (_) => _submit(),
            onChanged: (_) {
              if (_error != null) setState(() => _error = null);
            },
          ),
        ],
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Annuler')),
        TextButton(onPressed: _submit, child: const Text('Valider')),
      ],
    );
  }
}

class _DeliveryPaymentStatusChip extends StatelessWidget {
  const _DeliveryPaymentStatusChip({required this.isPaid});

  final bool isPaid;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: (isPaid ? MovaColors.green : MovaColors.orange).withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: (isPaid ? MovaColors.green : MovaColors.orange).withValues(alpha: 0.35)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            isPaid ? Icons.check_circle_outline : Icons.schedule,
            size: 16,
            color: isPaid ? MovaColors.green : MovaColors.orange,
          ),
          const SizedBox(width: 6),
          Text(
            isPaid ? 'Payée' : 'En attente de paiement',
            style: TextStyle(
              color: isPaid ? MovaColors.green : MovaColors.orange,
              fontWeight: FontWeight.w600,
              fontSize: 12,
            ),
          ),
        ],
      ),
    );
  }
}

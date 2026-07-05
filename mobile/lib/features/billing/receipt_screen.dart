import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:printing/printing.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/api/api_client.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import '../../core/billing/bluetooth_print_service.dart';
import '../rating/rating_screen.dart';
import 'billing_util.dart';

class ReceiptScreen extends ConsumerStatefulWidget {
  const ReceiptScreen({
    super.key,
    this.rideId,
    this.serviceType,
    this.serviceId,
    this.showRatingAfter = false,
    this.pendingCash = false,
    this.completionPin,
    this.amountCdf,
  }) : assert(rideId != null || (serviceType != null && serviceId != null));

  final String? rideId;
  final String? serviceType;
  final String? serviceId;
  final bool showRatingAfter;
  final bool pendingCash;
  final String? completionPin;
  final int? amountCdf;

  String get referenceType => rideId != null ? 'RIDE' : serviceType!.toUpperCase();
  String get referenceId => rideId ?? serviceId!;

  @override
  ConsumerState<ReceiptScreen> createState() => _ReceiptScreenState();
}

class _ReceiptScreenState extends ConsumerState<ReceiptScreen> {
  Map<String, dynamic>? _receipt;
  bool _loading = true;
  bool _actionLoading = false;
  String? _error;
  final _emailController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _emailController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    if (widget.pendingCash) {
      setState(() {
        _loading = false;
        _error = null;
      });
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    final api = ref.read(apiClientProvider);
    final result = await api.getReceipt(widget.referenceType, widget.referenceId);
    if (!mounted) return;
    switch (result) {
      case Success(:final data):
        setState(() {
          _receipt = data;
          _loading = false;
          final email = data['customer'] is Map ? (data['customer'] as Map)['email']?.toString() : null;
          if (email != null && email.isNotEmpty) _emailController.text = email;
        });
      case Failure(:final error):
        setState(() {
          _loading = false;
          _error = error.message;
        });
    }
  }

  Future<Uint8List?> _fetchPdf({bool thermal = false}) async {
    final api = ref.read(apiClientProvider);
    final result = thermal
        ? await api.getReceiptThermalPdf(widget.referenceType, widget.referenceId)
        : await api.getReceiptPdf(widget.referenceType, widget.referenceId);
    return switch (result) {
      Success(:final data) => data,
      Failure() => null,
    };
  }

  Future<void> _printPdf({bool thermal = false}) async {
    setState(() => _actionLoading = true);
    final bytes = await _fetchPdf(thermal: thermal);
    if (!mounted) return;
    setState(() => _actionLoading = false);
    if (bytes == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Impossible de charger le document.')),
      );
      return;
    }
    await Printing.layoutPdf(
      onLayout: (_) async => bytes,
      name: _receipt?['receiptNumber']?.toString() ?? 'mova-receipt',
    );
  }

  Future<void> _sharePdf() async {
    setState(() => _actionLoading = true);
    final bytes = await _fetchPdf();
    if (!mounted) return;
    setState(() => _actionLoading = false);
    if (bytes == null) return;
    final name = '${_receipt?['receiptNumber'] ?? 'mova-receipt'}.pdf';
    await Share.shareXFiles([XFile.fromData(bytes, name: name, mimeType: 'application/pdf')], text: 'Reçu MOVA');
  }

  Future<void> _sendEmail() async {
    setState(() => _actionLoading = true);
    final api = ref.read(apiClientProvider);
    final email = _emailController.text.trim();
    final result = await api.sendReceiptEmail(
      widget.referenceType,
      widget.referenceId,
      email: email.isNotEmpty ? email : null,
    );
    if (!mounted) return;
    setState(() => _actionLoading = false);
    switch (result) {
      case Success(:final data):
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Envoyé à ${data['sentTo'] ?? email}')),
        );
      case Failure(:final error):
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.message)));
    }
  }

  Future<void> _printBluetooth() async {
    setState(() => _actionLoading = true);
    final api = ref.read(apiClientProvider);
    final result = await api.getReceiptThermal(widget.referenceType, widget.referenceId);
    if (!mounted) return;
    setState(() => _actionLoading = false);
    switch (result) {
      case Success(:final data):
        final escPos = data['escPosBase64']?.toString();
        if (escPos == null || escPos.isEmpty) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Données ESC/POS indisponibles.')),
          );
          return;
        }
        try {
          await BluetoothPrintService.instance.printEscPosBase64(escPos, context);
          if (!mounted) return;
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Ticket envoyé à l\'imprimante Bluetooth')),
          );
        } catch (e) {
          if (!mounted) return;
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
        }
      case Failure(:final error):
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.message)));
    }
  }

  Future<void> _shareChat() async {
    setState(() => _actionLoading = true);
    final api = ref.read(apiClientProvider);
    final result = await api.shareReceiptInChat(widget.referenceType, widget.referenceId);
    if (!mounted) return;
    setState(() => _actionLoading = false);
    switch (result) {
      case Success(:final data):
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Reçu partagé dans le chat')),
        );
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (!context.mounted) return;
          openBillingChat(
            context,
            widget.referenceType,
            data,
            fallbackRideId: widget.rideId,
          );
        });
      case Failure(:final error):
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.message)));
    }
  }

  void _continue() {
    if (widget.showRatingAfter && widget.rideId != null) {
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (_) => RatingScreen(rideId: widget.rideId!)),
      );
      return;
    }
    Navigator.of(context).popUntil((r) => r.isFirst);
  }

  @override
  Widget build(BuildContext context) {
    final receipt = _receipt;
    final lines = receipt?['lines'] is List ? receipt!['lines'] as List : const [];
    final payment = receipt?['payment'] is Map ? receipt!['payment'] as Map : null;
    final docLabel = receipt?['documentType'] == 'INVOICE' ? 'Facture' : 'Reçu de paiement';

    return MovaScreen(
      title: widget.pendingCash ? 'Paiement espèces' : docLabel,
      child: _loading
          ? const Center(child: CircularProgressIndicator())
          : widget.pendingCash
              ? Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    MovaCard(
                      child: Column(
                        children: [
                          const Icon(Icons.payments_outlined, size: 48, color: MovaColors.green),
                          const SizedBox(height: 12),
                          Text(
                            MarketConfig.formatCdf(widget.amountCdf ?? 0),
                            style: const TextStyle(fontSize: 28, fontWeight: FontWeight.bold, color: MovaColors.green),
                          ),
                          const SizedBox(height: 12),
                          const Text(
                            'Paiement espèces en attente',
                            style: TextStyle(fontWeight: FontWeight.w600),
                          ),
                          const SizedBox(height: 8),
                          const Text(
                            'Remettez l\'argent au chauffeur, puis communiquez-lui le code ci-dessous. '
                            'Le reçu sera disponible après confirmation.',
                            textAlign: TextAlign.center,
                            style: TextStyle(color: MovaColors.textSecondary, fontSize: 13),
                          ),
                          if (widget.completionPin != null && widget.completionPin!.isNotEmpty) ...[
                            const SizedBox(height: 16),
                            Text(
                              widget.completionPin!,
                              style: const TextStyle(fontSize: 32, fontWeight: FontWeight.bold, letterSpacing: 8),
                            ),
                          ],
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),
                    MovaButton(label: 'Retour à l\'accueil', onPressed: _continue),
                    if (widget.showRatingAfter && widget.rideId != null) ...[
                      const SizedBox(height: 8),
                      MovaButton(
                        label: 'Noter le chauffeur',
                        isSecondary: true,
                        onPressed: () {
                          Navigator.pushReplacement(
                            context,
                            MaterialPageRoute(builder: (_) => RatingScreen(rideId: widget.rideId!)),
                          );
                        },
                      ),
                    ],
                  ],
                )
          : _error != null
              ? MovaErrorBanner(message: _error!, onRetry: _load)
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    MovaCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('MOVA RDC', style: Theme.of(context).textTheme.titleMedium?.copyWith(color: MovaColors.violet)),
                          const SizedBox(height: 4),
                          Text(docLabel, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
                          const SizedBox(height: 8),
                          Text('N° ${receipt?['receiptNumber'] ?? '—'}', style: const TextStyle(fontFamily: 'monospace')),
                          Text(receipt?['serviceTypeLabel']?.toString() ?? ''),
                          Text(receipt?['serviceLabel']?.toString() ?? '', style: const TextStyle(color: MovaColors.textSecondary)),
                          const Divider(height: 24),
                          ...lines.where((line) {
                            final row = line is Map ? line : {};
                            final amount = row['amountCdf'] as int? ?? 0;
                            final kind = row['kind']?.toString();
                            if (kind == 'item' && amount == 0) return false;
                            return true;
                          }).map((line) {
                            final row = line is Map ? Map<String, dynamic>.from(line as Map) : <String, dynamic>{};
                            final label = row['label']?.toString() ?? '';
                            final amount = row['amountCdf'] as int? ?? 0;
                            final isDiscount = row['kind'] == 'discount';
                            final isTotal = row['kind'] == 'total';
                            return Padding(
                              padding: const EdgeInsets.symmetric(vertical: 4),
                              child: Row(
                                children: [
                                  Expanded(child: Text(label)),
                                  Text(
                                    '${isDiscount ? '−' : ''}${MarketConfig.formatCdf(amount.abs())}',
                                    style: TextStyle(
                                      fontWeight: isTotal ? FontWeight.bold : FontWeight.normal,
                                      color: isTotal ? MovaColors.green : null,
                                    ),
                                  ),
                                ],
                              ),
                            );
                          }),
                          if (payment != null) ...[
                            const Divider(height: 24),
                            Text('Paiement : ${payment['methodLabel'] ?? payment['method']}'),
                            Text('Statut : ${payment['status']}'),
                          ],
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),
                    if (_actionLoading) const LinearProgressIndicator(),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        OutlinedButton.icon(
                          onPressed: _actionLoading ? null : () => _printPdf(),
                          icon: const Icon(Icons.picture_as_pdf_outlined),
                          label: const Text('PDF / Imprimer'),
                        ),
                        OutlinedButton.icon(
                          onPressed: _actionLoading ? null : () => _printPdf(thermal: true),
                          icon: const Icon(Icons.receipt_long),
                          label: const Text('Thermique 80 mm'),
                        ),
                        OutlinedButton.icon(
                          onPressed: _actionLoading ? null : _printBluetooth,
                          icon: const Icon(Icons.bluetooth),
                          label: const Text('Bluetooth ESC/POS'),
                        ),
                        OutlinedButton.icon(
                          onPressed: _actionLoading ? null : _sharePdf,
                          icon: const Icon(Icons.share_outlined),
                          label: const Text('Partager'),
                        ),
                        if (receiptSupportsChat(widget.referenceType))
                          OutlinedButton.icon(
                            onPressed: _actionLoading ? null : _shareChat,
                            icon: const Icon(Icons.chat_outlined),
                            label: const Text('Chat'),
                          ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _emailController,
                      keyboardType: TextInputType.emailAddress,
                      decoration: const InputDecoration(
                        labelText: 'E-mail',
                        hintText: 'receipt@example.com',
                        prefixIcon: Icon(Icons.email_outlined),
                      ),
                    ),
                    const SizedBox(height: 8),
                    MovaButton(
                      label: 'Envoyer par e-mail',
                      icon: Icons.send_outlined,
                      isLoading: _actionLoading,
                      onPressed: _actionLoading ? null : _sendEmail,
                    ),
                    const SizedBox(height: 16),
                    MovaButton(
                      label: widget.showRatingAfter ? 'Continuer' : 'Terminer',
                      onPressed: _continue,
                    ),
                  ],
                ),
    );
  }
}

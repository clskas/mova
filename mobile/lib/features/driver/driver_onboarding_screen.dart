import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import '../../core/api/api_client.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import 'driver_home_screen.dart';

/// Parcours d'enregistrement chauffeur — 6 étapes inspirées du processus MOVA / Uber.
class DriverOnboardingScreen extends ConsumerStatefulWidget {
  const DriverOnboardingScreen({super.key, this.canSkipToHome = false});

  final bool canSkipToHome;

  @override
  ConsumerState<DriverOnboardingScreen> createState() => _DriverOnboardingScreenState();
}

class _DriverOnboardingScreenState extends ConsumerState<DriverOnboardingScreen> {
  final _pageController = PageController();
  final _picker = ImagePicker();
  int _step = 0;
  bool _loading = false;
  String? _error;
  Map<String, dynamic>? _state;
  String? _uploadingDoc;

  final _firstName = TextEditingController();
  final _lastName = TextEditingController();
  final _email = TextEditingController();
  final _idNumber = TextEditingController();
  final _licenseNumber = TextEditingController();
  final _licenseExpiry = TextEditingController();
  final _plate = TextEditingController();
  final _make = TextEditingController();
  final _model = TextEditingController();
  final _insuranceExpiry = TextEditingController();
  final _inspectionExpiry = TextEditingController();
  final _payoutPhone = TextEditingController();
  String _vehicleType = 'STANDARD';
  String _payoutProvider = 'ORANGE_MONEY';
  bool _charterAccepted = false;
  bool _trainingCompleted = false;

  static const _steps = [
    'Identité',
    'Permis',
    'Véhicule',
    'Conformité',
    'Paiement',
    'Activation',
  ];

  static const _docTypes = [
    ('ID_PHOTO', 'Carte d\'identité / passeport'),
    ('SELFIE', 'Photo récente (profil)'),
    ('DRIVERS_LICENSE', 'Permis de conduire'),
    ('VEHICLE_REGISTRATION', 'Carte grise'),
    ('VEHICLE_INSURANCE', 'Assurance véhicule'),
    ('TECHNICAL_INSPECTION', 'Visite technique'),
    ('CRIMINAL_RECORD', 'Casier judiciaire (optionnel)'),
  ];

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _pageController.dispose();
    _firstName.dispose();
    _lastName.dispose();
    _email.dispose();
    _idNumber.dispose();
    _licenseNumber.dispose();
    _licenseExpiry.dispose();
    _plate.dispose();
    _make.dispose();
    _model.dispose();
    _insuranceExpiry.dispose();
    _inspectionExpiry.dispose();
    _payoutPhone.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final api = ref.read(apiClientProvider);
    final result = await api.get('/drivers/onboarding');
    if (!mounted) return;
    switch (result) {
      case Success(:final data):
        _applyState(data);
        setState(() {
          _state = data;
          _loading = false;
        });
      case Failure(:final error):
        setState(() {
          _loading = false;
          _error = error.message;
        });
    }
  }

  void _applyState(Map<String, dynamic> data) {
    final user = data['user'] as Map<String, dynamic>?;
    final profile = data['profile'] as Map<String, dynamic>?;
    final vehicle = data['vehicle'] as Map<String, dynamic>?;
    _firstName.text = user?['firstName']?.toString() ?? '';
    _lastName.text = user?['lastName']?.toString() ?? '';
    _email.text = user?['email']?.toString() ?? '';
    _idNumber.text = profile?['idDocumentNumber']?.toString() ?? '';
    _licenseNumber.text = profile?['licenseNumber']?.toString() ?? '';
    _licenseExpiry.text = _dateOnly(profile?['licenseExpiry']);
    _insuranceExpiry.text = _dateOnly(profile?['insuranceExpiry']);
    _inspectionExpiry.text = _dateOnly(profile?['technicalInspectionExpiry']);
    _payoutProvider = profile?['payoutProvider']?.toString() ?? 'ORANGE_MONEY';
    _payoutPhone.text = profile?['payoutPhone']?.toString() ?? user?['phone']?.toString() ?? '';
    _plate.text = vehicle?['plateNumber']?.toString() ?? '';
    _make.text = vehicle?['make']?.toString() ?? '';
    _model.text = vehicle?['model']?.toString() ?? '';
    _vehicleType = vehicle?['type']?.toString() ?? 'STANDARD';
    _charterAccepted = profile?['charterAcceptedAt'] != null;
    _trainingCompleted = profile?['trainingCompletedAt'] != null;
  }

  String _dateOnly(dynamic raw) {
    final s = raw?.toString() ?? '';
    return s.length >= 10 ? s.substring(0, 10) : s;
  }

  Future<void> _savePersonal() async {
    final api = ref.read(apiClientProvider);
    await api.patch('/users/me', {
      'firstName': _firstName.text.trim(),
      'lastName': _lastName.text.trim(),
      'email': _email.text.trim().isEmpty ? null : _email.text.trim(),
    });
    await api.patch('/drivers/onboarding', {
      'idDocumentNumber': _idNumber.text.trim(),
    });
  }

  Future<void> _saveLicense() async {
    await ref.read(apiClientProvider).patch('/drivers/onboarding', {
      'licenseNumber': _licenseNumber.text.trim(),
      if (_licenseExpiry.text.trim().isNotEmpty) 'licenseExpiry': _licenseExpiry.text.trim(),
    });
  }

  Future<void> _saveVehicle() async {
    await ref.read(apiClientProvider).patch('/drivers/onboarding', {
      'plateNumber': _plate.text.trim(),
      'vehicleMake': _make.text.trim(),
      'vehicleModel': _model.text.trim(),
      'vehicleType': _vehicleType,
      if (_insuranceExpiry.text.trim().isNotEmpty) 'insuranceExpiry': _insuranceExpiry.text.trim(),
      if (_inspectionExpiry.text.trim().isNotEmpty) 'technicalInspectionExpiry': _inspectionExpiry.text.trim(),
    });
  }

  Future<void> _savePayout() async {
    await ref.read(apiClientProvider).patch('/drivers/onboarding', {
      'payoutProvider': _payoutProvider,
      'payoutPhone': MarketConfig.normalizePhone(_payoutPhone.text.trim()),
    });
  }

  Future<void> _finishOnboarding() async {
    if (!_charterAccepted || !_trainingCompleted) {
      setState(() => _error = 'Acceptez la charte et confirmez la formation.');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    final api = ref.read(apiClientProvider);
    final result = await api.patch('/drivers/onboarding', {
      'charterAccepted': true,
      'trainingCompleted': true,
      'onboardingCompleted': true,
    });
    if (!mounted) return;
    setState(() => _loading = false);
    switch (result) {
      case Success():
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Dossier envoyé — validation MOVA sous 24-48 h.'),
            backgroundColor: MovaColors.green,
          ),
        );
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(builder: (_) => const DriverHomeScreen()),
        );
      case Failure(:final error):
        setState(() => _error = error.message);
    }
  }

  Future<void> _uploadDoc(String type, String label) async {
    final file = await _picker.pickImage(source: ImageSource.camera, imageQuality: 80);
    if (file == null) return;
    setState(() {
      _uploadingDoc = type;
      _error = null;
    });
    final api = ref.read(apiClientProvider);
    final upload = await api.uploadParcelPhoto(File(file.path));
    if (!mounted) return;
    switch (upload) {
      case Success(:final data):
        final url = data;
        final result = await api.post('/drivers/kyc', {'type': type, 'url': url});
        setState(() => _uploadingDoc = null);
        if (result case Success()) {
          await _load();
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$label enregistré')));
          }
        }
      case Failure(:final error):
        setState(() {
          _uploadingDoc = null;
          _error = error.message;
        });
    }
  }

  bool _docUploaded(String type) {
    final checklist = _state?['kyc']?['checklist'] as List? ?? [];
    for (final item in checklist) {
      if (item is Map && item['type'] == type) return item['uploaded'] == true;
    }
    return false;
  }

  Future<void> _next() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      switch (_step) {
        case 0:
          await _savePersonal();
        case 1:
          await _saveLicense();
        case 2:
          await _saveVehicle();
        case 4:
          await _savePayout();
        default:
          break;
      }
      if (_step < _steps.length - 1) {
        setState(() {
          _step += 1;
          _loading = false;
        });
        _pageController.nextPage(duration: const Duration(milliseconds: 300), curve: Curves.easeOut);
      } else {
        await _finishOnboarding();
      }
    } catch (e) {
      setState(() {
        _loading = false;
        _error = e.toString();
      });
    }
  }

  void _back() {
    if (_step == 0) return;
    setState(() => _step -= 1);
    _pageController.previousPage(duration: const Duration(milliseconds: 300), curve: Curves.easeOut);
  }

  @override
  Widget build(BuildContext context) {
    final publicId = _state?['publicId']?.toString();
    return MovaScreen(
      title: 'Enregistrement chauffeur',
      actions: [
        if (widget.canSkipToHome)
          TextButton(
            onPressed: () => Navigator.of(context).pushReplacement(
              MaterialPageRoute(builder: (_) => const DriverHomeScreen()),
            ),
            child: const Text('Plus tard'),
          ),
      ],
      child: _loading && _state == null
          ? const Center(child: CircularProgressIndicator())
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (publicId != null)
                  Text(
                    'Identifiant chauffeur : $publicId',
                    style: const TextStyle(fontWeight: FontWeight.bold, color: MovaColors.violet),
                  ),
                const SizedBox(height: 8),
                LinearProgressIndicator(
                  value: (_step + 1) / _steps.length,
                  backgroundColor: MovaColors.cloud,
                  color: MovaColors.violet,
                ),
                const SizedBox(height: 4),
                Text(
                  'Étape ${_step + 1}/${_steps.length} — ${_steps[_step]}',
                  style: const TextStyle(color: MovaColors.textSecondary, fontSize: 13),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 8),
                  MovaErrorBanner(message: _error!),
                ],
                const SizedBox(height: 12),
                Expanded(
                  child: PageView(
                    controller: _pageController,
                    physics: const NeverScrollableScrollPhysics(),
                    children: [
                      _stepPersonal(),
                      _stepLicense(),
                      _stepVehicle(),
                      _stepCompliance(),
                      _stepPayout(),
                      _stepActivation(),
                    ],
                  ),
                ),
                Row(
                  children: [
                    if (_step > 0)
                      Expanded(
                        child: MovaButton(
                          label: 'Retour',
                          isSecondary: true,
                          onPressed: _loading ? null : _back,
                        ),
                      ),
                    if (_step > 0) const SizedBox(width: 8),
                    Expanded(
                      child: MovaButton(
                        label: _step == _steps.length - 1 ? 'Envoyer le dossier' : 'Continuer',
                        isLoading: _loading,
                        onPressed: _loading ? null : _next,
                      ),
                    ),
                  ],
                ),
              ],
            ),
    );
  }

  Widget _stepPersonal() {
    return ListView(
      children: [
        const Text('Informations personnelles', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
        const SizedBox(height: 8),
        const Text(
          'Comme sur Uber : votre identifiant MOVA (DRV-…) sera visible par le support.',
          style: TextStyle(color: MovaColors.textSecondary, fontSize: 13),
        ),
        const SizedBox(height: 12),
        TextField(controller: _firstName, decoration: const InputDecoration(labelText: 'Prénom')),
        const SizedBox(height: 8),
        TextField(controller: _lastName, decoration: const InputDecoration(labelText: 'Nom')),
        const SizedBox(height: 8),
        TextField(controller: _email, decoration: const InputDecoration(labelText: 'Email')),
        const SizedBox(height: 8),
        TextField(controller: _idNumber, decoration: const InputDecoration(labelText: 'N° carte d\'identité / passeport')),
        const SizedBox(height: 16),
        _docButton('ID_PHOTO', 'Carte d\'identité / passeport'),
        _docButton('SELFIE', 'Photo récente (profil)'),
      ],
    );
  }

  Widget _stepLicense() {
    return ListView(
      children: [
        const Text('Permis de conduire', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
        const SizedBox(height: 12),
        TextField(controller: _licenseNumber, decoration: const InputDecoration(labelText: 'N° permis')),
        const SizedBox(height: 8),
        TextField(
          controller: _licenseExpiry,
          decoration: const InputDecoration(labelText: 'Expiration (AAAA-MM-JJ)'),
        ),
        const SizedBox(height: 16),
        _docButton('DRIVERS_LICENSE', 'Photographier le permis'),
      ],
    );
  }

  Widget _stepVehicle() {
    return ListView(
      children: [
        const Text('Véhicule', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
        const SizedBox(height: 12),
        TextField(controller: _plate, decoration: const InputDecoration(labelText: 'Plaque d\'immatriculation')),
        const SizedBox(height: 8),
        TextField(controller: _make, decoration: const InputDecoration(labelText: 'Marque')),
        const SizedBox(height: 8),
        TextField(controller: _model, decoration: const InputDecoration(labelText: 'Modèle')),
        const SizedBox(height: 8),
        DropdownButtonFormField<String>(
          value: _vehicleType,
          decoration: const InputDecoration(labelText: 'Type'),
          items: const [
            DropdownMenuItem(value: 'MOTO_TAXI', child: Text('Moto-taxi')),
            DropdownMenuItem(value: 'STANDARD', child: Text('Standard')),
            DropdownMenuItem(value: 'COMFORT', child: Text('Confort')),
            DropdownMenuItem(value: 'VIP', child: Text('VIP')),
          ],
          onChanged: (v) => setState(() => _vehicleType = v ?? 'STANDARD'),
        ),
        const SizedBox(height: 8),
        TextField(controller: _insuranceExpiry, decoration: const InputDecoration(labelText: 'Assurance expire le')),
        const SizedBox(height: 8),
        TextField(controller: _inspectionExpiry, decoration: const InputDecoration(labelText: 'Visite technique expire le')),
        const SizedBox(height: 16),
        _docButton('VEHICLE_REGISTRATION', 'Carte grise'),
        _docButton('VEHICLE_INSURANCE', 'Assurance'),
        _docButton('TECHNICAL_INSPECTION', 'Visite technique'),
      ],
    );
  }

  Widget _stepCompliance() {
    return ListView(
      children: [
        const Text('Sécurité & conformité', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
        const SizedBox(height: 12),
        _docButton('CRIMINAL_RECORD', 'Casier judiciaire (recommandé)'),
        const SizedBox(height: 16),
        CheckboxListTile(
          value: _trainingCompleted,
          onChanged: (v) => setState(() => _trainingCompleted = v ?? false),
          title: const Text('J\'ai suivi la formation sécurité MOVA (utilisation app, règles route)'),
          controlAffinity: ListTileControlAffinity.leading,
        ),
        CheckboxListTile(
          value: _charterAccepted,
          onChanged: (v) => setState(() => _charterAccepted = v ?? false),
          title: const Text('J\'accepte la charte de bonne conduite MOVA'),
          controlAffinity: ListTileControlAffinity.leading,
        ),
      ],
    );
  }

  Widget _stepPayout() {
    return ListView(
      children: [
        const Text('Informations financières', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
          value: _payoutProvider,
          decoration: const InputDecoration(labelText: 'Mobile Money'),
          items: const [
            DropdownMenuItem(value: 'ORANGE_MONEY', child: Text('Orange Money')),
            DropdownMenuItem(value: 'MPESA', child: Text('M-Pesa')),
            DropdownMenuItem(value: 'AIRTEL_MONEY', child: Text('Airtel Money')),
          ],
          onChanged: (v) => setState(() => _payoutProvider = v ?? 'ORANGE_MONEY'),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _payoutPhone,
          decoration: const InputDecoration(labelText: 'Numéro de retrait (+243…)'),
          keyboardType: TextInputType.phone,
        ),
      ],
    );
  }

  Widget _stepActivation() {
    final kycStatus = _state?['profile']?['kycStatus']?.toString() ?? 'PENDING';
    return ListView(
      children: [
        const Text('Activation', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
        const SizedBox(height: 12),
        MovaCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Récapitulatif', style: TextStyle(fontWeight: FontWeight.w600)),
              const SizedBox(height: 8),
              Text('Identifiant : ${_state?['publicId'] ?? '—'}'),
              Text('Documents requis : ${_state?['kyc']?['requiredComplete'] == true ? 'Complets' : 'Incomplets'}'),
              Text('Statut KYC : $kycStatus'),
            ],
          ),
        ),
        const SizedBox(height: 16),
        const Text(
          'Après validation par l\'équipe MOVA, vous recevrez un code PIN à 6 chiffres pour activer votre compte et accepter des courses.',
          style: TextStyle(color: MovaColors.textSecondary),
        ),
      ],
    );
  }

  Widget _docButton(String type, String label) {
    final done = _docUploaded(type);
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: MovaButton(
        label: done ? '$label ✓' : label,
        isSecondary: true,
        icon: done ? Icons.check_circle_outline : Icons.camera_alt,
        isLoading: _uploadingDoc == type,
        onPressed: _uploadingDoc != null ? null : () => _uploadDoc(type, label),
      ),
    );
  }
}

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../core/api/api_client.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/media/image_pick_util.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import 'driver_home_screen.dart';

/// Parcours d'enregistrement chauffeur — 6 étapes MOVA.
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
  String? _vehicleImageUrl;

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
  bool _isEditingDossier = false;

  static const _stepStorageKey = 'driver_onboarding_step';
  static const double _fieldGap = 12;
  static const double _docGap = 12;

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

  Future<void> _restoreOnboardingStep() async {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getInt(_stepStorageKey);
    if (saved == null || saved < 0 || saved >= _steps.length) return;
    if (!mounted) return;
    setState(() => _step = saved);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_pageController.hasClients) return;
      _pageController.jumpToPage(saved);
    });
  }

  Future<void> _persistOnboardingStep() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt(_stepStorageKey, _step);
  }

  Future<void> _clearOnboardingStep() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_stepStorageKey);
  }

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
        await _restoreOnboardingStep();
        final done = data['profile']?['onboardingCompleted'] == true;
        if (done && !widget.canSkipToHome && mounted) {
          Navigator.of(context).pushReplacement(
            MaterialPageRoute(builder: (_) => const DriverHomeScreen()),
          );
        }
      case Failure(:final error):
        setState(() {
          _loading = false;
          _error = error.message;
        });
    }
  }

  Future<void> _requirePatch(Future<Result<Map<String, dynamic>>> call) async {
    final result = await call;
    switch (result) {
      case Success():
        return;
      case Failure(:final error):
        throw Exception(error.message);
    }
  }

  String? _validateStep() {
    switch (_step) {
      case 0:
        if (_firstName.text.trim().isEmpty || _lastName.text.trim().isEmpty) {
          return 'Renseignez prénom et nom.';
        }
        if (_idNumber.text.trim().isEmpty) return 'Renseignez le numéro de pièce d\'identité.';
        return null;
      case 1:
        if (_licenseNumber.text.trim().isEmpty) return 'Renseignez le numéro de permis.';
        return null;
      case 2:
        if (_plate.text.trim().isEmpty || _make.text.trim().isEmpty || _model.text.trim().isEmpty) {
          return 'Renseignez plaque, marque et modèle du véhicule.';
        }
        if (!_isEditingDossier && (_vehicleImageUrl == null || _vehicleImageUrl!.isEmpty)) {
          return 'Ajoutez une photo de votre véhicule.';
        }
        return null;
      case 4:
        if (_payoutPhone.text.trim().isEmpty) return 'Renseignez le numéro Mobile Money.';
        return null;
      default:
        return null;
    }
  }

  Future<ImageSource?> _pickDocSource() async {
    return showModalBottomSheet<ImageSource>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.camera_alt),
              title: const Text('Prendre une photo'),
              onTap: () => Navigator.pop(ctx, ImageSource.camera),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library),
              title: const Text('Choisir depuis la galerie'),
              onTap: () => Navigator.pop(ctx, ImageSource.gallery),
            ),
          ],
        ),
      ),
    );
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
    _vehicleImageUrl = vehicle?['imageUrl']?.toString();
    _charterAccepted = profile?['charterAcceptedAt'] != null;
    _trainingCompleted = profile?['trainingCompletedAt'] != null;
    _isEditingDossier = profile?['onboardingCompleted'] == true;
  }

  String _dateOnly(dynamic raw) {
    final s = raw?.toString() ?? '';
    return s.length >= 10 ? s.substring(0, 10) : s;
  }

  String _formatPickerDate(DateTime date) {
    final y = date.year.toString().padLeft(4, '0');
    final m = date.month.toString().padLeft(2, '0');
    final d = date.day.toString().padLeft(2, '0');
    return '$y-$m-$d';
  }

  Future<void> _pickDate(TextEditingController controller) async {
    final initial = DateTime.tryParse(controller.text.trim()) ?? DateTime.now().add(const Duration(days: 365));
    final picked = await showDatePicker(
      context: context,
      initialDate: initial.isBefore(DateTime.now()) ? DateTime.now().add(const Duration(days: 30)) : initial,
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 365 * 15)),
      helpText: 'Choisir une date',
      cancelText: 'Annuler',
      confirmText: 'OK',
    );
    if (picked != null && mounted) {
      setState(() => controller.text = _formatPickerDate(picked));
    }
  }

  Widget _datePickerField({
    required TextEditingController controller,
    required String label,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: _fieldGap),
      child: InkWell(
        onTap: () => _pickDate(controller),
        borderRadius: BorderRadius.circular(8),
        child: InputDecorator(
          decoration: InputDecoration(
            labelText: label,
            suffixIcon: const Icon(Icons.calendar_today, color: MovaColors.violet),
          ),
          child: Text(
            controller.text.isEmpty ? 'Appuyez pour choisir une date' : controller.text,
            style: TextStyle(
              color: controller.text.isEmpty ? MovaColors.textSecondary : null,
            ),
          ),
        ),
      ),
    );
  }

  bool get _renewalPending => _state?['profile']?['documentsRenewalPending'] == true;

  Future<void> _savePersonal() async {
    final api = ref.read(apiClientProvider);
    await _requirePatch(api.patch('/users/me', {
      'firstName': _firstName.text.trim(),
      'lastName': _lastName.text.trim(),
      'email': _email.text.trim().isEmpty ? null : _email.text.trim(),
    }));
    await _requirePatch(api.patch('/drivers/onboarding', {
      'idDocumentNumber': _idNumber.text.trim(),
    }));
  }

  Future<void> _saveLicense() async {
    await _requirePatch(ref.read(apiClientProvider).patch('/drivers/onboarding', {
      'licenseNumber': _licenseNumber.text.trim(),
      if (_licenseExpiry.text.trim().isNotEmpty) 'licenseExpiry': _licenseExpiry.text.trim(),
    }));
  }

  Future<void> _saveVehicle() async {
    await _requirePatch(ref.read(apiClientProvider).patch('/drivers/onboarding', {
      'plateNumber': _plate.text.trim(),
      'vehicleMake': _make.text.trim(),
      'vehicleModel': _model.text.trim(),
      'vehicleType': _vehicleType,
      if (_vehicleImageUrl != null && _vehicleImageUrl!.isNotEmpty) 'vehicleImageUrl': _vehicleImageUrl,
      if (_insuranceExpiry.text.trim().isNotEmpty) 'insuranceExpiry': _insuranceExpiry.text.trim(),
      if (_inspectionExpiry.text.trim().isNotEmpty) 'technicalInspectionExpiry': _inspectionExpiry.text.trim(),
    }));
  }

  Future<void> _uploadVehiclePhoto() async {
    await _persistOnboardingStep();
    final source = await _pickDocSource();
    if (source == null || !mounted) return;
    final file = await pickMovaImage(_picker, source);
    if (file == null) {
      if (mounted) showImagePickError(context);
      return;
    }
    if (!mounted) return;
    setState(() {
      _uploadingDoc = 'VEHICLE_PHOTO';
      _error = null;
    });
    final api = ref.read(apiClientProvider);
    final upload = await api.uploadVehiclePhoto(File(file.path));
    if (!mounted) return;
    switch (upload) {
      case Success(:final data):
        final url = data;
        if (url.isEmpty) {
          setState(() {
            _uploadingDoc = null;
            _error = 'Échec envoi photo — réessayez.';
          });
          return;
        }
        final result = await api.patch('/drivers/onboarding', {'vehicleImageUrl': url});
        if (!mounted) return;
        switch (result) {
          case Success():
            setState(() {
              _uploadingDoc = null;
              _vehicleImageUrl = url;
            });
            if (mounted) {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Photo du véhicule enregistrée')),
              );
            }
          case Failure(:final error):
            setState(() {
              _uploadingDoc = null;
              _error = error.message;
            });
        }
      case Failure(:final error):
        setState(() {
          _uploadingDoc = null;
          _error = error.message;
        });
    }
  }

  Future<void> _savePayout() async {
    await _requirePatch(ref.read(apiClientProvider).patch('/drivers/onboarding', {
      'payoutProvider': _payoutProvider,
      'payoutPhone': MarketConfig.normalizePhone(_payoutPhone.text.trim()),
    }));
  }

  Future<void> _finishOnboarding() async {
    if (!_isEditingDossier && (!_charterAccepted || !_trainingCompleted)) {
      setState(() => _error = 'Acceptez la charte et confirmez la formation.');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    final api = ref.read(apiClientProvider);
    if (_isEditingDossier) {
      final result = await api.patch('/drivers/onboarding', {
        if (_charterAccepted) 'charterAccepted': true,
        if (_trainingCompleted) 'trainingCompleted': true,
      });
      if (!mounted) return;
      setState(() => _loading = false);
      switch (result) {
        case Success():
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Dossier mis à jour.'), backgroundColor: MovaColors.green),
          );
          Navigator.of(context).pop();
        case Failure(:final error):
          setState(() => _error = error.message);
      }
      return;
    }
    final result = await api.patch('/drivers/onboarding', {
      'charterAccepted': true,
      'trainingCompleted': true,
      'onboardingCompleted': true,
    });
    if (!mounted) return;
    setState(() => _loading = false);
    switch (result) {
      case Success():
        await _clearOnboardingStep();
        if (!mounted) return;
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
    await _persistOnboardingStep();
    final source = await _pickDocSource();
    if (source == null || !mounted) return;
    final file = await pickMovaImage(_picker, source);
    if (file == null) {
      if (mounted) showImagePickError(context);
      return;
    }
    if (!mounted) return;
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
        if (url.isEmpty) {
          setState(() {
            _uploadingDoc = null;
            _error = 'Échec envoi photo — réessayez.';
          });
          return;
        }
        final result = await api.post('/drivers/kyc', {'type': type, 'url': url});
        if (!mounted) return;
        switch (result) {
          case Success():
            setState(() {
              _uploadingDoc = null;
              _markDocUploaded(type, url);
            });
            if (mounted) {
              ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$label enregistré')));
            }
          case Failure(:final error):
            setState(() {
              _uploadingDoc = null;
              _error = error.message;
            });
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

  void _markDocUploaded(String type, String url) {
    final kyc = Map<String, dynamic>.from(_state?['kyc'] as Map? ?? {});
    final checklist = <Map<String, dynamic>>[];
    for (final item in (kyc['checklist'] as List?) ?? []) {
      if (item is Map) checklist.add(Map<String, dynamic>.from(item));
    }
    var found = false;
    for (var i = 0; i < checklist.length; i++) {
      if (checklist[i]['type']?.toString() == type) {
        checklist[i] = {...checklist[i], 'type': type, 'uploaded': true, 'url': url};
        found = true;
        break;
      }
    }
    if (!found) {
      checklist.add({'type': type, 'uploaded': true, 'url': url, 'required': true});
    }
    kyc['checklist'] = checklist;
    final required = checklist.where((i) => i['required'] == true);
    kyc['requiredComplete'] = required.isNotEmpty && required.every((i) => i['uploaded'] == true);
    _state = {...?_state, 'kyc': kyc};
  }

  Future<void> _next() async {
    final validationError = _validateStep();
    if (validationError != null) {
      setState(() => _error = validationError);
      return;
    }
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
        await _persistOnboardingStep();
        _pageController.nextPage(duration: const Duration(milliseconds: 300), curve: Curves.easeOut);
      } else {
        await _finishOnboarding();
      }
    } catch (e) {
      setState(() {
        _loading = false;
        _error = e.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  void _back() {
    if (_step == 0) return;
    setState(() => _step -= 1);
    _persistOnboardingStep();
    _pageController.previousPage(duration: const Duration(milliseconds: 300), curve: Curves.easeOut);
  }

  @override
  Widget build(BuildContext context) {
    final publicId = _state?['publicId']?.toString();
    return MovaScreen(
      title: widget.canSkipToHome ? 'Mon dossier chauffeur' : 'Enregistrement chauffeur',
      scrollable: false,
      actions: [
        if (widget.canSkipToHome)
          TextButton(
            onPressed: () {
              if (Navigator.canPop(context)) {
                Navigator.of(context).pop();
              } else {
                Navigator.of(context).pushReplacement(
                  MaterialPageRoute(builder: (_) => const DriverHomeScreen()),
                );
              }
            },
            child: const Text('Fermer'),
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
                if (_state?['kyc'] != null) ...[
                  const SizedBox(height: 8),
                  Text(
                    'Documents : ${_state!['kyc']['checklist'] is List ? (_state!['kyc']['checklist'] as List).where((i) => i is Map && i['required'] == true && i['uploaded'] == true).length : 0}/6 obligatoires',
                    style: const TextStyle(color: MovaColors.textSecondary, fontSize: 13),
                  ),
                ],
                const SizedBox(height: 12),
                LinearProgressIndicator(
                  value: (_step + 1) / _steps.length,
                  backgroundColor: MovaColors.cloud,
                  color: MovaColors.violet,
                ),
                const SizedBox(height: 8),
                Text(
                  'Étape ${_step + 1}/${_steps.length} — ${_steps[_step]}',
                  style: const TextStyle(color: MovaColors.textSecondary, fontSize: 13),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  MovaErrorBanner(message: _error!),
                ],
                const SizedBox(height: 16),
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
                const SizedBox(height: 16),
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
                    if (_step > 0) const SizedBox(width: 12),
                    Expanded(
                      child: MovaButton(
                        label: _step == _steps.length - 1
                            ? (_isEditingDossier ? 'Enregistrer' : 'Envoyer le dossier')
                            : 'Continuer',
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
      padding: const EdgeInsets.only(bottom: 24),
      children: [
        const Text('Informations personnelles', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
        const SizedBox(height: 10),
        const Text(
          'Votre identifiant MOVA (DRV-…) sera visible par le support client.',
          style: TextStyle(color: MovaColors.textSecondary, fontSize: 13),
        ),
        const SizedBox(height: 16),
        TextField(controller: _firstName, decoration: const InputDecoration(labelText: 'Prénom')),
        const SizedBox(height: _fieldGap),
        TextField(controller: _lastName, decoration: const InputDecoration(labelText: 'Nom')),
        const SizedBox(height: _fieldGap),
        TextField(controller: _email, decoration: const InputDecoration(labelText: 'Email')),
        const SizedBox(height: _fieldGap),
        TextField(controller: _idNumber, decoration: const InputDecoration(labelText: 'N° carte d\'identité / passeport')),
        const SizedBox(height: 20),
        _docButton('ID_PHOTO', 'Carte d\'identité / passeport'),
        _docButton('SELFIE', 'Photo récente (profil)'),
      ],
    );
  }

  Widget _stepLicense() {
    return ListView(
      padding: const EdgeInsets.only(bottom: 24),
      children: [
        const Text('Permis de conduire', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
        if (_renewalPending) ...[
          const SizedBox(height: 12),
          const MovaCard(
            child: Text(
              'Renouvellement en attente : après modification des dates, MOVA doit valider vos nouveaux justificatifs avant que vous puissiez repasser en ligne.',
              style: TextStyle(color: MovaColors.orange, fontSize: 13),
            ),
          ),
        ],
        if (_isEditingDossier) ...[
          const SizedBox(height: 12),
          const Text(
            'Si vous changez une date, téléversez à nouveau le permis correspondant. L\'admin comparera le document avec la date saisie.',
            style: TextStyle(color: MovaColors.textSecondary, fontSize: 13),
          ),
        ],
        const SizedBox(height: 16),
        TextField(controller: _licenseNumber, decoration: const InputDecoration(labelText: 'N° permis')),
        const SizedBox(height: _fieldGap),
        _datePickerField(controller: _licenseExpiry, label: 'Date d\'expiration du permis'),
        const SizedBox(height: 12),
        _docButton('DRIVERS_LICENSE', 'Photographier le permis'),
      ],
    );
  }

  Widget _stepVehicle() {
    return ListView(
      padding: const EdgeInsets.only(bottom: 24),
      children: [
        const Text('Véhicule', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
        const SizedBox(height: 16),
        TextField(controller: _plate, decoration: const InputDecoration(labelText: 'Plaque d\'immatriculation')),
        const SizedBox(height: _fieldGap),
        TextField(controller: _make, decoration: const InputDecoration(labelText: 'Marque')),
        const SizedBox(height: _fieldGap),
        TextField(controller: _model, decoration: const InputDecoration(labelText: 'Modèle')),
        const SizedBox(height: _fieldGap),
        DropdownButtonFormField<String>(
          value: _vehicleType,
          decoration: const InputDecoration(labelText: 'Type'),
          items: const [
            DropdownMenuItem(value: 'MOTO_TAXI', child: Text('Moto-taxi')),
            DropdownMenuItem(value: 'STANDARD', child: Text('Standard')),
            DropdownMenuItem(value: 'COMFORT', child: Text('Confort')),
            DropdownMenuItem(value: 'VIP', child: Text('VIP')),
            DropdownMenuItem(value: 'UTILITAIRE', child: Text('Utilitaire')),
            DropdownMenuItem(value: 'CAMION', child: Text('Camion')),
          ],
          onChanged: (v) => setState(() => _vehicleType = v ?? 'STANDARD'),
        ),
        const SizedBox(height: _fieldGap),
        _datePickerField(controller: _insuranceExpiry, label: 'Assurance expire le'),
        _datePickerField(controller: _inspectionExpiry, label: 'Visite technique expire le'),
        if (_isEditingDossier) ...[
          const SizedBox(height: 8),
          const Text(
            'En cas de changement, renvoyez les photos assurance et visite technique.',
            style: TextStyle(color: MovaColors.textSecondary, fontSize: 12),
          ),
        ],
        const SizedBox(height: 12),
        const Text('Photo de l\'engin', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
        const SizedBox(height: 12),
        if (_vehicleImageUrl != null && _vehicleImageUrl!.isNotEmpty)
          ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: Image.network(
              MarketConfig.resolveMediaUrl(_vehicleImageUrl!),
              height: 160,
              width: double.infinity,
              fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => Container(
                height: 120,
                color: MovaColors.violet.withValues(alpha: 0.1),
                child: const Icon(Icons.directions_car, size: 48, color: MovaColors.violet),
              ),
            ),
          )
        else
          Container(
            height: 120,
            width: double.infinity,
            decoration: BoxDecoration(
              color: MovaColors.violet.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: MovaColors.violet.withValues(alpha: 0.2)),
            ),
            child: const Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.camera_alt_outlined, color: MovaColors.violet, size: 32),
                SizedBox(height: 4),
                Text('Photo requise — vue latérale ou 3/4', style: TextStyle(fontSize: 12, color: MovaColors.textSecondary)),
              ],
            ),
          ),
        const SizedBox(height: 12),
        OutlinedButton.icon(
          onPressed: _uploadingDoc == 'VEHICLE_PHOTO' ? null : _uploadVehiclePhoto,
          icon: _uploadingDoc == 'VEHICLE_PHOTO'
              ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
              : const Icon(Icons.photo_camera_outlined),
          label: Text(_vehicleImageUrl != null && _vehicleImageUrl!.isNotEmpty ? 'Changer la photo' : 'Prendre une photo'),
        ),
        const SizedBox(height: 20),
        _docButton('VEHICLE_REGISTRATION', 'Carte grise'),
        _docButton('VEHICLE_INSURANCE', 'Assurance'),
        _docButton('TECHNICAL_INSPECTION', 'Visite technique'),
      ],
    );
  }

  Widget _stepCompliance() {
    return ListView(
      padding: const EdgeInsets.only(bottom: 24),
      children: [
        const Text('Sécurité & conformité', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
        const SizedBox(height: 16),
        _docButton('CRIMINAL_RECORD', 'Casier judiciaire (recommandé)'),
        const SizedBox(height: 20),
        CheckboxListTile(
          value: _trainingCompleted,
          onChanged: (v) => setState(() => _trainingCompleted = v ?? false),
          contentPadding: const EdgeInsets.symmetric(vertical: 4),
          title: const Text('J\'ai suivi la formation sécurité MOVA (utilisation app, règles route)'),
          controlAffinity: ListTileControlAffinity.leading,
        ),
        CheckboxListTile(
          value: _charterAccepted,
          onChanged: (v) => setState(() => _charterAccepted = v ?? false),
          contentPadding: const EdgeInsets.symmetric(vertical: 4),
          title: const Text('J\'accepte la charte de bonne conduite MOVA'),
          controlAffinity: ListTileControlAffinity.leading,
        ),
      ],
    );
  }

  Widget _stepPayout() {
    return ListView(
      padding: const EdgeInsets.only(bottom: 24),
      children: [
        const Text('Informations financières', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
        const SizedBox(height: 16),
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
        const SizedBox(height: _fieldGap),
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
      padding: const EdgeInsets.only(bottom: 24),
      children: [
        const Text('Activation', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
        const SizedBox(height: 16),
        MovaCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Récapitulatif', style: TextStyle(fontWeight: FontWeight.w600)),
              const SizedBox(height: 12),
              Text('Identifiant : ${_state?['publicId'] ?? '—'}'),
              const SizedBox(height: 6),
              Text('Documents requis : ${_state?['kyc']?['requiredComplete'] == true ? 'Complets' : 'Incomplets'}'),
              const SizedBox(height: 6),
              Text('Statut KYC : $kycStatus'),
            ],
          ),
        ),
        const SizedBox(height: 20),
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
      padding: const EdgeInsets.only(bottom: _docGap),
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

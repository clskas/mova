import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../core/config/client_apps_config.dart';
import '../../core/api/api_client.dart';
import '../../core/config/market_config.dart';
import '../../core/error/result.dart';
import '../../core/error/user_friendly_error.dart';
import '../../core/media/image_pick_util.dart';
import '../../core/theme/mova_colors.dart';
import '../../core/widgets/mova_screen.dart';
import '../../core/widgets/mova_widgets.dart';
import '../help/legal_screen.dart';
import '../profile/profile_screen.dart';
import 'driver_home_screen.dart';

/// Parcours d'enregistrement chauffeur — 6 étapes SENGA.
class DriverOnboardingScreen extends ConsumerStatefulWidget {
  const DriverOnboardingScreen({super.key, this.canSkipToHome = false});

  final bool canSkipToHome;

  @override
  ConsumerState<DriverOnboardingScreen> createState() => _DriverOnboardingScreenState();
}

class _DriverOnboardingScreenState extends ConsumerState<DriverOnboardingScreen> {
  final _picker = ImagePicker();
  int _step = 0;
  bool _loading = false;
  String? _error;
  Map<String, dynamic>? _state;
  String? _uploadingDoc;
  List<String> _vehiclePhotos = [];
  String? _scanningDoc;
  final Set<String> _autoFilled = {};

  final _firstName = TextEditingController();
  final _lastName = TextEditingController();
  final _email = TextEditingController();
  final _idNumber = TextEditingController();
  final _licenseNumber = TextEditingController();
  final _licenseExpiry = TextEditingController();
  final _plate = TextEditingController();
  final _make = TextEditingController();
  final _model = TextEditingController();
  final _color = TextEditingController();
  final _insuranceExpiry = TextEditingController();
  final _inspectionExpiry = TextEditingController();
  final _fiscalStickerExpiry = TextEditingController();
  final _payoutPhone = TextEditingController();
  String _vehicleType = 'STANDARD';
  /// Declared passenger seats; null = category default.
  int? _passengerSeats;
  final _cargoVolume = TextEditingController();
  String _payoutProvider = 'ORANGE_MONEY';
  String _operatingCity = '';
  List<String> _cities = const [];
  bool _charterAccepted = false;
  bool _trainingCompleted = false;
  bool _cguAccepted = false;
  bool _isEditingDossier = false;

  static const _stepStorageKey = 'driver_onboarding_step';
  static const _cguStorageKey = 'driver_onboarding_cgu_accepted';
  static const double _fieldGap = 12;
  static const double _docGap = 12;
  static const EdgeInsets _fieldScrollPadding = EdgeInsets.fromLTRB(20, 24, 20, 160);

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
    ('VEHICLE_REGISTRATION', 'Carte rose (optionnel)'),
    ('VEHICLE_INSURANCE', 'Assurance véhicule'),
    ('TECHNICAL_INSPECTION', 'Visite technique'),
    ('FISCAL_STICKER', 'Vignette fiscale'),
    ('CRIMINAL_RECORD', 'Casier judiciaire (optionnel)'),
  ];

  static const _optionalDocTypes = {
    'ID_PHOTO',
    'SELFIE',
    'DRIVERS_LICENSE',
    'VEHICLE_REGISTRATION',
    'VEHICLE_INSURANCE',
    'TECHNICAL_INSPECTION',
    'FISCAL_STICKER',
    'CRIMINAL_RECORD',
  };
  static const _requiredDocCount = 0;
  static const _fallbackCities = [
    'Kinshasa',
    'Lubumbashi',
    'Goma',
    'Bukavu',
    'Kisangani',
    'Mbuji-Mayi',
    'Kananga',
    'Matadi',
    'Boma',
    'Kolwezi',
    'Likasi',
    'Tshikapa',
    'Mbandaka',
    'Kindu',
    'Bunia',
    'Butembo',
    'Beni',
    'Uvira',
    'Kalemie',
    'Kamina',
    'Gbadolite',
    'Gemena',
    'Boende',
    'Lisala',
    'Isiro',
    'Buta',
    'Inongo',
    'Bandundu',
    'Kikwit',
    'Kenge',
    'Kabinda',
    'Lusambo',
  ];

  Future<void> _loadCities() async {
    final api = ref.read(apiClientProvider);
    final result = await api.get('/geo/service-areas');
    final names = <String>{..._fallbackCities};
    if (result is Success) {
      final data = result.data;
      final list = data is List
          ? data
          : (data is Map && data['data'] is List)
              ? data['data'] as List
              : const [];
      for (final row in list) {
        if (row is Map && row['name'] != null) {
          final n = row['name'].toString().trim();
          if (n.isNotEmpty) names.add(n);
        }
      }
    }
    final sorted = names.toList()
      ..sort((a, b) => a.toLowerCase().compareTo(b.toLowerCase()));
    if (!mounted) return;
    setState(() {
      _cities = sorted;
      if (_operatingCity.isNotEmpty && !_cities.contains(_operatingCity)) {
        _cities = [..._cities, _operatingCity]..sort((a, b) => a.toLowerCase().compareTo(b.toLowerCase()));
      }
    });
  }

  Future<void> _restoreOnboardingStep() async {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getInt(_stepStorageKey);
    if (saved == null || saved < 0 || saved >= _steps.length) return;
    if (!mounted) return;
    setState(() => _step = saved);
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
    _firstName.dispose();
    _lastName.dispose();
    _email.dispose();
    _idNumber.dispose();
    _licenseNumber.dispose();
    _cargoVolume.dispose();
    _licenseExpiry.dispose();
    _plate.dispose();
    _make.dispose();
    _model.dispose();
    _color.dispose();
    _insuranceExpiry.dispose();
    _inspectionExpiry.dispose();
    _fiscalStickerExpiry.dispose();
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
        await _restoreCguAccepted();
        await _loadCities();
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
        if (_operatingCity.trim().isEmpty) return 'Choisissez votre ville d\'opération.';
        return null;
      case 1:
        if (_licenseNumber.text.trim().isEmpty) return 'Renseignez le numéro de permis.';
        return null;
      case 2:
        if (_plate.text.trim().isEmpty || _make.text.trim().isEmpty || _model.text.trim().isEmpty) {
          return 'Renseignez plaque, marque et modèle du véhicule.';
        }
        if (!_isEditingDossier && _vehiclePhotos.isEmpty) {
          return 'Ajoutez au moins une photo de votre véhicule.';
        }
        return validateCargoVolume(_vehicleType, _cargoVolume.text);
      case 3:
        if (!_activationConsentsAccepted) {
          return 'Cochez la formation sécurité, la charte et les CGU pour continuer.';
        }
        return null;
      case 4:
        if (_payoutPhone.text.trim().isEmpty) return 'Renseignez le numéro Mobile Money.';
        return null;
      default:
        return null;
    }
  }

  Future<ImageSource?> _pickDocSource() => showMovaImageSourceSheet(context);

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
    _fiscalStickerExpiry.text = _dateOnly(profile?['fiscalStickerExpiry']);
    _payoutProvider = profile?['payoutProvider']?.toString() ?? 'ORANGE_MONEY';
    _payoutPhone.text = profile?['payoutPhone']?.toString() ?? user?['phone']?.toString() ?? '';
    _operatingCity = profile?['operatingCity']?.toString() ?? '';
    _plate.text = vehicle?['plateNumber']?.toString() ?? '';
    _make.text = vehicle?['make']?.toString() ?? '';
    _model.text = vehicle?['model']?.toString() ?? '';
    _color.text = vehicle?['color']?.toString() ?? '';
    _vehicleType = vehicle?['type']?.toString() ?? 'STANDARD';
    final seats = vehicle?['passengerSeats'];
    _passengerSeats = vehicle?['passengerSeatsDeclared'] == true && seats is num ? seats.toInt() : null;
    final cargo = vehicle?['cargoVolumeM3'];
    _cargoVolume.text = cargo is num ? cargo.toInt().toString() : '';
    _vehiclePhotos = vehiclePhotosFrom(vehicle);
    _charterAccepted = profile?['charterAcceptedAt'] != null;
    _trainingCompleted = profile?['trainingCompletedAt'] != null;
    _isEditingDossier = profile?['onboardingCompleted'] == true;
  }

  bool get _activationConsentsAccepted =>
      _trainingCompleted && _charterAccepted && _cguAccepted;

  bool get _continueEnabled {
    if (_loading) return false;
    if (_step == 3 && !_activationConsentsAccepted) return false;
    if (_step == _steps.length - 1 && !_isEditingDossier && !_activationConsentsAccepted) {
      return false;
    }
    return true;
  }

  Future<void> _persistCguAccepted() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_cguStorageKey, _cguAccepted);
  }

  Future<void> _restoreCguAccepted() async {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getBool(_cguStorageKey);
    if (saved == true && mounted) {
      setState(() => _cguAccepted = true);
    }
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
      if (_email.text.trim().isNotEmpty) 'email': _email.text.trim(),
    }));
    await _requirePatch(api.patch('/drivers/onboarding', {
      'idDocumentNumber': _idNumber.text.trim(),
      'operatingCity': _operatingCity.trim(),
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
      'vehicleColor': _color.text.trim(),
      if (_vehicleType != 'MOTO_TAXI' && _vehicleType != 'TRIPOTEUR' && _passengerSeats != null)
        'vehiclePassengerSeats': _passengerSeats,
      if (cargoVolumeRange(_vehicleType) != null && int.tryParse(_cargoVolume.text.trim()) != null)
        'vehicleCargoVolumeM3': int.parse(_cargoVolume.text.trim()),
      if (_vehiclePhotos.isNotEmpty) 'vehiclePhotoUrls': _vehiclePhotos,
      if (_insuranceExpiry.text.trim().isNotEmpty) 'insuranceExpiry': _insuranceExpiry.text.trim(),
      if (_inspectionExpiry.text.trim().isNotEmpty) 'technicalInspectionExpiry': _inspectionExpiry.text.trim(),
      if (_fiscalStickerExpiry.text.trim().isNotEmpty) 'fiscalStickerExpiry': _fiscalStickerExpiry.text.trim(),
    }));
  }

  /// Saves the whole photo list (5 max); the first one is the main photo.
  Future<bool> _saveVehiclePhotos(List<String> photos) async {
    final result = await ref.read(apiClientProvider).patch('/drivers/onboarding', {'vehiclePhotoUrls': photos});
    if (!mounted) return false;
    switch (result) {
      case Success():
        setState(() => _vehiclePhotos = photos);
        return true;
      case Failure(:final error):
        setState(() => _error = error.message);
        return false;
    }
  }

  Future<void> _uploadVehiclePhoto() async {
    if (_vehiclePhotos.length >= kMaxVehiclePhotos) return;
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
    final upload = await ref.read(apiClientProvider).uploadVehiclePhoto(File(file.path));
    if (!mounted) return;
    switch (upload) {
      case Success(:final data):
        if (data.isEmpty) {
          setState(() {
            _uploadingDoc = null;
            _error = 'Échec envoi photo — réessayez.';
          });
          return;
        }
        final saved = await _saveVehiclePhotos([..._vehiclePhotos, data].take(kMaxVehiclePhotos).toList());
        if (!mounted) return;
        setState(() => _uploadingDoc = null);
        if (saved) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Photo ${_vehiclePhotos.length}/$kMaxVehiclePhotos enregistrée')),
          );
        }
      case Failure(:final error):
        setState(() {
          _uploadingDoc = null;
          _error = error.message;
        });
    }
  }

  Future<void> _removeVehiclePhoto(int index) async {
    final next = [..._vehiclePhotos]..removeAt(index);
    await _saveVehiclePhotos(next);
  }

  Future<void> _makeMainVehiclePhoto(int index) async {
    if (index == 0) return;
    final next = [..._vehiclePhotos];
    final picked = next.removeAt(index);
    await _saveVehiclePhotos([picked, ...next]);
  }

  Future<void> _savePayout() async {
    await _requirePatch(ref.read(apiClientProvider).patch('/drivers/onboarding', {
      'payoutProvider': _payoutProvider,
      'payoutPhone': MarketConfig.normalizePhone(_payoutPhone.text.trim()),
    }));
  }

  Future<void> _finishOnboarding() async {
    if (!_isEditingDossier && !_activationConsentsAccepted) {
      setState(() => _error = 'Cochez la formation sécurité, la charte et les CGU.');
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
        if (_cguAccepted) 'cguAccepted': true,
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
      'cguAccepted': true,
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
            content: Text('Dossier envoyé — validation SENGA sous 24-48 h.'),
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
    final isSelfie = type == 'SELFIE';
    // Selfie = caméra avant uniquement (pas de galerie) pour forcer une prise de vue live.
    final ImageSource? source =
        isSelfie ? ImageSource.camera : await _pickDocSource();
    if (source == null || !mounted) return;
    final file = await pickMovaImage(
      _picker,
      source,
      preferredCameraDevice: isSelfie ? CameraDevice.front : CameraDevice.rear,
    );
    if (file == null) {
      if (mounted) {
        showImagePickError(
          context,
          message: isSelfie
              ? 'Selfie annulée — activez la caméra avant et cadrage visage.'
              : null,
        );
      }
      return;
    }
    if (!mounted) return;
    setState(() {
      _uploadingDoc = type;
      _error = null;
    });
    final api = ref.read(apiClientProvider);
    final upload = await api.uploadKycPhoto(File(file.path));
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
            if (kScannableDocTypes.contains(type)) await _scanAndPrefill(type);
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

  /// Reads the document just sent (IA) and fills the fields still empty. Never blocks:
  /// if reading is unavailable the driver simply types the fields.
  Future<void> _scanAndPrefill(String type) async {
    if (!mounted) return;
    setState(() => _scanningDoc = type);
    final result = await ref.read(apiClientProvider).post('/drivers/onboarding/scan', {'type': type});
    if (!mounted) return;
    setState(() => _scanningDoc = null);
    switch (result) {
      case Success(:final data):
        final raw = data['fields'];
        final fields = raw is Map ? raw.map((k, v) => MapEntry(k.toString(), v?.toString() ?? '')) : <String, String>{};
        final filled = applyScannedFields(type, fields, _prefillTargets());
        if (filled.isNotEmpty) {
          setState(() => _autoFilled.addAll(filled));
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Rempli automatiquement : ${filled.join(', ')}. Vérifiez avant de continuer.')),
          );
        } else if (data['message'] != null) {
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(data['message'].toString())));
        }
      case Failure():
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Lecture automatique indisponible — remplissez les champs vous-même.')),
        );
    }
  }

  Map<String, TextEditingController> _prefillTargets() => {
        'firstName': _firstName,
        'lastName': _lastName,
        'idNumber': _idNumber,
        'licenseNumber': _licenseNumber,
        'DRIVERS_LICENSE.expiryDate': _licenseExpiry,
        'VEHICLE_INSURANCE.expiryDate': _insuranceExpiry,
        'TECHNICAL_INSPECTION.expiryDate': _inspectionExpiry,
        'FISCAL_STICKER.expiryDate': _fiscalStickerExpiry,
        'plateNumber': _plate,
        'make': _make,
        'model': _model,
        'color': _color,
      };

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
      checklist.add({
        'type': type,
        'uploaded': true,
        'url': url,
        'required': !_optionalDocTypes.contains(type),
      });
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
      } else {
        await _finishOnboarding();
      }
    } catch (e) {
      setState(() {
        _loading = false;
        _error = sanitizeUserMessage(
          e is Exception ? e.toString().replaceFirst('Exception: ', '') : e.toString(),
        );
      });
    }
  }

  void _back() {
    if (_step == 0) return;
    setState(() => _step -= 1);
    _persistOnboardingStep();
  }

  /// Sticky chrome that used to sit above the form. Kept inside the ListView so
  /// opening the keyboard never inserts/removes Column siblings (that rematches
  /// [Expanded] / [TextField] slots and immediately unfocuses).
  List<Widget> _dossierChrome() {
    final publicId = _state?['publicId']?.toString();
    return [
      if (publicId != null)
        Text(
          'Identifiant chauffeur : $publicId',
          style: const TextStyle(fontWeight: FontWeight.bold, color: MovaColors.violet),
        ),
      ListTile(
        contentPadding: EdgeInsets.zero,
        leading: const Icon(Icons.link, color: MovaColors.violet),
        title: const Text(
          'Compte et connexion',
          style: TextStyle(fontWeight: FontWeight.w600),
        ),
        subtitle: const Text('Lier Google ou un numéro +243 — un seul compte chauffeur'),
        trailing: const Icon(Icons.chevron_right),
        onTap: () {
          Navigator.of(context).push(
            MaterialPageRoute(
              builder: (_) => const ProfileScreen(title: 'Compte et connexion'),
            ),
          );
        },
      ),
      if (_state?['kyc'] != null) ...[
        const SizedBox(height: 8),
        Text(
          _requiredDocCount > 0
              ? 'Documents : ${_state!['kyc']['checklist'] is List ? (_state!['kyc']['checklist'] as List).where((i) => i is Map && i['required'] == true && i['uploaded'] == true).length : 0}/$_requiredDocCount obligatoires'
              : 'Documents : tous optionnels pour le moment — SENGA peut les rendre obligatoires plus tard pour continuer à recevoir des courses.',
          style: const TextStyle(color: MovaColors.textSecondary, fontSize: 13),
        ),
      ],
      const SizedBox(height: 8),
    ];
  }

  Widget _stepScroll({required List<Widget> children}) {
    return ListView(
      key: PageStorageKey<String>('driver-dossier-step-$_step'),
      physics: kMovaScrollPhysics,
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.only(bottom: 24),
      children: [
        ..._dossierChrome(),
        ...children,
      ],
    );
  }

  Widget _cityCombobox() {
    final options = _cities.isNotEmpty ? _cities : _fallbackCities;
    return Autocomplete<String>(
      initialValue: TextEditingValue(text: _operatingCity),
      optionsMaxHeight: 280,
      optionsBuilder: (TextEditingValue text) {
        final q = text.text.trim().toLowerCase();
        // Champ prérempli (ex. Kinshasa) : montrer toutes les villes pour pouvoir changer.
        if (q.isEmpty ||
            (_operatingCity.isNotEmpty && q == _operatingCity.trim().toLowerCase())) {
          return options;
        }
        return options.where((c) => c.toLowerCase().contains(q));
      },
      onSelected: (value) {
        setState(() => _operatingCity = value);
      },
      fieldViewBuilder: (context, controller, focusNode, onFieldSubmitted) {
        if (controller.text != _operatingCity && _operatingCity.isNotEmpty && !focusNode.hasFocus) {
          controller.text = _operatingCity;
        }
        return TextField(
          controller: controller,
          focusNode: focusNode,
          scrollPadding: _fieldScrollPadding,
          decoration: InputDecoration(
            labelText: 'Ville d\'opération',
            hintText: 'Rechercher parmi ${options.length} villes RDC',
            helperText: 'Capitales provinciales et grandes villes',
            suffixIcon: IconButton(
              tooltip: 'Effacer pour voir toutes les villes',
              icon: const Icon(Icons.clear),
              onPressed: () {
                controller.clear();
                setState(() => _operatingCity = '');
                focusNode.requestFocus();
              },
            ),
          ),
          onChanged: (v) => _operatingCity = v,
          onSubmitted: (_) => onFieldSubmitted(),
        );
      },
    );
  }

  Widget _kycTextField({
    required TextEditingController controller,
    required String label,
    TextInputType? keyboardType,
  }) {
    return TextField(
      key: ValueKey<String>('driver-dossier-$label'),
      controller: controller,
      keyboardType: keyboardType,
      scrollPadding: _fieldScrollPadding,
      textInputAction: TextInputAction.next,
      decoration: InputDecoration(labelText: label),
    );
  }

  Widget _currentStep() {
    return switch (_step) {
      0 => _stepPersonal(),
      1 => _stepLicense(),
      2 => _stepVehicle(),
      3 => _stepCompliance(),
      4 => _stepPayout(),
      _ => _stepActivation(),
    };
  }

  @override
  Widget build(BuildContext context) {
    return MovaScreen(
      title: widget.canSkipToHome ? 'Mon dossier chauffeur' : 'Enregistrement chauffeur',
      scrollable: false,
      resizeToAvoidBottomInset: true,
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
                const SizedBox(height: 12),
                Expanded(child: _currentStep()),
                const SizedBox(height: 16),
                Row(
                  children: [
                    if (_step > 0)
                      Expanded(
                        child: MovaButton(
                          label: 'Retour',
                          isSecondary: true,
                          icon: Icons.arrow_back_rounded,
                          onPressed: _loading ? null : _back,
                        ),
                      ),
                    if (_step > 0) const SizedBox(width: 12),
                    Expanded(
                      child: MovaButton(
                        label: _step == _steps.length - 1
                            ? (_isEditingDossier ? 'Enregistrer' : 'Envoyer le dossier')
                            : 'Continuer',
                        icon: Icons.arrow_forward_rounded,
                        isLoading: _loading,
                        onPressed: _continueEnabled ? _next : null,
                      ),
                    ),
                  ],
                ),
              ],
            ),
    );
  }

  Widget _stepPersonal() {
    return _stepScroll(
      children: [
        const Text('Informations personnelles', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
        const SizedBox(height: 10),
        const Text(
          'Votre identifiant SENGA (DRV-…) sera visible par le support client.',
          style: TextStyle(color: MovaColors.textSecondary, fontSize: 13),
        ),
        const SizedBox(height: 16),
        _kycTextField(controller: _firstName, label: 'Prénom'),
        const SizedBox(height: _fieldGap),
        _kycTextField(controller: _lastName, label: 'Nom'),
        const SizedBox(height: _fieldGap),
        _kycTextField(controller: _email, label: 'Email', keyboardType: TextInputType.emailAddress),
        const SizedBox(height: _fieldGap),
        _kycTextField(controller: _idNumber, label: 'N° carte d\'identité / passeport'),
        const SizedBox(height: _fieldGap),
        _cityCombobox(),
        const SizedBox(height: 20),
        _docButton('ID_PHOTO', 'Carte d\'identité / passeport'),
        _docButton('SELFIE', 'Photo récente (profil)'),
      ],
    );
  }

  Widget _stepLicense() {
    return _stepScroll(
      children: [
        const Text('Permis de conduire', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
        if (_renewalPending) ...[
          const SizedBox(height: 12),
          const MovaCard(
            child: Text(
              'Renouvellement en attente : après modification des dates, SENGA doit valider vos nouveaux justificatifs avant que vous puissiez repasser en ligne.',
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
        _kycTextField(controller: _licenseNumber, label: 'N° permis'),
        const SizedBox(height: _fieldGap),
        _datePickerField(controller: _licenseExpiry, label: 'Date d\'expiration du permis'),
        const SizedBox(height: 12),
        _docButton('DRIVERS_LICENSE', 'Photographier le permis'),
      ],
    );
  }

  Widget _stepVehicle() {
    return _stepScroll(
      children: [
        const Text('Véhicule', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
        const SizedBox(height: 16),
        DropdownButtonFormField<String>(
          value: _vehicleType,
          decoration: const InputDecoration(labelText: 'Type'),
          items: const [
            DropdownMenuItem(value: 'MOTO_TAXI', child: Text('Moto-taxi')),
            DropdownMenuItem(value: 'STANDARD', child: Text('Standard')),
            DropdownMenuItem(value: 'COMFORT', child: Text('Confort')),
            DropdownMenuItem(value: 'VIP', child: Text('VIP')),
            DropdownMenuItem(value: 'FAMILIALE', child: Text('Familiale (6 à 8 places)')),
            DropdownMenuItem(value: 'UTILITAIRE', child: Text('Utilitaire')),
            DropdownMenuItem(value: 'CAMION', child: Text('Camion')),
            DropdownMenuItem(value: 'TRICYCLE', child: Text('Tricycle passagers (1 à 3 places)')),
            DropdownMenuItem(value: 'TRIPOTEUR', child: Text('Tripoteur marchandises')),
          ],
          onChanged: (v) => setState(() {
            _vehicleType = v ?? 'STANDARD';
            // Drop a declaration the new category does not allow (e.g. 4 seats → Familiale).
            if (_vehicleType == 'MOTO_TAXI' ||
                _vehicleType == 'TRIPOTEUR' ||
                (_passengerSeats != null && !declarableSeats(_vehicleType).contains(_passengerSeats))) {
              _passengerSeats = null;
            }
          }),
        ),
        if (_vehicleType != 'MOTO_TAXI' && _vehicleType != 'TRIPOTEUR') ...[
          const SizedBox(height: _fieldGap),
          DropdownButtonFormField<int>(
            key: const Key('vehiclePassengerSeats'),
            value: _passengerSeats ?? defaultPassengerSeats(_vehicleType),
            decoration: InputDecoration(
              labelText: 'Places passagers (sans compter le chauffeur)',
              helperText: _vehicleType == 'FAMILIALE'
                  ? 'Familiale : 5 à 8 places. Vous recevez aussi les courses Standard.'
                  : _vehicleType == 'TRICYCLE'
                      ? 'Tricycle : 1 à 3 places. Vous recevez les courses de la gamme Tricycle et des petits colis.'
                  : 'Les groupes plus grands que vos places ne vous seront pas proposés. '
                      '6 places ou plus ? Choisissez la catégorie Familiale.',
              helperMaxLines: 3,
            ),
            items: [
              for (final n in declarableSeats(_vehicleType))
                DropdownMenuItem(value: n, child: Text('$n place${n > 1 ? 's' : ''}')),
            ],
            onChanged: (v) => setState(() => _passengerSeats = v),
          ),
        ],
        if (cargoVolumeRange(_vehicleType) != null) ...[
          const SizedBox(height: _fieldGap),
          TextFormField(
            key: const Key('vehicleCargoVolume'),
            controller: _cargoVolume,
            keyboardType: TextInputType.number,
            decoration: InputDecoration(
              labelText: 'Volume utile (m³)',
              suffixText: 'm³',
              helperText: 'Espace de chargement de votre ${switch (_vehicleType) { 'CAMION' => 'camion', 'TRIPOTEUR' => 'tripoteur', _ => 'utilitaire' }} '
                  '(${cargoVolumeRange(_vehicleType)!.min} à ${cargoVolumeRange(_vehicleType)!.max} m³). '
                  'Vous ne recevrez que les déménagements qui y tiennent. SENGA le vérifie avec la photo.',
              helperMaxLines: 4,
            ),
          ),
        ],
        const SizedBox(height: _fieldGap),
        _kycTextField(controller: _plate, label: 'Plaque d\'immatriculation'),
        const SizedBox(height: _fieldGap),
        _kycTextField(controller: _make, label: 'Marque'),
        const SizedBox(height: _fieldGap),
        _kycTextField(controller: _model, label: 'Modèle'),
        const SizedBox(height: _fieldGap),
        _kycTextField(controller: _color, label: 'Couleur (optionnel)'),
        const SizedBox(height: _fieldGap),
        _datePickerField(controller: _insuranceExpiry, label: 'Assurance expire le'),
        _datePickerField(controller: _inspectionExpiry, label: 'Visite technique expire le'),
        _datePickerField(controller: _fiscalStickerExpiry, label: 'Vignette fiscale expire le'),
        if (_isEditingDossier) ...[
          const SizedBox(height: 8),
          const Text(
            'En cas de changement, renvoyez les photos assurance, visite technique et vignette fiscale.',
            style: TextStyle(color: MovaColors.textSecondary, fontSize: 12),
          ),
        ],
        const SizedBox(height: 12),
        Text(
          'Photos de l\'engin (${_vehiclePhotos.length}/$kMaxVehiclePhotos)',
          style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
        ),
        const SizedBox(height: 4),
        const Text(
          'Avant, arrière, côté, intérieur… La première photo est la photo principale.',
          style: TextStyle(fontSize: 12, color: MovaColors.textSecondary),
        ),
        const SizedBox(height: 12),
        if (_vehiclePhotos.isEmpty)
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
                Text('Au moins une photo — vue latérale ou 3/4', style: TextStyle(fontSize: 12, color: MovaColors.textSecondary)),
              ],
            ),
          )
        else
          GridView.count(
            key: const Key('vehiclePhotosGrid'),
            crossAxisCount: 3,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 8,
            crossAxisSpacing: 8,
            children: [
              for (var i = 0; i < _vehiclePhotos.length; i++)
                Stack(
                  fit: StackFit.expand,
                  children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(10),
                      child: Image.network(
                        MarketConfig.resolveMediaUrl(_vehiclePhotos[i]),
                        fit: BoxFit.cover,
                        errorBuilder: (_, __, ___) => Container(
                          color: MovaColors.violet.withValues(alpha: 0.1),
                          child: const Icon(Icons.directions_car, color: MovaColors.violet),
                        ),
                      ),
                    ),
                    if (i == 0)
                      Positioned(
                        left: 4,
                        top: 4,
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(color: MovaColors.violet, borderRadius: BorderRadius.circular(6)),
                          child: const Text('Principale', style: TextStyle(color: Colors.white, fontSize: 10)),
                        ),
                      ),
                    Positioned(
                      right: 0,
                      top: 0,
                      child: PopupMenuButton<String>(
                        icon: const Icon(Icons.more_vert, color: Colors.white, size: 20),
                        onSelected: (action) => action == 'main' ? _makeMainVehiclePhoto(i) : _removeVehiclePhoto(i),
                        itemBuilder: (_) => [
                          if (i > 0) const PopupMenuItem(value: 'main', child: Text('Mettre en premier')),
                          const PopupMenuItem(value: 'remove', child: Text('Retirer')),
                        ],
                      ),
                    ),
                  ],
                ),
            ],
          ),
        const SizedBox(height: 12),
        if (_vehiclePhotos.length < kMaxVehiclePhotos)
          OutlinedButton.icon(
            key: const Key('addVehiclePhoto'),
            onPressed: _uploadingDoc == 'VEHICLE_PHOTO' ? null : _uploadVehiclePhoto,
            icon: _uploadingDoc == 'VEHICLE_PHOTO'
                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.photo_camera_outlined),
            label: Text(_vehiclePhotos.isEmpty ? 'Prendre une photo' : 'Ajouter une photo'),
          ),
        const SizedBox(height: 20),
        _docButton('VEHICLE_REGISTRATION', 'Carte rose (optionnel)'),
        _docButton('VEHICLE_INSURANCE', 'Assurance'),
        _docButton('TECHNICAL_INSPECTION', 'Visite technique'),
        _docButton('FISCAL_STICKER', 'Vignette fiscale'),
      ],
    );
  }

  Widget _stepCompliance() {
    return _stepScroll(
      children: [
        const Text('Sécurité & conformité', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
        const SizedBox(height: 16),
        _docButton('CRIMINAL_RECORD', 'Casier judiciaire (recommandé)'),
        const SizedBox(height: 20),
        CheckboxListTile(
          value: _trainingCompleted,
          onChanged: (v) => setState(() => _trainingCompleted = v ?? false),
          contentPadding: const EdgeInsets.symmetric(vertical: 4),
          title: const Text('J\'ai suivi la formation sécurité SENGA (utilisation app, règles route)'),
          controlAffinity: ListTileControlAffinity.leading,
        ),
        CheckboxListTile(
          value: _charterAccepted,
          onChanged: (v) => setState(() => _charterAccepted = v ?? false),
          contentPadding: const EdgeInsets.symmetric(vertical: 4),
          title: const Text('J\'accepte la charte de bonne conduite SENGA'),
          controlAffinity: ListTileControlAffinity.leading,
        ),
        CheckboxListTile(
          value: _cguAccepted,
          onChanged: (v) {
            setState(() => _cguAccepted = v ?? false);
            _persistCguAccepted();
          },
          contentPadding: const EdgeInsets.symmetric(vertical: 4),
          title: const Text('J\'accepte les Conditions Générales d\'Utilisation (CGU) SENGA'),
          subtitle: GestureDetector(
            onTap: () {
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => const LegalScreen(
                    title: 'CGU',
                    asset: 'assets/legal/cgu_fr.md',
                    apiPath: '/public/cgu',
                  ),
                ),
              );
            },
            child: const Text(
              'Lire les CGU',
              style: TextStyle(
                color: MovaColors.violet,
                decoration: TextDecoration.underline,
              ),
            ),
          ),
          controlAffinity: ListTileControlAffinity.leading,
        ),
      ],
    );
  }

  Widget _stepPayout() {
    return _stepScroll(
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
        _kycTextField(
          controller: _payoutPhone,
          label: 'Numéro de retrait (+243…)',
          keyboardType: TextInputType.phone,
        ),
      ],
    );
  }

  Widget _stepActivation() {
    final kycStatus = _state?['profile']?['kycStatus']?.toString() ?? 'PENDING';
    return _stepScroll(
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
          'Après validation par l\'équipe SENGA, vous recevrez un code PIN à 6 chiffres pour activer votre compte et accepter des courses.',
          style: TextStyle(color: MovaColors.textSecondary),
        ),
      ],
    );
  }

  Widget _docButton(String type, String label) {
    final done = _docUploaded(type);
    final notes = _docRejectNotes(type);
    return Padding(
      padding: const EdgeInsets.only(bottom: _docGap),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          MovaButton(
            label: done ? '$label ✓' : label,
            isSecondary: true,
            icon: done ? Icons.check_circle_outline : Icons.camera_alt,
            isLoading: _uploadingDoc == type,
            onPressed: _uploadingDoc != null || _scanningDoc != null ? null : () => _uploadDoc(type, label),
          ),
          if (_scanningDoc == type) ...[
            const SizedBox(height: 6),
            const LinearProgressIndicator(minHeight: 2),
            const SizedBox(height: 4),
            const Text(
              'Lecture du document… les champs vont se remplir.',
              style: TextStyle(fontSize: 12, color: MovaColors.textSecondary),
            ),
          ] else if (!done && kScannableDocTypes.contains(type))
            const Padding(
              padding: EdgeInsets.only(top: 4),
              child: Text(
                'Les champs de cette étape seront remplis automatiquement à partir de la photo.',
                style: TextStyle(fontSize: 12, color: MovaColors.textSecondary),
              ),
            ),
          if (notes != null && notes.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text('Motif du refus : $notes', style: const TextStyle(color: Colors.red, fontSize: 13)),
            ),
        ],
      ),
    );
  }

  String? _docRejectNotes(String type) {
    final checklist = _state?['kyc']?['checklist'] as List? ?? [];
    for (final item in checklist) {
      if (item is Map && item['type'] == type) {
        final status = item['status']?.toString();
        final notes = item['notes']?.toString();
        if (status == 'REJECTED' && notes != null && notes.isNotEmpty) return notes;
      }
    }
    return null;
  }
}

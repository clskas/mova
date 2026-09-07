class CompanyContact {
  const CompanyContact({
    required this.id,
    required this.name,
    this.title,
    this.department,
    this.phone,
    this.email,
    this.notes,
  });

  final String id;
  final String name;
  final String? title;
  final String? department;
  final String? phone;
  final String? email;
  final String? notes;

  factory CompanyContact.fromJson(Map<String, dynamic> json) {
    String? text(String key) {
      final value = json[key];
      if (value == null) return null;
      final trimmed = value.toString().trim();
      return trimmed.isEmpty ? null : trimmed;
    }

    return CompanyContact(
      id: json['id']?.toString() ?? '',
      name: (json['name']?.toString().trim().isNotEmpty ?? false)
          ? json['name'].toString().trim()
          : 'Contact',
      title: text('title'),
      department: text('department'),
      phone: text('phone'),
      email: text('email'),
      notes: text('notes'),
    );
  }

  String? get telUri {
    final value = phone;
    if (value == null) return null;
    return 'tel:${value.replaceAll(RegExp(r'\s'), '')}';
  }

  String? get mailtoUri {
    final value = email;
    if (value == null) return null;
    return Uri(
      scheme: 'mailto',
      path: value,
      query: 'subject=Assistance SENGA',
    ).toString();
  }

  String? get whatsappUri {
    final value = phone;
    if (value == null) return null;
    final digits = value.replaceAll(RegExp(r'\D'), '');
    if (digits.isEmpty) return null;
    return 'https://wa.me/$digits';
  }
}

import '../../core/i18n/i18n.dart';

String _two(int v) => v.toString().padLeft(2, '0');

/// Local date of an ISO timestamp: "07/11 · 14:32" this year, "07/11/2025 · 14:32" before.
String formatHistoryDate(String? iso) {
  final dt = DateTime.tryParse(iso ?? '')?.toLocal();
  if (dt == null) return '';
  final now = DateTime.now();
  final day = '${_two(dt.day)}/${_two(dt.month)}${dt.year == now.year ? '' : '/${dt.year}'}';
  return '$day · ${_two(dt.hour)}:${_two(dt.minute)}';
}

/// Date shown on a history line: when it happened (or is planned).
String historyDateLabel(Map<String, dynamic> item) {
  final meta = item['meta'] is Map ? item['meta'] as Map : const {};
  final iso = meta['scheduledAt']?.toString() ??
      meta['startDate']?.toString() ??
      item['completedAt']?.toString() ??
      item['createdAt']?.toString();
  return formatHistoryDate(iso);
}

/// 'YYYY-MM' of a history line (month filter).
String? historyMonthKey(Map<String, dynamic> item) {
  final dt = DateTime.tryParse(item['createdAt']?.toString() ?? '')?.toLocal();
  if (dt == null) return null;
  return '${dt.year}-${_two(dt.month)}';
}

const _monthsFr = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

/// "Novembre 2026" (translated month name).
String historyMonthLabel(String key) {
  final parts = key.split('-');
  final m = int.tryParse(parts.length > 1 ? parts[1] : '') ?? 0;
  if (m < 1 || m > 12) return key;
  return '${tr(_monthsFr[m - 1])} ${parts[0]}';
}

import 'dart:async';

import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../api/mock_data.dart';
import '../error/result.dart';
import '../theme/mova_colors.dart';
import 'mova_layout.dart';

/// Champ adresse avec suggestions géocodées inline (sans overlay — stable petits écrans).
class GeoAutocompleteField extends StatefulWidget {
  const GeoAutocompleteField({
    super.key,
    required this.controller,
    required this.api,
    required this.city,
    this.label,
    this.hint,
    this.prefixIcon,
    this.suffixIcon,
    this.onSelected,
    this.onUserInput,
    this.blockedQueries = const {'Ma position'},
    this.textInputAction,
    this.debounceMs = 350,
  });

  final TextEditingController controller;
  final ApiClient api;
  final String city;
  final String? label;
  final String? hint;
  final IconData? prefixIcon;
  final Widget? suffixIcon;
  final void Function(Map<String, dynamic> suggestion)? onSelected;
  final VoidCallback? onUserInput;
  final Set<String> blockedQueries;
  final TextInputAction? textInputAction;
  final int debounceMs;

  @override
  State<GeoAutocompleteField> createState() => _GeoAutocompleteFieldState();
}

class _GeoAutocompleteFieldState extends State<GeoAutocompleteField> {
  Timer? _debounce;
  bool _loading = false;
  bool _showSuggestions = false;
  List<Map<String, dynamic>> _suggestions = [];
  String? _pendingQuery;
  int _fetchGeneration = 0;
  bool _notifiedUserInput = false;
  final _focusNode = FocusNode();

  @override
  void initState() {
    super.initState();
    _focusNode.addListener(_onFocusChange);
  }

  void _onFocusChange() {
    if (!_focusNode.hasFocus) {
      _debounce?.cancel();
      _pendingQuery = null;
      _fetchGeneration++;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && !_focusNode.hasFocus) {
          _clearSuggestions();
        }
      });
    }
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _fetchGeneration++;
    _focusNode.removeListener(_onFocusChange);
    _focusNode.dispose();
    super.dispose();
  }

  bool get _canUpdateUi => mounted && _focusNode.hasFocus;

  String _normalizeQuery(String value) {
    final trimmed = value.trim();
    for (final blocked in widget.blockedQueries) {
      if (trimmed == blocked) return '';
      if (trimmed.startsWith(blocked) && trimmed.length > blocked.length) {
        return trimmed.substring(blocked.length).trim();
      }
    }
    return trimmed;
  }

  void _applyNormalizedQuery(String normalized, {required String rawValue}) {
    if (normalized == rawValue.trim()) return;
    widget.controller.value = TextEditingValue(
      text: normalized,
      selection: TextSelection.collapsed(offset: normalized.length),
    );
  }

  void _clearSuggestions() {
    _debounce?.cancel();
    if (!_showSuggestions && _suggestions.isEmpty && !_loading) return;
    if (!mounted) return;
    setState(() {
      _showSuggestions = false;
      _suggestions = [];
      _loading = false;
      _pendingQuery = null;
    });
  }

  List<Map<String, dynamic>> _localSuggestions(String query, String city) {
    final seen = <String>{};
    final merged = <Map<String, dynamic>>[];
    for (final item in [
      ...MockData.geoAutocomplete(query, city: city),
      ...MockData.geoAutocomplete(query),
    ]) {
      final label = item['label']?.toString() ?? item['address']?.toString() ?? '';
      if (label.isEmpty || seen.contains(label)) continue;
      seen.add(label);
      merged.add(item);
    }
    return merged.take(12).toList();
  }

  List<Map<String, dynamic>> _mergeSuggestions(
    List<Map<String, dynamic>> current,
    List<Map<String, dynamic>> incoming,
  ) {
    final seen = <String>{};
    final merged = <Map<String, dynamic>>[];
    for (final item in [...incoming, ...current]) {
      final label = item['label']?.toString() ?? item['address']?.toString() ?? '';
      if (label.isEmpty || seen.contains(label)) continue;
      seen.add(label);
      merged.add(item);
    }
    return merged.take(12).toList();
  }

  void _presentSuggestions(List<Map<String, dynamic>> items) {
    if (items.isEmpty || !_canUpdateUi) return;
    setState(() {
      _suggestions = items;
      _showSuggestions = true;
    });
  }

  void _onUserTyped(String value) {
    _debounce?.cancel();
    final normalized = _normalizeQuery(value);
    if (normalized.isEmpty) {
      _notifiedUserInput = false;
      _clearSuggestions();
      return;
    }
    if (normalized != value.trim()) {
      _applyNormalizedQuery(normalized, rawValue: value);
    }
    if (normalized.length < 2) {
      _clearSuggestions();
      return;
    }

    if (!_notifiedUserInput) {
      _notifiedUserInput = true;
      widget.onUserInput?.call();
    }

    _pendingQuery = normalized;
    final city = widget.city;
    _presentSuggestions(_localSuggestions(normalized, city));
    if (!_canUpdateUi) return;
    setState(() => _loading = true);

    final generation = ++_fetchGeneration;
    _debounce = Timer(Duration(milliseconds: widget.debounceMs), () {
      _fetch(normalized, city, generation);
    });
  }

  Future<void> _fetch(String query, String city, int generation) async {
    final result = await widget.api.geoAutocomplete(query, city: city);
    if (!mounted || generation != _fetchGeneration || !_focusNode.hasFocus) return;
    if (_pendingQuery != query || _normalizeQuery(widget.controller.text) != query) return;

    setState(() => _loading = false);
    switch (result) {
      case Success(:final data):
        final merged = _mergeSuggestions(_suggestions, data);
        if (merged.isEmpty) {
          _clearSuggestions();
          return;
        }
        if (!_canUpdateUi) return;
        setState(() {
          _suggestions = merged;
          _showSuggestions = true;
        });
      case Failure():
        if (_suggestions.isEmpty) {
          _clearSuggestions();
        }
    }
  }

  void _select(Map<String, dynamic> suggestion) {
    final label = suggestion['label']?.toString() ?? suggestion['address']?.toString() ?? '';
    widget.controller.text = label;
    _notifiedUserInput = false;
    _fetchGeneration++;
    _clearSuggestions();
    _focusNode.unfocus();
    widget.onSelected?.call(suggestion);
  }

  Widget _buildSuggestionsList(bool compact) {
    if (!_showSuggestions || _suggestions.isEmpty) {
      return const SizedBox.shrink();
    }

    final items = _suggestions.take(6).toList();

    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: Material(
        elevation: 2,
        borderRadius: BorderRadius.circular(12),
        color: Colors.white,
        clipBehavior: Clip.antiAlias,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (var i = 0; i < items.length; i++) ...[
              if (i > 0) const Divider(height: 1),
              ListTile(
                dense: true,
                visualDensity: VisualDensity.compact,
                leading: Icon(
                  widget.prefixIcon ?? Icons.location_on_outlined,
                  size: compact ? 18 : 20,
                  color: MovaColors.violet,
                ),
                title: Text(
                  items[i]['label']?.toString() ?? items[i]['address']?.toString() ?? '',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: compact ? 13 : 14),
                ),
                onTap: () => _select(items[i]),
              ),
            ],
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final compact = MovaLayout.isCompact(context);

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: widget.controller,
          focusNode: _focusNode,
          textInputAction: widget.textInputAction,
          style: compact ? const TextStyle(fontSize: 14) : null,
          onTap: () {
            for (final blocked in widget.blockedQueries) {
              if (widget.controller.text.trim() == blocked) {
                widget.controller.selection = TextSelection(
                  baseOffset: 0,
                  extentOffset: widget.controller.text.length,
                );
                break;
              }
            }
          },
          onChanged: _onUserTyped,
          onEditingComplete: _clearSuggestions,
          decoration: InputDecoration(
            isDense: compact,
            contentPadding: compact
                ? const EdgeInsets.symmetric(horizontal: 12, vertical: 12)
                : null,
            labelText: widget.label,
            hintText: widget.hint,
            labelStyle: compact ? const TextStyle(fontSize: 13) : null,
            hintStyle: compact ? const TextStyle(fontSize: 13) : null,
            prefixIcon: widget.prefixIcon != null ? Icon(widget.prefixIcon, size: compact ? 20 : 24) : null,
            suffixIconConstraints: BoxConstraints(
              minWidth: compact ? 36 : 48,
              minHeight: compact ? 36 : 48,
            ),
            suffixIcon: widget.suffixIcon != null
                ? (_loading
                    ? Padding(
                        padding: EdgeInsets.all(compact ? 8 : 12),
                        child: SizedBox(
                          width: compact ? 16 : 18,
                          height: compact ? 16 : 18,
                          child: const CircularProgressIndicator(strokeWidth: 2),
                        ),
                      )
                    : widget.suffixIcon)
                : (_loading
                    ? Padding(
                        padding: EdgeInsets.all(compact ? 8 : 12),
                        child: SizedBox(
                          width: compact ? 16 : 18,
                          height: compact ? 16 : 18,
                          child: const CircularProgressIndicator(strokeWidth: 2),
                        ),
                      )
                    : null),
          ),
        ),
        _buildSuggestionsList(compact),
      ],
    );
  }
}

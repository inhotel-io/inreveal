import 'dart:convert';

import 'package:immich_mobile/domain/models/store.model.dart';
import 'package:immich_mobile/entities/store.entity.dart';
import 'package:immich_mobile/presentation/widgets/filter_sheet/filter_section_id.dart';

/// Shared JSON codec + Drift key-value persistence for the filter sheet's
/// `Set<FilterSectionId>` preferences (collapsed sections, hidden sections).
/// Unknown / malformed ids are dropped rather than throwing, so a stale or
/// hand-edited store value can never wedge the sheet.
String encodeSectionIds(Set<FilterSectionId> ids) => jsonEncode(ids.map((e) => e.storageId).toList());

Set<FilterSectionId> decodeSectionIds(String json) {
  try {
    final raw = jsonDecode(json);
    if (raw is! List) return {};
    return raw.whereType<String>().map(FilterSectionId.fromStorageId).whereType<FilterSectionId>().toSet();
  } catch (_) {
    return {};
  }
}

Set<FilterSectionId> loadSectionIds(StoreKey<String> key) => decodeSectionIds(Store.get(key, '[]'));

Future<void> saveSectionIds(StoreKey<String> key, Set<FilterSectionId> ids) => Store.put(key, encodeSectionIds(ids));

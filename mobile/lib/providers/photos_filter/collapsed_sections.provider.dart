import 'package:flutter/foundation.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/models/store.model.dart';
import 'package:immich_mobile/presentation/widgets/filter_sheet/filter_section_id.dart';
import 'package:immich_mobile/providers/photos_filter/section_id_set_store.dart';

@visibleForTesting
String encodeCollapsedSections(Set<FilterSectionId> ids) => encodeSectionIds(ids);

@visibleForTesting
Set<FilterSectionId> decodeCollapsedSections(String json) => decodeSectionIds(json);

/// Persistence gateway for the collapsed-section set (injectable for tests).
abstract class FilterSectionPrefs {
  Set<FilterSectionId> loadCollapsed();
  Future<void> saveCollapsed(Set<FilterSectionId> ids);
}

/// Default gateway backed by the Drift key-value [Store] (JSON string).
class StoreFilterSectionPrefs implements FilterSectionPrefs {
  const StoreFilterSectionPrefs();

  @override
  Set<FilterSectionId> loadCollapsed() => loadSectionIds(StoreKey.filterSheetCollapsedSections);

  @override
  Future<void> saveCollapsed(Set<FilterSectionId> ids) => saveSectionIds(StoreKey.filterSheetCollapsedSections, ids);
}

final filterSectionPrefsProvider = Provider<FilterSectionPrefs>((_) => const StoreFilterSectionPrefs());

final collapsedSectionsProvider = NotifierProvider<CollapsedSectionsNotifier, Set<FilterSectionId>>(
  CollapsedSectionsNotifier.new,
);

class CollapsedSectionsNotifier extends Notifier<Set<FilterSectionId>> {
  @override
  Set<FilterSectionId> build() => ref.read(filterSectionPrefsProvider).loadCollapsed();

  bool isCollapsed(FilterSectionId id) => state.contains(id);

  void toggle(FilterSectionId id) {
    final next = Set<FilterSectionId>.from(state);
    if (!next.remove(id)) next.add(id);
    state = next;
    // Fire-and-forget persist; state is source of truth in-memory.
    ref.read(filterSectionPrefsProvider).saveCollapsed(next);
  }
}

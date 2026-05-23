// photosTimelineQueryProvider — overrides `timelineServiceProvider` inside
// `MainTimelinePage`. Empty filter / pre-login → main library service.
// Non-empty + logged-in → search-backed service driven by the paginating
// `photosFilterSearchProvider` notifier. The effective provider composes
// temporal scope through the 500 ms debounced Photos filter before consumers
// watch the result here.

import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/services/timeline.service.dart';
import 'package:immich_mobile/providers/infrastructure/timeline.provider.dart';
import 'package:immich_mobile/providers/photos_filter/photos_filter_search.provider.dart';
import 'package:immich_mobile/providers/photos_filter/timeline_temporal_filter.provider.dart';
import 'package:immich_mobile/providers/user.provider.dart';

final photosTimelineQueryProvider = Provider<TimelineService>((ref) {
  final filter = ref.watch(photosTimelineEffectiveFilterProvider);
  final userId = ref.watch(currentUserProvider.select((u) => u?.id));
  final timelineUsers = ref.watch(timelineUsersProvider).valueOrNull ?? const <String>[];
  final factory = ref.watch(timelineFactoryProvider);

  if (userId == null || filter.isEmpty) {
    final svc = factory.main(timelineUsers, userId ?? '');
    ref.onDispose(svc.dispose);
    return svc;
  }

  final notifier = ref.watch(photosFilterSearchProvider.notifier);
  final svc = factory.fromAssetStream(notifier.getAssets, notifier.count, TimelineOrigin.search);
  ref.onDispose(svc.dispose);
  return svc;
});

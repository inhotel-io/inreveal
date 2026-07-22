import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_hooks/flutter_hooks.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/models/asset/base_asset.model.dart';
import 'package:immich_mobile/domain/models/settings_key.dart';
import 'package:immich_mobile/domain/models/space_album.model.dart';
import 'package:immich_mobile/extensions/build_context_extensions.dart';
import 'package:immich_mobile/extensions/translate_extensions.dart';
import 'package:immich_mobile/pages/library/spaces/collection_sort.dart';
import 'package:immich_mobile/presentation/widgets/common/collection_search_sort_bar.widget.dart';
import 'package:immich_mobile/presentation/widgets/images/thumbnail.widget.dart';
import 'package:immich_mobile/providers/infrastructure/asset.provider.dart';
import 'package:immich_mobile/providers/infrastructure/settings.provider.dart';
import 'package:immich_mobile/providers/infrastructure/space_album.provider.dart';
import 'package:immich_mobile/routing/router.dart';

/// Space Albums list/manage page — Surface 2 of the Phase-2B design.
///
/// Pushed via [SpaceAlbumsRoute(spaceId, canEdit)] (standard slide-right).
///
/// Renders a 2-column grid of cards (cover + name + asset count + Hidden
/// label), with:
///  - Editor-only card ⋮ overflow (Show/Hide in timeline, Unlink) — stub
///    callbacks [onToggle]/[onUnlink] (real mutations land in B6).
///  - Editor-only app-bar "＋ Link" action — stub callback [onLink] (link
///    picker lands in B5).
///  - Centered empty state for an empty list.
///  - A search field + reversible `CollectionSortButton` (persisted via
///    [AppConfig.spaceAlbums] / [SettingsKey.spaceAlbumsSortMode] /
///    [SettingsKey.spaceAlbumsIsReverse]) and a distinct no-match state when
///    a query filters out every linked album.
///
/// Role-gated: affordances only shown when [canEdit] is true.
@RoutePage()
class SpaceAlbumsPage extends HookConsumerWidget {
  final String spaceId;
  final bool canEdit;

  /// Called when the editor taps "Show/Hide in timeline" for an album.
  final void Function(String albumId) onToggle;

  /// Called when the editor taps "Unlink from space" for an album.
  final void Function(String albumId) onUnlink;

  /// Called when the editor taps the "＋ Link" app-bar action.
  final VoidCallback onLink;

  const SpaceAlbumsPage({
    super.key,
    required this.spaceId,
    required this.canEdit,
    required this.onToggle,
    required this.onUnlink,
    required this.onLink,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final albumsAsync = ref.watch(spaceAlbumsProvider(spaceId));
    final sortConfig = ref.watch(appConfigProvider.select((config) => config.spaceAlbums));

    final queryController = useTextEditingController();
    final query = useState('');
    useEffect(() {
      void listener() => query.value = queryController.text;
      queryController.addListener(listener);
      return () => queryController.removeListener(listener);
    }, [queryController]);

    return Scaffold(
      appBar: AppBar(
        title: Text('space_albums_page_title'.t(context: context)),
        centerTitle: false,
        actions: [
          if (canEdit)
            TextButton.icon(
              key: const Key('space-albums-link-action'),
              onPressed: onLink,
              icon: const Icon(Icons.add),
              label: Text('link'.t(context: context)),
            ),
        ],
      ),
      body: albumsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(
          child: Text('space_albums_load_failed'.t(context: context, args: {'error': error.toString()})),
        ),
        data: (albums) {
          if (albums.isEmpty) {
            return _EmptyState(key: const Key('space-albums-empty'), canEdit: canEdit, onLink: onLink);
          }

          final trimmedQuery = query.value.trim();
          final filtered = filterAndSortSpaceAlbums(albums, query.value, sortConfig.sortMode, sortConfig.isReverse);

          return Column(
            children: [
              CollectionSearchSortBar<SpaceAlbumSortMode>(
                searchFieldKey: const Key('space-albums-search-field'),
                clearButtonKey: const Key('space-albums-search-clear'),
                resultCountKey: const Key('space-albums-result-count'),
                hintKey: 'space_albums_search_hint',
                countKey: 'space_albums_result_count',
                searchCountKey: 'space_albums_search_result_count',
                options: SpaceAlbumSortMode.values.map((mode) => (mode: mode, label: mode.label)).toList(),
                controller: queryController,
                hasQuery: query.value.isNotEmpty,
                onClear: queryController.clear,
                resultCount: filtered.length,
                totalCount: albums.length,
                query: trimmedQuery,
                sortMode: sortConfig.sortMode,
                isReverse: sortConfig.isReverse,
                onSortChanged: (mode, isReverse) async {
                  final settings = ref.read(settingsProvider);
                  await settings.write(SettingsKey.spaceAlbumsSortMode, mode);
                  await settings.write(SettingsKey.spaceAlbumsIsReverse, isReverse);
                },
              ),
              Expanded(
                child: filtered.isEmpty
                    ? CollectionNoMatch(
                        key: const Key('space-albums-no-match'),
                        messageKey: 'space_albums_no_match',
                        query: query.value,
                      )
                    : _AlbumGrid(
                        albums: filtered,
                        canEdit: canEdit,
                        onToggle: onToggle,
                        onUnlink: onUnlink,
                        onTap: (albumId) => context.pushRoute(
                          SpaceAlbumDetailRoute(spaceId: spaceId, albumId: albumId, canEdit: canEdit),
                        ),
                      ),
              ),
            ],
          );
        },
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Album grid
// ---------------------------------------------------------------------------

class _AlbumGrid extends StatelessWidget {
  const _AlbumGrid({
    required this.albums,
    required this.canEdit,
    required this.onToggle,
    required this.onUnlink,
    required this.onTap,
  });

  final List<SpaceAlbum> albums;
  final bool canEdit;
  final void Function(String albumId) onToggle;
  final void Function(String albumId) onUnlink;
  final void Function(String albumId) onTap;

  @override
  Widget build(BuildContext context) {
    return GridView.builder(
      padding: const EdgeInsets.all(16),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        crossAxisSpacing: 12,
        mainAxisSpacing: 16,
        childAspectRatio: 0.75,
      ),
      itemCount: albums.length,
      itemBuilder: (context, index) {
        final album = albums[index];
        return _AlbumCard(
          key: Key('space-album-card-${album.id}'),
          album: album,
          canEdit: canEdit,
          onToggle: onToggle,
          onUnlink: onUnlink,
          onTap: onTap,
        );
      },
    );
  }
}

// ---------------------------------------------------------------------------
// Album card
// ---------------------------------------------------------------------------

class _AlbumCard extends ConsumerWidget {
  const _AlbumCard({
    super.key,
    required this.album,
    required this.canEdit,
    required this.onToggle,
    required this.onUnlink,
    required this.onTap,
  });

  final SpaceAlbum album;
  final bool canEdit;
  final void Function(String albumId) onToggle;
  final void Function(String albumId) onUnlink;
  final void Function(String albumId) onTap;

  Widget _buildFallback(ColorScheme cs) {
    return Container(
      decoration: BoxDecoration(
        color: cs.surfaceContainerHighest,
        borderRadius: const BorderRadius.all(Radius.circular(16)),
        border: Border.all(color: cs.outline.withValues(alpha: 0.3), width: 1),
      ),
      child: const Center(child: Icon(Icons.photo_album_outlined, size: 40, color: Colors.grey)),
    );
  }

  Widget _buildCoverArt(BuildContext context, WidgetRef ref, ColorScheme cs) {
    final thumbnailId = album.thumbnailAssetId;
    if (thumbnailId == null) return _buildFallback(cs);
    return FutureBuilder<RemoteAsset?>(
      future: ref.read(assetServiceProvider).getRemoteAsset(thumbnailId),
      builder: (context, snapshot) {
        if (snapshot.hasData && snapshot.data != null) {
          return ClipRRect(
            borderRadius: const BorderRadius.all(Radius.circular(16)),
            child: Thumbnail.remote(remoteId: thumbnailId, thumbhash: snapshot.data!.thumbHash ?? ''),
          );
        }
        return _buildFallback(cs);
      },
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cs = context.colorScheme;
    final isOffTimeline = !album.showInTimeline;

    return GestureDetector(
      // The cover art is an image (Thumbnail) / placeholder that does not
      // register itself in hit-testing, so the default deferToChild behavior
      // makes a tap on the cover — where users actually tap — a no-op (only the
      // name Text was hittable). Opaque makes the whole card tappable.
      behavior: HitTestBehavior.opaque,
      onTap: () => onTap(album.id),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Cover
          Expanded(
            child: Stack(
              children: [
                Opacity(opacity: isOffTimeline ? 0.6 : 1.0, child: _buildCoverArt(context, ref, cs)),
                // Off-timeline badge
                if (isOffTimeline)
                  Positioned.fill(
                    child: Center(
                      child: Icon(Icons.visibility_off, size: 24, color: cs.onSurface.withValues(alpha: 0.7)),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 4),
          // Name + overflow row
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      album.name,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: context.textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w500),
                    ),
                    Row(
                      children: [
                        Text(
                          'space_album_photo_count'.t(context: context, args: {'count': album.assetCount.toString()}),
                          style: context.textTheme.bodySmall?.copyWith(color: cs.onSurfaceVariant),
                        ),
                        if (isOffTimeline)
                          Text(
                            '· ${'space_albums_hidden'.t(context: context)}',
                            style: context.textTheme.bodySmall?.copyWith(color: cs.onSurfaceVariant),
                          ),
                      ],
                    ),
                  ],
                ),
              ),
              if (canEdit)
                SizedBox(
                  width: 24,
                  height: 24,
                  child: PopupMenuButton<_CardAction>(
                    key: Key('space-album-card-menu-${album.id}'),
                    padding: EdgeInsets.zero,
                    iconSize: 18,
                    onSelected: (action) {
                      switch (action) {
                        case _CardAction.toggle:
                          onToggle(album.id);
                        case _CardAction.unlink:
                          onUnlink(album.id);
                      }
                    },
                    itemBuilder: (ctx) => [
                      PopupMenuItem(
                        value: _CardAction.toggle,
                        child: Text(
                          album.showInTimeline
                              ? 'spaces_hide_from_timeline'.t(context: ctx)
                              : 'spaces_linked_albums_show_in_timeline'.t(context: ctx),
                        ),
                      ),
                      PopupMenuItem(
                        value: _CardAction.unlink,
                        child: Text('space_album_unlink_from_space'.t(context: ctx)),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

enum _CardAction { toggle, unlink }

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

class _EmptyState extends StatelessWidget {
  const _EmptyState({super.key, required this.canEdit, required this.onLink});

  final bool canEdit;
  final VoidCallback onLink;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.photo_album_outlined,
            size: 64,
            color: context.colorScheme.onSurfaceVariant.withValues(alpha: 0.5),
          ),
          const SizedBox(height: 16),
          Text(
            'space_albums_empty'.t(context: context),
            style: context.textTheme.titleMedium?.copyWith(color: context.colorScheme.onSurfaceVariant),
          ),
          if (canEdit) ...[
            const SizedBox(height: 12),
            FilledButton.icon(
              onPressed: onLink,
              icon: const Icon(Icons.add),
              label: Text('space_albums_empty_editor_cta'.t(context: context)),
            ),
          ],
        ],
      ),
    );
  }
}

<script lang="ts">
  import { assetViewerManager } from '$lib/managers/asset-viewer-manager.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import MapModal from '$lib/modals/MapModal.svelte';
  import type { FilterState } from '$lib/components/filter-panel/filter-panel';
  import { buildAlbumMapMarkerOptions } from '$lib/utils/map-filter-options';
  import { handleError } from '$lib/utils/handle-error';
  import { navigate } from '$lib/utils/navigation';
  import {
    getAlbumMapMarkers,
    getFilteredMapMarkers,
    type AlbumResponseDto,
    type MapMarkerResponseDto,
  } from '@immich/sdk';
  import { IconButton, modalManager } from '@immich/ui';
  import { mdiMapOutline } from '@mdi/js';
  import { onDestroy } from 'svelte';
  import { t } from 'svelte-i18n';

  interface Props {
    album: AlbumResponseDto;
    /**
     * The album's LIVE filter state. Absent on the shared-link album view (AlbumViewer.svelte),
     * which must keep using the album endpoint: /gallery/map/markers takes no shared-link key, and
     * a shared link exposes no filter affordances anyway (E2).
     */
    filters?: FilterState;
  }

  let { album, filters }: Props = $props();
  let cancelable: AbortController;
  let requestToken = 0;

  let returnToMap = $state(false);
  let mapMarkers: MapMarkerResponseDto[] = $state([]);

  onDestroy(() => {
    cancelable?.abort();
    assetViewerManager.showAssetViewer(false);
  });

  $effect(() => {
    if (assetViewerManager.isViewing || !returnToMap) {
      return;
    }

    returnToMap = false;
    void onClick();
  });

  $effect(() => {
    // Explicit dependency: `filters` is undefined on the shared-link path, where the rest of the
    // reads below would not touch it at all.
    void filters;
    void loadMapMarkers();
  });

  /**
   * Markers now reload on every filter change (see the $effect above), which means each new load
   * ABORTS the one in flight — and an aborted fetch REJECTS. Under the old onMount-only load that
   * could never happen, so the catch fed straight into handleError; keep that and the user gets an
   * error toast every time they touch a filter. Two guards:
   *  - `controller.signal.aborted` → this request was superseded on purpose; say nothing.
   *  - `token !== requestToken`    → a newer request already answered; do not clobber its markers
   *                                  with this stale response (an abort does not un-send a request
   *                                  that is already coming back).
   */
  const loadMapMarkers = async () => {
    cancelable?.abort();
    const controller = new AbortController();
    cancelable = controller;
    const token = ++requestToken;

    try {
      const markers =
        filters && !authManager.isSharedLink
          ? await getFilteredMapMarkers(buildAlbumMapMarkerOptions(album.id, filters), { signal: controller.signal })
          : await getAlbumMapMarkers({ ...authManager.params, id: album.id }, { signal: controller.signal });

      if (token !== requestToken) {
        return;
      }
      mapMarkers = markers;
    } catch (error) {
      if (controller.signal.aborted || token !== requestToken) {
        return;
      }
      handleError(error, $t('errors.something_went_wrong'));
    }
  };

  const onClick = async () => {
    const assetIds = await modalManager.show(MapModal, { mapMarkers });
    if (assetIds) {
      await navigate({ targetRoute: 'current', assetId: assetIds[0] });
      returnToMap = true;
    } else {
      returnToMap = false;
    }
  };
</script>

<IconButton
  variant="ghost"
  shape="round"
  color="secondary"
  icon={mdiMapOutline}
  onclick={onClick}
  aria-label={$t('map')}
/>

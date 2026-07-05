<script lang="ts">
  import ButtonContextMenu from '$lib/components/shared-components/context-menu/ButtonContextMenu.svelte';
  import MenuOption from '$lib/components/shared-components/context-menu/MenuOption.svelte';
  import { locale } from '$lib/stores/preferences.store';
  import { dateFormats } from '$lib/constants';
  import { type SharedSpaceLinkedAlbumDto } from '@immich/sdk';
  import { mdiDotsVertical } from '@mdi/js';
  import { t } from 'svelte-i18n';

  interface Props {
    spaceId: string;
    albums: SharedSpaceLinkedAlbumDto[];
    canManage: boolean;
    onUnlink?: (album: SharedSpaceLinkedAlbumDto) => void;
    onToggleTimeline?: (album: SharedSpaceLinkedAlbumDto) => void;
  }

  let { spaceId, albums, canManage, onUnlink, onToggleTimeline }: Props = $props();

  const dateLocaleString = (dateString: string) => {
    return new Date(dateString).toLocaleDateString($locale, dateFormats.album);
  };
</script>

<table class="w-full text-start">
  <thead>
    <tr
      class="flex w-full place-items-center border-3 border-transparent p-2 text-center md:px-5 md:py-2"
    >
      <th class="text-md w-8/12 text-start sm:w-4/12 md:w-4/12 xl:w-[30%] 2xl:w-[40%]">{$t('album_name')}</th>
      <th class="text-md text-center sm:w-2/12 md:w-2/12 xl:w-[15%] 2xl:w-[12%]">{$t('items_count', { values: { count: 0 } }).replace(/\d+\s/, '')}</th>
      <th class="text-md hidden text-center sm:block xl:w-[15%] 2xl:w-[12%]">{$t('sort_modified')}</th>
      <th class="text-md hidden text-center sm:block xl:w-[15%] 2xl:w-[12%]">{$t('date_created')}</th>
      {#if canManage}
        <th class="text-md w-1/12 text-end"></th>
      {/if}
    </tr>
  </thead>
  <tbody>
    {#each albums as album (album.id)}
      <tr
        class="flex w-full place-items-center border-3 border-transparent p-2 text-center odd:bg-subtle/80 even:bg-subtle/20 hover:border-immich-primary/75 md:px-5 md:py-2 odd:dark:bg-immich-dark-gray/75 even:dark:bg-immich-dark-gray/50 dark:hover:border-immich-dark-primary/75"
      >
        <td class="text-md w-8/12 items-center text-start text-ellipsis sm:w-4/12 md:w-4/12 xl:w-[30%] 2xl:w-[40%]">
          <a
            href="/spaces/{spaceId}/albums/{album.id}"
            data-testid="space-album-row-{album.id}"
            class="hover:text-immich-primary"
          >
            {album.albumName}
          </a>
        </td>
        <td class="text-md text-center text-ellipsis sm:w-2/12 md:w-2/12 xl:w-[15%] 2xl:w-[12%]">
          {$t('items_count', { values: { count: album.assetCount } })}
        </td>
        <td class="text-md hidden w-3/12 text-center text-ellipsis sm:block xl:w-[15%] 2xl:w-[12%]">
          {dateLocaleString(album.updatedAt)}
        </td>
        <td class="text-md hidden w-3/12 text-center text-ellipsis sm:block xl:w-[15%] 2xl:w-[12%]">
          {dateLocaleString(album.createdAt)}
        </td>
        {#if canManage}
          <td class="text-md w-1/12 text-end" data-testid="space-album-row-menu-{album.id}">
            <ButtonContextMenu
              icon={mdiDotsVertical}
              title={$t('more')}
              color="secondary"
              variant="ghost"
              size="medium"
              align="top-right"
              direction="left"
            >
              <MenuOption
                text={album.showInTimeline
                  ? $t('spaces_hide_from_timeline')
                  : $t('spaces_linked_albums_show_in_timeline')}
                onClick={() => onToggleTimeline?.(album)}
              />
              <MenuOption text={$t('spaces_linked_albums_unlink')} onClick={() => onUnlink?.(album)} />
            </ButtonContextMenu>
          </td>
        {/if}
      </tr>
    {/each}
  </tbody>
</table>

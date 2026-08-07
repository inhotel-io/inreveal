<script lang="ts">
  import { Button, IconButton } from '@immich/ui';
  import { mdiClose } from '@mdi/js';
  import { t } from 'svelte-i18n';

  interface Props {
    kind: 'album' | 'folder';
    count: number;
    /** Album kind only — decides whether the timeline button reads "Add" or "Remove". */
    allInTimeline?: boolean;
    /** Space-Editor actions. Defaults true so existing folder/album call sites are unchanged. */
    canManage?: boolean;
    /** True only when EVERY selected album is owned by the current user. */
    canDelete?: boolean;
    onClear: () => void;
    onUnlink?: () => void;
    onMove?: () => void;
    onDelete?: () => void;
    /** Album kind only — kept separate from the folder branch's `onDelete` so the two destructive
     * actions can never be crossed. */
    onDeleteAlbums?: () => void;
    onToggleTimeline?: (showInTimeline: boolean) => void;
  }

  let {
    kind,
    count,
    allInTimeline = false,
    canManage = true,
    canDelete = false,
    onClear,
    onUnlink,
    onMove,
    onDelete,
    onDeleteAlbums,
    onToggleTimeline,
  }: Props = $props();
</script>

<div
  data-testid="space-album-select-bar"
  class="fixed inset-x-0 bottom-4 z-40 mx-auto flex w-fit max-w-[95vw] flex-wrap items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-2 shadow-lg dark:border-gray-800 dark:bg-immich-dark-gray"
>
  <IconButton
    icon={mdiClose}
    shape="round"
    color="secondary"
    variant="ghost"
    aria-label={$t('close')}
    onclick={onClear}
  />
  <span class="px-1 font-medium">{$t('space_album_selected_count', { values: { count } })}</span>

  {#if kind === 'album'}
    {#if canManage}
      <Button variant="ghost" onclick={onUnlink}>{$t('space_album_unlink_from_space')}</Button>
      <Button variant="ghost" onclick={onMove}>{$t('space_album_folder_move')}</Button>
      <Button variant="ghost" onclick={() => onToggleTimeline?.(!allInTimeline)}>
        {$t(allInTimeline ? 'space_album_bulk_remove_from_timeline' : 'space_album_bulk_add_to_timeline')}
      </Button>
    {/if}
    {#if canDelete}
      <Button variant="ghost" color="danger" onclick={onDeleteAlbums}>{$t('space_album_delete')}</Button>
    {/if}
  {:else if kind === 'folder'}
    <Button variant="ghost" onclick={onMove}>{$t('space_album_folder_move')}</Button>
    <Button variant="ghost" color="danger" onclick={onDelete}>{$t('space_album_folder_delete')}</Button>
  {/if}
</div>

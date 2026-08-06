<script lang="ts">
  import { buildFolderTree, isDescendant, type FolderNode } from '$lib/utils/space-album-folders';
  import type { SharedSpaceAlbumFolderDto } from '@immich/sdk';
  import { FormModal, Icon } from '@immich/ui';
  import { mdiFolder } from '@mdi/js';
  import { t } from 'svelte-i18n';

  interface Props {
    folders: SharedSpaceAlbumFolderDto[];
    /** When moving one or more FOLDERS, none of their own subtrees is a legal destination.
     * Empty when moving an album (or albums) — there is no folder-subtree concept to exclude
     * there. A bulk folder move passes every folder in the batch (fix round 1, Minor #2): with
     * only the FIRST one excluded, moving a single selected folder onto itself was reachable
     * through "Move to folder…" (the kebab's single-item picker already excluded the one folder
     * being moved; the bulk picker excluded nothing) and produced a 100% server-side failure with
     * no client-side explanation. */
    excludeFolderIds: string[];
    currentFolderId: string | null;
    onClose: (result?: { folderId: string | null }) => void;
  }

  let { folders, excludeFolderIds, currentFolderId, onClose }: Props = $props();

  let selected = $state<string | null>(currentFolderId);

  const tree = $derived(buildFolderTree(folders));

  // Disabling every moved folder and its descendants means an illegal choice is never
  // selectable — the user cannot produce a request the server would have to reject.
  const isDisabled = (id: string) =>
    excludeFolderIds.some((excludeId) => id === excludeId || isDescendant(folders, id, excludeId));

  const flatten = (nodes: FolderNode[], depth = 0): { folder: SharedSpaceAlbumFolderDto; depth: number }[] =>
    nodes.flatMap((node) => [{ folder: node.folder, depth }, ...flatten(node.children, depth + 1)]);

  const rows = $derived(flatten(tree));
</script>

<FormModal
  title={$t('space_album_folder_move')}
  onClose={() => onClose()}
  onSubmit={() => onClose({ folderId: selected })}
  submitText={$t('space_album_folder_move_here')}
>
  <div class="flex max-h-80 flex-col overflow-y-auto">
    <button
      type="button"
      class="flex items-center gap-2 rounded-md p-2 text-start hover:bg-gray-100 disabled:opacity-40 dark:hover:bg-gray-800"
      class:font-semibold={selected === null}
      data-testid="folder-option-root"
      onclick={() => (selected = null)}
    >
      {$t('space_album_folder_root')}
    </button>

    {#each rows as row (row.folder.id)}
      <button
        type="button"
        class="flex items-center gap-2 rounded-md p-2 text-start hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-gray-800"
        class:font-semibold={selected === row.folder.id}
        style="padding-inline-start: {row.depth * 1.25 + 0.5}rem"
        disabled={isDisabled(row.folder.id)}
        data-testid="folder-option-{row.folder.id}"
        onclick={() => (selected = row.folder.id)}
      >
        <Icon icon={mdiFolder} size="18" />
        {row.folder.name}
      </button>
    {/each}
  </div>
</FormModal>

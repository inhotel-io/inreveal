import type { SharedSpaceAlbumFolderDto, SharedSpaceLinkedAlbumDto } from '@immich/sdk';
import { isDescendant } from '$lib/utils/space-album-folders';

/**
 * A gallery-specific MIME type, not text/plain. DragAndDropUploadOverlay listens for file
 * drags; a generic payload would risk being picked up by other code that keys off a common type.
 */
export const SPACE_ITEM_MIME = 'application/x-gallery-space-item';

export type DragPayload = { kind: 'album' | 'folder'; ids: string[] };

/**
 * Composes a drag's payload with the current selection (design §5.3 / spec S-22 / S-23): dragging
 * a card that is part of the active same-kind selection carries every selected id, so a
 * multi-select drag moves the whole batch in one drop. Dragging a card that is NOT part of the
 * current selection (or when nothing is selected) carries only itself, exactly as before, and
 * leaves the selection untouched — the caller never has to special-case "no selection".
 */
export const buildDragPayload = (
  item: { kind: 'album' | 'folder'; id: string },
  selectedIds: string[],
  selectedKind: 'album' | 'folder' | 'none',
): DragPayload => {
  if (selectedKind === item.kind && selectedIds.includes(item.id)) {
    return { kind: item.kind, ids: [...selectedIds] };
  }
  return { kind: item.kind, ids: [item.id] };
};

export const writeDragPayload = (dataTransfer: DataTransfer, payload: DragPayload): void => {
  dataTransfer.setData(SPACE_ITEM_MIME, JSON.stringify(payload));
};

export const readDragPayload = (dataTransfer: DataTransfer): DragPayload | null => {
  const raw = dataTransfer.getData(SPACE_ITEM_MIME);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as DragPayload;
    return Array.isArray(parsed?.ids) && parsed.ids.length > 0 && (parsed.kind === 'album' || parsed.kind === 'folder')
      ? parsed
      : null;
  } catch {
    // A foreign drag that happens to claim our MIME type must not throw mid-drop.
    return null;
  }
};

/**
 * `dragenter`/`dragover` see the DataTransfer in the Drag and Drop spec's "protected mode": real
 * browsers return an empty string from getData() there — only `.types` is readable before the
 * drop itself. That makes readDragPayload unusable inside an `ondragover` handler in production,
 * even though a hand-rolled DataTransfer in a unit test won't reproduce that restriction.
 *
 * This module-level slot is the workaround: the dragged element records the payload here at
 * `ondragstart` (alongside writeDragPayload) and clears it at `ondragend`. Folder cards and
 * breadcrumb crumbs read it back during dragover to run the real canDrop check and decide
 * whether to preventDefault() — which is also what is needed for `drop` to fire at all.
 * `ondrop` itself still reads the authoritative payload off the DataTransfer via
 * readDragPayload, since read access there is unrestricted.
 */
let activeDragPayload: DragPayload | null = null;

export const setActiveDragPayload = (payload: DragPayload | null): void => {
  activeDragPayload = payload;
};

export const getActiveDragPayload = (): DragPayload | null => activeDragPayload;

/**
 * Exported for callers that need to know WHICH ids in a multi-id payload are actually legal
 * (Minor #3 / fix round 1) — `canDrop` itself only answers "is at least one id legal", which is
 * the right question for deciding whether to preventDefault() a drop, but the wrong one for
 * deciding what to actually send once the drop happens.
 */
export const canDropOne = (
  folders: SharedSpaceAlbumFolderDto[],
  albums: SharedSpaceLinkedAlbumDto[],
  kind: 'album' | 'folder',
  id: string,
  targetFolderId: string | null,
): boolean => {
  if (kind === 'album') {
    const album = albums.find((a) => a.id === id);
    return !!album && (album.folderId ?? null) !== targetFolderId;
  }

  const folder = folders.find((f) => f.id === id);
  if (!folder) {
    return false;
  }
  if (folder.id === targetFolderId) {
    return false;
  }
  if ((folder.parentId ?? null) === targetFolderId) {
    return false;
  }
  return targetFolderId === null || !isDescendant(folders, targetFolderId, folder.id);
};

/**
 * Decided entirely client-side, so an illegal drop fires no request at all — the user never
 * sees a spinner followed by an error the client could have predicted.
 *
 * A multi-id payload (a selection drag, S-22) is accepted as soon as AT LEAST ONE id would
 * legally move — matching a single-item payload exactly (its one-element array either is or
 * isn't legal) while letting a mixed batch (some already at the target, some not) still drop.
 * Items that individually wouldn't move are not filtered out here: the bulk endpoint tolerates
 * exactly this (partial failure / no-op success per item), so there is nothing client-side left
 * to predict-and-block for those.
 */
export const canDrop = (
  folders: SharedSpaceAlbumFolderDto[],
  albums: SharedSpaceLinkedAlbumDto[],
  payload: DragPayload,
  targetFolderId: string | null,
): boolean => {
  if (targetFolderId !== null && folders.every((f) => f.id !== targetFolderId)) {
    return false;
  }

  return payload.ids.some((id) => canDropOne(folders, albums, payload.kind, id, targetFolderId));
};

import type { SharedSpaceAlbumFolderDto, SharedSpaceLinkedAlbumDto } from '@immich/sdk';
import {
  buildDragPayload,
  canDrop,
  canDropOne,
  getActiveDragPayload,
  readDragPayload,
  setActiveDragPayload,
  SPACE_ITEM_MIME,
  writeDragPayload,
} from '$lib/utils/space-album-folder-dnd';

const folder = (id: string, name: string, parentId: string | null = null) =>
  ({ id, spaceId: 's', parentId, name, createdById: null, createdAt: '', updatedAt: '' }) as SharedSpaceAlbumFolderDto;
const album = (id: string, folderId: string | null = null) =>
  ({ id, albumName: id, folderId }) as SharedSpaceLinkedAlbumDto;

const folders = [folder('trips', 'Trips'), folder('y2026', '2026', 'trips'), folder('family', 'Family')];
const albums = [album('a1', 'trips'), album('a2')];

const makeDataTransfer = () => {
  const store = new Map<string, string>();
  return {
    setData: (type: string, value: string) => store.set(type, value),
    getData: (type: string) => store.get(type) ?? '',
    types: [...store.keys()],
  } as unknown as DataTransfer;
};

describe('space-album-folder-dnd', () => {
  // The custom MIME type is load-bearing: DragAndDropUploadOverlay watches for FILE drags,
  // and a generic payload would light the upload overlay up mid-drag.
  it('round-trips a payload under the gallery-specific MIME type', () => {
    const dt = makeDataTransfer();

    writeDragPayload(dt, { kind: 'album', ids: ['a1'] });

    expect(dt.getData(SPACE_ITEM_MIME)).toContain('a1');
    expect(readDragPayload(dt)).toEqual({ kind: 'album', ids: ['a1'] });
  });

  // The actually load-bearing half of the previous test: writeDragPayload must NOT also write
  // under a generic type like text/plain. Nothing in the app currently reads text/plain off a
  // drag, but that emptiness is what keeps this payload invisible to any code that keys off it —
  // asserting only the positive (SPACE_ITEM_MIME round-trips) would miss a regression that wrote
  // to both.
  it('does not also write the payload under a generic MIME type', () => {
    const dt = makeDataTransfer();

    writeDragPayload(dt, { kind: 'album', ids: ['a1'] });

    expect(dt.getData('text/plain')).toBe('');
  });

  it('returns null for a drag carrying no gallery payload', () => {
    expect(readDragPayload(makeDataTransfer())).toBeNull();
  });

  it('returns null rather than throwing on a malformed payload', () => {
    const dt = makeDataTransfer();
    dt.setData(SPACE_ITEM_MIME, 'not json');

    expect(readDragPayload(dt)).toBeNull();
  });

  it('returns null for a payload with an empty ids array', () => {
    const dt = makeDataTransfer();
    dt.setData(SPACE_ITEM_MIME, JSON.stringify({ kind: 'album', ids: [] }));

    expect(readDragPayload(dt)).toBeNull();
  });

  it('round-trips a multi-id payload', () => {
    const dt = makeDataTransfer();

    writeDragPayload(dt, { kind: 'album', ids: ['a1', 'a2', 'a3'] });

    expect(readDragPayload(dt)).toEqual({ kind: 'album', ids: ['a1', 'a2', 'a3'] });
  });

  describe('buildDragPayload', () => {
    // S-22
    it('carries the whole selection when the dragged card is part of it', () => {
      const payload = buildDragPayload({ kind: 'album', id: 'b' }, ['a', 'b', 'c'], 'album');
      expect(payload.kind).toBe('album');
      expect(payload.ids.slice().sort()).toEqual(['a', 'b', 'c']);
    });

    // S-23
    it('carries only the dragged card when it is not part of the selection', () => {
      const payload = buildDragPayload({ kind: 'album', id: 'd' }, ['a', 'b'], 'album');
      expect(payload).toEqual({ kind: 'album', ids: ['d'] });
    });

    it('carries only the dragged card when nothing is selected', () => {
      const payload = buildDragPayload({ kind: 'album', id: 'a' }, [], 'none');
      expect(payload).toEqual({ kind: 'album', ids: ['a'] });
    });

    // The never-mixed rule (§4.2): a folder selection can never leak into an album drag's payload,
    // even if the dragged item's id happens to collide with a selected id of the OTHER kind.
    it('does not carry the selection across kinds even on an id collision', () => {
      const payload = buildDragPayload({ kind: 'album', id: 'x' }, ['x', 'y'], 'folder');
      expect(payload).toEqual({ kind: 'album', ids: ['x'] });
    });
  });

  // W-13: a folder cannot be dropped into itself or its own subtree.
  it.each([
    ['itself', 'trips', 'trips'],
    ['its descendant', 'trips', 'y2026'],
  ])('W-13: refuses dropping a folder onto %s', (_label, dragged, target) => {
    expect(canDrop(folders, albums, { kind: 'folder', ids: [dragged] }, target)).toBe(false);
  });

  it('W-13: allows dropping a folder onto an unrelated folder or the root', () => {
    expect(canDrop(folders, albums, { kind: 'folder', ids: ['trips'] }, 'family')).toBe(true);
    expect(canDrop(folders, albums, { kind: 'folder', ids: ['y2026'] }, null)).toBe(true);
  });

  // W-14: dropping onto the parent it already has is a no-op, so no request should fire.
  it('W-14: refuses dropping an item onto the folder it already sits in', () => {
    expect(canDrop(folders, albums, { kind: 'album', ids: ['a1'] }, 'trips')).toBe(false);
    expect(canDrop(folders, albums, { kind: 'album', ids: ['a2'] }, null)).toBe(false);
    expect(canDrop(folders, albums, { kind: 'folder', ids: ['y2026'] }, 'trips')).toBe(false);
  });

  it('allows dropping an album into a different folder', () => {
    expect(canDrop(folders, albums, { kind: 'album', ids: ['a1'] }, 'family')).toBe(true);
    expect(canDrop(folders, albums, { kind: 'album', ids: ['a1'] }, null)).toBe(true);
  });

  it('refuses an unknown item or an unknown target', () => {
    expect(canDrop(folders, albums, { kind: 'album', ids: ['ghost'] }, 'trips')).toBe(false);
    expect(canDrop(folders, albums, { kind: 'folder', ids: ['trips'] }, 'ghost')).toBe(false);
  });

  // Minor #3 (fix round 1): canDropOne is now exported so +page.svelte can filter a multi-id
  // payload down to exactly the legal ids before dispatch — canDrop's own `.some()` is built
  // from this same predicate, so these cases mirror canDrop's single-item cases directly.
  describe('canDropOne', () => {
    it('is true for an album that would actually move', () => {
      expect(canDropOne(folders, albums, 'album', 'a1', 'family')).toBe(true);
    });

    it('is false for an album already at the target', () => {
      expect(canDropOne(folders, albums, 'album', 'a1', 'trips')).toBe(false);
    });

    it('is false for a folder dropped onto itself', () => {
      expect(canDropOne(folders, albums, 'folder', 'trips', 'trips')).toBe(false);
    });

    it('is true for a folder that would actually move', () => {
      expect(canDropOne(folders, albums, 'folder', 'trips', 'family')).toBe(true);
    });

    it('is false for an unknown id', () => {
      expect(canDropOne(folders, albums, 'album', 'ghost', 'trips')).toBe(false);
    });
  });

  describe('multi-id payloads (S-22)', () => {
    // a1 already sits in "trips" (a no-op there) but a2 does not — the batch as a whole is still
    // a legal drop, because a2 would actually move.
    it('accepts a batch where at least one id would legally move', () => {
      expect(canDrop(folders, albums, { kind: 'album', ids: ['a1', 'a2'] }, 'trips')).toBe(true);
    });

    // Neither album would actually move: a1 is already in "trips", and "ghost" does not exist.
    it('refuses a batch where nothing would legally move', () => {
      expect(canDrop(folders, albums, { kind: 'album', ids: ['a1', 'ghost'] }, 'trips')).toBe(false);
    });

    // "trips" itself can't move into its own descendant "y2026", but "family" can — the batch is
    // still accepted, and the illegal member is left for the bulk endpoint's own per-item
    // validation to report as a partial failure.
    it('accepts a folder batch where at least one folder would legally move', () => {
      expect(canDrop(folders, albums, { kind: 'folder', ids: ['trips', 'family'] }, 'y2026')).toBe(true);
    });
  });

  // dragenter/dragover see the DataTransfer in the spec's "protected mode": real browsers
  // return '' from getData() there, so readDragPayload cannot be trusted inside an ondragover
  // handler. This module-level slot is the side channel components use instead — set at
  // dragstart, read during dragover, cleared at dragend. Reset between tests: it is bare module
  // state and this codebase's vitest config has no clearMocks/restoreMocks to do it for us.
  describe('active drag payload', () => {
    afterEach(() => {
      setActiveDragPayload(null);
    });

    it('is null until a drag sets it', () => {
      expect(getActiveDragPayload()).toBeNull();
    });

    it('returns whatever was last set', () => {
      setActiveDragPayload({ kind: 'folder', ids: ['trips'] });

      expect(getActiveDragPayload()).toEqual({ kind: 'folder', ids: ['trips'] });
    });

    it('clears back to null', () => {
      setActiveDragPayload({ kind: 'album', ids: ['a1'] });
      setActiveDragPayload(null);

      expect(getActiveDragPayload()).toBeNull();
    });
  });
});

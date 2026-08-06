import { describe, expect, it } from 'vitest';
import { SpaceAlbumMultiSelectManager } from '$lib/managers/space-album-multi-select-manager.svelte';

const order = ['a', 'b', 'c', 'd', 'e'];

describe('SpaceAlbumMultiSelectManager', () => {
  it('starts empty and inactive', () => {
    const m = new SpaceAlbumMultiSelectManager();
    expect(m.selectionActive).toBe(false);
    expect(m.kind).toBe('none');
  });

  it('toggles an album on and off', () => {
    const m = new SpaceAlbumMultiSelectManager();
    m.toggle('album', 'b', order);
    expect(m.ids).toEqual(['b']);
    m.toggle('album', 'b', order);
    expect(m.selectionActive).toBe(false);
  });

  // S-4
  it('selects an inclusive range from the anchor', () => {
    const m = new SpaceAlbumMultiSelectManager();
    m.toggle('album', 'a', order);
    m.selectRange('album', 'd', order);
    expect(m.ids.sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  // E-8
  it('selects a backwards range in visual order', () => {
    const m = new SpaceAlbumMultiSelectManager();
    m.toggle('album', 'd', order);
    m.selectRange('album', 'b', order);
    expect(m.ids.sort()).toEqual(['b', 'c', 'd']);
  });

  // E-7
  it('treats a range with no anchor as a plain selection', () => {
    const m = new SpaceAlbumMultiSelectManager();
    m.selectRange('album', 'c', order);
    expect(m.ids).toEqual(['c']);
  });

  // S-7 — the ordered list excludes collapsed items, so a range cannot pass through them.
  // Positive control: the visible items ARE included, so this cannot pass vacuously.
  it('cannot range through items missing from the ordered list', () => {
    const m = new SpaceAlbumMultiSelectManager();
    const visible = ['a', 'b', 'e'];
    m.toggle('album', 'a', visible);
    m.selectRange('album', 'e', visible);
    expect(m.ids.sort()).toEqual(['a', 'b', 'e']);
    expect(m.ids).not.toContain('c');
    expect(m.ids).not.toContain('d');
  });

  // S-5
  it('previews a range without committing it', () => {
    const m = new SpaceAlbumMultiSelectManager();
    m.toggle('album', 'a', order);
    m.previewRange('album', 'c', order);
    expect(m.candidates.sort()).toEqual(['b', 'c']);
    expect(m.ids).toEqual(['a']);
  });

  // S-11 — with a positive control that the album selection was non-empty first.
  it('replaces an album selection when a folder is selected', () => {
    const m = new SpaceAlbumMultiSelectManager();
    m.toggle('album', 'a', order);
    m.toggle('album', 'b', order);
    expect(m.ids).toHaveLength(2);
    expect(m.kind).toBe('album');

    m.toggle('folder', 'f1', ['f1', 'f2']);
    expect(m.kind).toBe('folder');
    expect(m.ids).toEqual(['f1']);
  });

  // S-12
  it('replaces a folder selection when an album is selected', () => {
    const m = new SpaceAlbumMultiSelectManager();
    m.toggle('folder', 'f1', ['f1']);
    expect(m.ids).toHaveLength(1);
    m.toggle('album', 'a', order);
    expect(m.kind).toBe('album');
    expect(m.ids).toEqual(['a']);
  });

  // S-8
  it('clears everything', () => {
    const m = new SpaceAlbumMultiSelectManager();
    m.toggle('album', 'a', order);
    m.previewRange('album', 'c', order);
    m.clear();
    expect(m.selectionActive).toBe(false);
    expect(m.candidates).toEqual([]);
  });

  // E-5
  it('drops ids that no longer exist when reconciled', () => {
    const m = new SpaceAlbumMultiSelectManager();
    m.toggle('album', 'a', order);
    m.toggle('album', 'b', order);
    m.reconcile(['b']);
    expect(m.ids).toEqual(['b']);
  });
});

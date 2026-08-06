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
    // m-3: an empty selection must also reset kind, not just selectionActive.
    expect(m.kind).toBe('none');
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

  // I-1 (fix round 1) — spec E-7 says a no-anchor range "selects that one item and sets it as
  // the anchor". Without that, a Shift-click as the FIRST interaction leaves the anchor null
  // forever: the next previewRange yields no candidates, and the next selectRange only picks up
  // the two endpoints, silently skipping everything between them.
  it('sets the anchor on a first-interaction range so a later preview and range both work', () => {
    const m = new SpaceAlbumMultiSelectManager();
    m.selectRange('album', 'b', order);
    expect(m.ids).toEqual(['b']);

    m.previewRange('album', 'd', order);
    expect(m.candidates.sort()).toEqual(['c', 'd']);

    m.selectRange('album', 'd', order);
    expect(m.ids.sort()).toEqual(['b', 'c', 'd']);
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

  // I-2 — has() drives Task 11's per-card selected state and is the never-mixed defence for
  // reads: it must check BOTH kind and id membership, not just id membership.
  it('has() checks both kind and id membership', () => {
    const m = new SpaceAlbumMultiSelectManager();
    m.toggle('album', 'a', order);
    expect(m.has('album', 'a')).toBe(true);
    expect(m.has('folder', 'a')).toBe(false);
    expect(m.has('album', 'b')).toBe(false);
  });

  // I-2 — isCandidate() drives Task 11's Shift-hover highlight.
  it('isCandidate() reflects the current preview', () => {
    const m = new SpaceAlbumMultiSelectManager();
    m.toggle('album', 'a', order);
    m.previewRange('album', 'c', order);
    expect(m.isCandidate('b')).toBe(true);
    expect(m.isCandidate('c')).toBe(true);
    expect(m.isCandidate('a')).toBe(false);
    expect(m.isCandidate('d')).toBe(false);
  });

  // I-2 — count is Task 12's positive control for its partial-failure test.
  it('count reflects the number of selected ids', () => {
    const m = new SpaceAlbumMultiSelectManager();
    expect(m.count).toBe(0);
    m.toggle('album', 'a', order);
    m.toggle('album', 'b', order);
    expect(m.count).toBe(2);
    m.toggle('album', 'a', order);
    expect(m.count).toBe(1);
  });

  // m-6 — a plain click must clear any pending Shift-hover preview, or a stale highlight paints
  // over cards after the commit.
  it('clears a pending preview when toggle commits a selection', () => {
    const m = new SpaceAlbumMultiSelectManager();
    m.toggle('album', 'a', order);
    m.previewRange('album', 'c', order);
    expect(m.candidates.length).toBeGreaterThan(0);
    m.toggle('album', 'd', order);
    expect(m.candidates).toEqual([]);
  });

  // m-6 — same for selectRange committing a range.
  it('clears a pending preview when selectRange commits a range', () => {
    const m = new SpaceAlbumMultiSelectManager();
    m.toggle('album', 'a', order);
    m.previewRange('album', 'c', order);
    expect(m.candidates.length).toBeGreaterThan(0);
    m.selectRange('album', 'c', order);
    expect(m.candidates).toEqual([]);
  });

  // m-1 — reconcile must also clear a pending preview: isCandidate(id) must not stay true for an
  // id that just disappeared from the page's data.
  it('clears a pending preview when reconciled', () => {
    const m = new SpaceAlbumMultiSelectManager();
    m.toggle('album', 'a', order);
    m.previewRange('album', 'c', order);
    expect(m.candidates.length).toBeGreaterThan(0);
    m.reconcile(order);
    expect(m.candidates).toEqual([]);
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

  // S-8 — m-8: positive control that candidates was non-empty first, so the final assertion
  // can't pass vacuously. Also covers m-3's kind-reset invariant for clear().
  it('clears everything', () => {
    const m = new SpaceAlbumMultiSelectManager();
    m.toggle('album', 'a', order);
    m.previewRange('album', 'c', order);
    expect(m.candidates.length).toBeGreaterThan(0);
    m.clear();
    expect(m.selectionActive).toBe(false);
    expect(m.kind).toBe('none');
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

  // m-3 — reconciling away the entire selection must also reset kind, not just ids.
  it('resets kind to none when reconcile drops the whole selection', () => {
    const m = new SpaceAlbumMultiSelectManager();
    m.toggle('album', 'a', order);
    m.toggle('album', 'b', order);
    expect(m.kind).toBe('album');
    m.reconcile(['c', 'd']);
    expect(m.ids).toEqual([]);
    expect(m.kind).toBe('none');
  });
});

// collection-selection-utils.spec.ts
import { describe, expect, it } from 'vitest';
import { SharedSpaceRole } from '@immich/sdk';
import {
  albumToCollection,
  collectionKey,
  isValidNewSpaceName,
  isWritableSpace,
  pickRecent,
  recencyOf,
  sortByNameAsc,
  spaceToCollection,
} from './collection-selection-utils';

const album = (id: string, name: string, updatedAt = '2024-01-01T00:00:00Z') =>
  ({ id, albumName: name, updatedAt, assetCount: 0, shared: false }) as any;
const space = (id: string, name: string, extra: Record<string, unknown> = {}) =>
  ({ id, name, createdById: 'me', createdAt: '2024-01-01T00:00:00Z', members: [], ...extra }) as any;

describe('collection helpers', () => {
  it('builds discriminated collections with stable keys', () => {
    const a = albumToCollection(album('a1', 'Trip'));
    const s = spaceToCollection(space('s1', 'Trip'));
    expect(a.kind).toBe('album');
    expect(s.kind).toBe('space');
    expect(collectionKey(a)).toBe('album:a1');
    expect(collectionKey(s)).toBe('space:s1');
    // same id across types must not collide
    expect(collectionKey(albumToCollection(album('x', 'A')))).not.toBe(collectionKey(spaceToCollection(space('x', 'A'))));
  });

  it('treats owner and editor as writable, viewer as not', () => {
    expect(isWritableSpace(space('s', 'n', { createdById: 'me' }), 'me')).toBe(true);
    expect(isWritableSpace(space('s', 'n', { createdById: 'other', members: [{ userId: 'me', role: SharedSpaceRole.Editor }] }), 'me')).toBe(true);
    expect(isWritableSpace(space('s', 'n', { createdById: 'other', members: [{ userId: 'me', role: SharedSpaceRole.Viewer }] }), 'me')).toBe(false);
    expect(isWritableSpace(space('s', 'n', { createdById: 'other', members: [] }), 'me')).toBe(false);
    expect(isWritableSpace(space('s', 'n', { createdById: 'other', members: [] }), null)).toBe(false);
  });

  it('ranks recency: album updatedAt, space lastActivityAt ?? createdAt', () => {
    const a = albumToCollection(album('a', 'A', '2024-05-01T00:00:00Z'));
    const sActive = spaceToCollection(space('s1', 'S1', { lastActivityAt: '2024-06-01T00:00:00Z' }));
    const sNoActivity = spaceToCollection(space('s2', 'S2', { lastActivityAt: null, createdAt: '2024-01-01T00:00:00Z' }));
    expect(recencyOf(sActive)).toBeGreaterThan(recencyOf(a));
    expect(recencyOf(a)).toBeGreaterThan(recencyOf(sNoActivity));
    expect(pickRecent([sNoActivity, a, sActive], 2).map((c) => c.id)).toEqual(['s1', 'a']);
  });

  it('sorts by name case-insensitively', () => {
    const list = [spaceToCollection(space('s', 'banana')), albumToCollection(album('a', 'Apple'))];
    expect(sortByNameAsc(list).map((c) => c.name)).toEqual(['Apple', 'banana']);
  });

  it('validates new space names (1..100 chars, trimmed)', () => {
    expect(isValidNewSpaceName('')).toBe(false);
    expect(isValidNewSpaceName('   ')).toBe(false);
    expect(isValidNewSpaceName('Family')).toBe(true);
    expect(isValidNewSpaceName('x'.repeat(101))).toBe(false);
    expect(isValidNewSpaceName('x'.repeat(100))).toBe(true);
  });
});

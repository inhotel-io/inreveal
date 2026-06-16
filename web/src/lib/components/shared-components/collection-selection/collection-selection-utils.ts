// collection-selection-utils.ts
import { normalizeSearchString } from '$lib/utils/string-utils';
import { SharedSpaceRole, type AlbumResponseDto, type SharedSpaceResponseDto } from '@immich/sdk';

export type PickerCollection =
  | { kind: 'album'; id: string; name: string; album: AlbumResponseDto }
  | { kind: 'space'; id: string; name: string; space: SharedSpaceResponseDto };

export const collectionKey = (c: PickerCollection): string => `${c.kind}:${c.id}`;

export const albumToCollection = (album: AlbumResponseDto): PickerCollection => ({
  kind: 'album',
  id: album.id,
  name: album.albumName,
  album,
});

export const spaceToCollection = (space: SharedSpaceResponseDto): PickerCollection => ({
  kind: 'space',
  id: space.id,
  name: space.name,
  space,
});

export const isWritableSpace = (space: SharedSpaceResponseDto, currentUserId: string | null): boolean => {
  if (currentUserId && space.createdById === currentUserId) {
    return true;
  }
  const role = space.members?.find((member) => member.userId === currentUserId)?.role;
  return role === SharedSpaceRole.Owner || role === SharedSpaceRole.Editor;
};

export const recencyOf = (c: PickerCollection): number =>
  c.kind === 'album'
    ? new Date(c.album.updatedAt).getTime()
    : new Date(c.space.lastActivityAt ?? c.space.createdAt).getTime();

export const sortByNameAsc = (collections: PickerCollection[]): PickerCollection[] =>
  [...collections].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

export const pickRecent = (collections: PickerCollection[], limit = 3): PickerCollection[] =>
  [...collections].sort((a, b) => recencyOf(b) - recencyOf(a)).slice(0, limit);

export const isValidNewSpaceName = (name: string): boolean => {
  const trimmed = name.trim();
  return trimmed.length >= 1 && trimmed.length <= 100;
};

// `normalizeSearchString` is re-exported intentionally so the converter (Task 2) and
// row components share one matcher. (Imported above to keep a single source of truth.)
export const matchesSearch = (name: string, search: string): boolean =>
  normalizeSearchString(name).includes(normalizeSearchString(search));

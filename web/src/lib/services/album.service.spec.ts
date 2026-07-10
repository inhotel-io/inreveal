// album.service.spec.ts
import type { AlbumResponseDto } from '@immich/sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SpacePickerModal from '$lib/modals/SpacePickerModal.svelte';
import { handleLinkAlbumToSpace } from './album.service';

const linkAlbum = vi.fn();
const showModal = vi.fn();
const primary = vi.fn();
const handleError = vi.fn();

vi.mock('@immich/sdk', async (orig) => ({
  ...(await orig<typeof import('@immich/sdk')>()),
  linkAlbum: (...a: unknown[]) => linkAlbum(...a),
}));

vi.mock('@immich/ui', async (orig) => ({
  ...(await orig<typeof import('@immich/ui')>()),
  modalManager: { show: (...a: unknown[]) => showModal(...a) },
  toastManager: { primary: (...a: unknown[]) => primary(...a) },
}));

vi.mock('$lib/utils/handle-error', () => ({ handleError: (...a: unknown[]) => handleError(...a) }));

vi.mock('$lib/utils/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/utils/i18n')>()),
  getFormatter: () =>
    Promise.resolve(
      (key: string, opts?: { values?: Record<string, unknown> }) => `${key}:${JSON.stringify(opts?.values ?? {})}`,
    ),
}));

const album = { id: 'album-1', albumName: 'Trip' } as AlbumResponseDto;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('handleLinkAlbumToSpace', () => {
  it('opens the existing space picker', async () => {
    showModal.mockResolvedValue(undefined);
    await handleLinkAlbumToSpace(album);
    expect(showModal).toHaveBeenCalledWith(SpacePickerModal, {});
  });

  it('does nothing and returns false when the picker is dismissed without a selection', async () => {
    showModal.mockResolvedValue(undefined);
    await expect(handleLinkAlbumToSpace(album)).resolves.toBe(false);
    expect(linkAlbum).not.toHaveBeenCalled();
    expect(primary).not.toHaveBeenCalled();
  });

  it('links the album to the picked space, toasts, and returns true', async () => {
    showModal.mockResolvedValue({ id: 'space-1', name: 'Family' });
    linkAlbum.mockResolvedValue(undefined);

    await expect(handleLinkAlbumToSpace(album)).resolves.toBe(true);

    expect(linkAlbum).toHaveBeenCalledWith({ id: 'space-1', albumId: 'album-1' });
    expect(primary).toHaveBeenCalledWith('album_linked_to_space:{"space":"Family"}');
  });

  it('shows an error and returns false when linking fails', async () => {
    showModal.mockResolvedValue({ id: 'space-1', name: 'Family' });
    const error = new Error('network');
    linkAlbum.mockRejectedValue(error);

    await expect(handleLinkAlbumToSpace(album)).resolves.toBe(false);

    expect(handleError).toHaveBeenCalledWith(error, 'spaces_linked_albums_error_link:{}');
  });
});

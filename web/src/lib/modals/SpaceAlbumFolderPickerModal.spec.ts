import type { SharedSpaceAlbumFolderDto } from '@immich/sdk';
import { render, screen } from '@testing-library/svelte';
import SpaceAlbumFolderPickerModal from '$lib/modals/SpaceAlbumFolderPickerModal.svelte';

const folder = (id: string, name: string, parentId: string | null = null) =>
  ({
    id,
    spaceId: 'space-1',
    parentId,
    name,
    createdById: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }) as SharedSpaceAlbumFolderDto;

const folders = [
  folder('trips', 'Trips'),
  folder('y2026', '2026', 'trips'),
  folder('italy', 'Italy', 'y2026'),
  folder('family', 'Family'),
];

// Same drain as SpaceAlbumFolderNameModal.spec: this file mounts the same bits-ui-backed
// FormModal and provably leaves the identical uncleared 24ms cleanup timer behind on unmount.
afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 500));
});

describe('SpaceAlbumFolderPickerModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // W-17: offering a folder's own subtree as a destination would guarantee a 400. Disabling
  // it client-side means the illegal option is never selectable in the first place.
  it('W-17: disables the moved folder and all of its descendants', () => {
    render(SpaceAlbumFolderPickerModal, {
      folders,
      excludeFolderIds: ['trips'],
      currentFolderId: null,
      onClose: vi.fn(),
    });

    expect(screen.getByTestId('folder-option-trips')).toBeDisabled();
    expect(screen.getByTestId('folder-option-y2026')).toBeDisabled();
    expect(screen.getByTestId('folder-option-italy')).toBeDisabled();
    expect(screen.getByTestId('folder-option-family')).toBeEnabled();
  });

  // Moving an ALBUM has no subtree to exclude, so every folder stays selectable.
  it('W-17: leaves every folder selectable when no folder is excluded', () => {
    render(SpaceAlbumFolderPickerModal, {
      folders,
      excludeFolderIds: [],
      currentFolderId: null,
      onClose: vi.fn(),
    });

    for (const id of ['trips', 'y2026', 'italy', 'family']) {
      expect(screen.getByTestId(`folder-option-${id}`)).toBeEnabled();
    }
  });

  // Fix round 1, Minor #2: a bulk folder move excludes EVERY folder in the batch (plus each of
  // their own descendants), not just the first — otherwise a batch containing "family" would
  // still offer "family" itself as a legal destination for the OTHER folders in the same move.
  it('Minor #2: disables every folder in excludeFolderIds and their descendants', () => {
    render(SpaceAlbumFolderPickerModal, {
      folders,
      excludeFolderIds: ['trips', 'family'],
      currentFolderId: null,
      onClose: vi.fn(),
    });

    expect(screen.getByTestId('folder-option-trips')).toBeDisabled();
    expect(screen.getByTestId('folder-option-y2026')).toBeDisabled();
    expect(screen.getByTestId('folder-option-italy')).toBeDisabled();
    expect(screen.getByTestId('folder-option-family')).toBeDisabled();
  });

  it('offers the space root as a destination', () => {
    render(SpaceAlbumFolderPickerModal, {
      folders,
      excludeFolderIds: [],
      currentFolderId: 'trips',
      onClose: vi.fn(),
    });

    expect(screen.getByTestId('folder-option-root')).toBeInTheDocument();
  });
});
